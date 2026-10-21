"""Six-condition wire contract and isolation; all records use the in-memory test DB."""

import copy
import json
from pathlib import Path
from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from accounts.models import User
from prescription_drafts.services import pilot_condition
from .analysis_ingestion import demo_payload
from .member1_v21 import (
    BOOLEAN_OBSERVATIONS, HANDOFF_CONDITIONS, SYMPTOM_CODES,
    Member1V21EnvelopeSerializer, adapt_member1_v21,
)
from .models import (
    PrescriptionContextConsultation as Consultation,
    PrescriptionContextConsultationanalysis as Analysis,
    PrescriptionContextDiagnosisconfirmation as Diagnosis,
    PrescriptionContextPatientcontext as PatientContext,
    PrescriptionContextContextrevision as Revision,
)

TEST_KEY = 'six-condition-v21-isolated-test-key-over-32-characters'


class Member1V21Tests(TestCase):
    receiver = '/api/prescription/component-1/results/'

    @classmethod
    def setUpTestData(cls):
        cls.service = User.objects.create_user(username='v21-service', role='admin', is_approved=True)
        cls.doctor = User.objects.create_user(username='v21-doctor', role='doctor', is_approved=True)
        cls.other = User.objects.create_user(username='v21-other', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='v21-patient', role='patient', is_approved=True)
        cls.demo = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='Synthetic v2.1', is_demo=True)
        cls.real = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='Producer test')
        cls.context = PatientContext.objects.create(patient=cls.patient, updated_by=cls.doctor,
            allergy_status='confirmed', allergies=['Verified test allergy'], medicine_status='confirmed',
            current_medicines=['Verified test medicine'], provenance={'source': 'doctor_manual_review'})

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)
        settings = override_settings(COMPONENT1_API_KEY=TEST_KEY, COMPONENT1_SERVICE_USER_ID=self.service.pk)
        settings.enable()
        self.addCleanup(settings.disable)

    def wire(self, condition='influenza', visit=None):
        visit = visit or self.real
        data = demo_payload(visit, 'member1_v21_' + condition)
        if not visit.is_demo:
            data.update(is_demo=False, source='component_1', model_version='producer-test-v2.1')
        return data

    def deliver(self, data):
        return APIClient().post(self.receiver, data, format='json', HTTP_X_COMPONENT1_KEY=TEST_KEY)

    def load(self, condition='influenza', visit=None, client=None, **headers):
        return (client or self.client).post(f'/api/prescription/consultations/{(visit or self.demo).pk}/demo-analysis/',
            {'scenario': 'member1_v21_' + condition}, format='json', **headers)

    def test_all_six_bundled_examples_bind_and_persist_without_other_writes(self):
        before = PatientContext.objects.values().get(pk=self.context.pk)
        for condition in HANDOFF_CONDITIONS:
            with self.subTest(condition=condition):
                visit = Consultation.objects.create(doctor=self.doctor, patient=self.patient, is_demo=True)
                sample = json.loads((Path(__file__).parent / 'samples' / 'member1_v21' / (condition + '.json')).read_text())
                self.assertTrue(sample['is_demo'])
                self.assertTrue(sample['model_version'].startswith('synthetic'))
                response = self.load(condition, visit)
                self.assertEqual(response.status_code, 201, response.data)
                saved = response.json()['payload']
                self.assertEqual(saved['condition_candidates'], [{'code': condition, 'confidence': 0.8}])
                self.assertEqual(saved['member1']['raw_output'], self.wire(condition, visit))
                self.assertEqual(saved['member1']['assessment_review_status'], 'unverified')
                self.assertEqual({s['code'] for s in saved['symptoms']}, SYMPTOM_CODES)
                self.assertEqual((saved['patient_id'], saved['doctor_id'], saved['consultation_id']), (self.patient.pk, self.doctor.pk, str(visit.pk)))
        self.assertEqual(Analysis.objects.count(), 6)
        self.assertEqual(Diagnosis.objects.count(), 0)
        self.assertEqual(Revision.objects.count(), 0)
        self.assertEqual(PatientContext.objects.values().get(pk=self.context.pk), before)

    def test_missing_symptoms_and_assessments_stay_unknown_not_negative(self):
        wire = self.wire()
        wire['payload']['extracted_symptoms'] = []
        del wire['payload']['reported_assessments']
        normalized = adapt_member1_v21(wire)
        self.assertEqual(len(normalized['symptoms']), 12)
        self.assertTrue(all(s['present'] is None and s['duration_hours'] is None for s in normalized['symptoms']))
        facts = normalized['member1']['reported_assessments']
        self.assertTrue(all(facts[key] is None for key in BOOLEAN_OBSERVATIONS))
        self.assertEqual(facts['dehydration_assessment'], 'unknown')
        self.assertEqual(facts['oral_fluid_tolerance'], 'unknown')
        self.assertIsNone(facts['reported_weight_kg'])
        self.assertEqual(normalized['severity']['red_flags'], [])
        self.assertEqual(normalized['member1']['red_flag_assessment'], 'not_assessed')

    def test_omitted_presence_never_becomes_present_from_duration(self):
        wire = self.wire()
        del wire['payload']['extracted_symptoms'][0]['present']
        result = adapt_member1_v21(wire)
        self.assertEqual(result['symptoms'][0], {'code': 'fever', 'present': None, 'duration_hours': None, 'duration_days': None})
        self.assertTrue(any('presence is unknown' in x['reason'] for x in result['member1']['mapping_issues']))

    def test_hours_days_fractional_and_ambiguous_durations(self):
        for text, hours, days in [('1 hour', 1, None), ('1.5 days', 36, None), ('2 days', 48, 2), ('about 2 days', None, None)]:
            wire = self.wire()
            wire['payload']['extracted_symptoms'][0]['duration'] = text
            result = adapt_member1_v21(wire)['symptoms'][0]
            self.assertEqual((result['duration_hours'], result['duration_days']), (hours, days))
        wire['payload']['extracted_symptoms'][0].update(duration_hours=15)
        self.assertEqual(adapt_member1_v21(wire)['symptoms'][0]['duration_hours'], 15)

    def test_absent_is_distinct_and_conflicting_or_invalid_durations_fail(self):
        wire = self.wire('mumps')
        self.assertFalse(adapt_member1_v21(wire)['symptoms'][1]['present'])
        for change in ({'duration_hours': 13}, {'duration_days': 1}, {'duration_hours': True},
                       {'duration_hours': -1}, {'duration_days': 0.5}, {'present': False}):
            bad = self.wire()
            bad['payload']['extracted_symptoms'][0].update(change)
            self.assertFalse(Member1V21EnvelopeSerializer(data=bad).is_valid(), change)

    def test_reported_facts_round_trip_json_with_units_and_unverified_provenance(self):
        wire = self.wire('viral_gastroenteritis')
        facts = wire['payload']['reported_assessments']
        facts.update(reported_weight_kg=65.5, weight_recorded_at='2026-10-16T09:00:00+05:30',
                     oral_fluid_tolerance='not_tolerated', dehydration_assessment='moderate',
                     ors_product_name='Unverified synthetic product name')
        response = self.deliver(wire)
        self.assertEqual(response.status_code, 201, response.data)
        stored = Analysis.objects.get().payload['member1']
        self.assertEqual(stored['assessment_review_status'], 'unverified')
        self.assertEqual(stored['reported_assessments']['reported_weight_kg'], 65.5)
        self.assertEqual(stored['raw_output'], wire)
        self.assertIsInstance(stored['reported_assessments']['weight_recorded_at'], str)
        self.assertEqual(Diagnosis.objects.count(), 0)

    def test_positive_reported_concerns_are_retained_without_fake_assessment(self):
        wire = self.wire()
        wire['payload']['reported_assessments'].update(hydration_concern=True, respiratory_concern=False)
        result = adapt_member1_v21(wire)
        self.assertEqual(result['severity']['red_flags'], ['Reported hydration concern (unverified source)'])
        self.assertEqual(result['member1']['red_flag_assessment'], 'not_assessed')

    def test_unknown_primary_and_symptoms_do_not_promote_differentials(self):
        wire = self.wire()
        wire['payload']['primary_diagnosis']['condition_code'] = 'UNSUPPORTED'
        wire['payload']['differential_diagnoses'] = [{'condition_code': 'MEASLES', 'condition_label': 'Alternative', 'confidence': 0.99}]
        wire['payload']['extracted_symptoms'] = [{'symptom': 'Novel term', 'code': 'novel_term', 'present': True, 'severity': 'unknown', 'confidence': 0.5}]
        result = adapt_member1_v21(wire)
        self.assertEqual(result['condition_candidates'], [])
        self.assertTrue(all(s['present'] is None for s in result['symptoms']))
        self.assertEqual(result['member1']['raw_output'], wire)

    def test_duplicate_aliases_and_conflicting_identities_fail(self):
        for change in ('duplicate', 'conflict', 'diagnosis'):
            wire = self.wire()
            if change == 'duplicate':
                wire['payload']['extracted_symptoms'].append({**wire['payload']['extracted_symptoms'][0], 'symptom': 'Fever'})
            elif change == 'conflict':
                wire['payload']['extracted_symptoms'][0]['code'] = 'rash'
            else:
                wire['payload']['differential_diagnoses'] = [{'condition_code': 'influenza', 'condition_label': 'Duplicate', 'confidence': 0.5}]
            self.assertEqual(self.deliver(wire).status_code, 400)

    def test_fact_types_bounds_offsets_unknown_fields_and_review_spoofing_fail(self):
        cases = [{'eye_pain': 'false'}, {'eye_pain': 0}, {'dehydration_assessment': None},
                 {'oral_fluid_tolerance': 'safe'}, {'reported_weight_kg': 0}, {'reported_weight_kg': 351},
                 {'reported_onset_hours': -1}, {'reported_onset_hours': True},
                 {'weight_recorded_at': '2026-10-16T00:00:00Z'},
                 {'reported_weight_kg': 60, 'weight_recorded_at': '2026-10-16T00:00:00'},
                 {'reviewed': True}, {'reviewer_id': self.doctor.pk}, {'instructions': 'Clear safety'}]
        for changes in cases:
            wire = self.wire()
            wire['payload']['reported_assessments'].update(changes)
            self.assertEqual(self.deliver(wire).status_code, 400, changes)
        for value in (float('nan'), float('inf'), 10 ** 500):
            wire = self.wire()
            wire['payload']['reported_assessments']['reported_onset_hours'] = value
            self.assertFalse(Member1V21EnvelopeSerializer(data=wire).is_valid())
        wire = self.wire()
        wire['payload']['clinical_review_status'] = 'approved'
        self.assertEqual(self.deliver(wire).status_code, 400)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_bindings_source_and_real_demo_boundaries(self):
        for changes, status in [({'patient_id': 9999}, 400), ({'doctor_id': self.other.pk}, 400),
                                ({'consultation_id': str(uuid4())}, 404), ({'consultation_id': str(self.demo.pk)}, 400),
                                ({'source': 'component_1_sample'}, 400), ({'model_version': 'synthetic-hidden'}, 400)]:
            self.assertEqual(self.deliver({**self.wire(), **changes}).status_code, status)
        self.assertEqual(self.load(visit=self.real).status_code, 400)
        other = APIClient()
        other.force_login(self.other)
        self.assertEqual(self.load(client=other).status_code, 404)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_worker_authentication_and_demo_csrf_are_still_required(self):
        self.assertEqual(self.client.post(self.receiver, self.wire(), format='json').status_code, 401)
        self.assertEqual(APIClient().post(self.receiver, self.wire(), format='json', HTTP_X_COMPONENT1_KEY='wrong').status_code, 401)
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.doctor)
        self.assertEqual(self.load(client=client).status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        self.assertEqual(self.load(client=client, HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_immutable_retries_after_confirmation_and_new_condition_medicine_gate(self):
        for condition in HANDOFF_CONDITIONS[2:]:
            visit = Consultation.objects.create(doctor=self.doctor, patient=self.patient, is_demo=True)
            first = self.load(condition, visit)
            self.assertEqual(first.status_code, 201)
            confirmation = {'consultation': str(visit.pk), 'condition_code': condition, 'condition_label': condition.replace('_', ' '),
                            'analysis_reference': first.json()['analysis_reference']}
            response = self.client.post('/api/prescription/diagnoses/', confirmation, format='json')
            self.assertEqual(response.status_code, 201, response.data)
            self.assertEqual(self.load(condition, visit).status_code, 200)
            diagnosis = Diagnosis.objects.get(pk=response.json()['id'])
            with self.assertRaises(ValidationError):
                pilot_condition(diagnosis)
            changed = self.wire(condition, visit)
            changed['payload']['reported_assessments']['hydration_concern'] = True
            self.assertEqual(self.deliver(changed).status_code, 409)
            self.assertEqual(Analysis.objects.get(consultation=visit).payload, first.json()['payload'])
        self.assertEqual(Revision.objects.count(), 0)

    def test_pending_handoff_does_not_claim_treatment_or_model_coverage(self):
        for condition in HANDOFF_CONDITIONS[2:]:
            result = adapt_member1_v21(self.wire(condition))
            self.assertFalse(any('not enabled' in issue['reason'] for issue in result['member1']['mapping_issues']))
            self.assertEqual(result['condition_candidates'][0]['code'], condition)
            self.assertEqual(result['review_status'], 'unconfirmed')

    def test_retry_of_legacy_warning_preserves_the_original_analysis(self):
        first = self.load('mumps')
        self.assertEqual(first.status_code, 201, first.data)
        row = Analysis.objects.get(consultation=self.demo)
        obsolete = {'field': 'payload.primary_diagnosis.condition_code', 'reason': 'Analysis handoff is supported; medicine rules and the trained prescription model for this condition are not enabled.'}
        row.payload['member1']['mapping_issues'].append(obsolete)
        row.save()
        original = copy.deepcopy(row.payload)
        self.assertEqual(self.load('mumps').status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.payload, original, 'Historical provenance must not be rewritten by a retry')
        changed = self.wire('mumps', self.demo)
        changed['payload']['reported_assessments']['hydration_concern'] = True
        self.assertEqual(self.deliver(changed).status_code, 409, 'Ignoring one obsolete warning cannot permit changed source facts')
