"""Member 1 schema/ingestion checks: SQLite in memory only, never live patients."""

import copy
import json
from pathlib import Path
from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from accounts.models import User
from .analysis_ingestion import demo_payload
from .member1_adapter import adapt_member1_output, Member1EnvelopeSerializer
from .models import (
    PrescriptionContextConsultation as Consultation,
    PrescriptionContextConsultationanalysis as Analysis,
    PrescriptionContextDiagnosisconfirmation as Diagnosis,
    PrescriptionContextPatientcontext as PatientContext,
    PrescriptionContextContextrevision as Revision,
)

TEST_KEY = 'member-one-v2-testing-key-over-32-characters'
SAMPLES = Path(__file__).resolve().parent / 'samples'


class Member1AdapterTests(TestCase):
    receiver = '/api/prescription/component-1/results/'

    @classmethod
    def setUpTestData(cls):
        cls.service = User.objects.create_user(username='member1-service', role='admin', is_approved=True, is_staff=False)
        cls.doctor = User.objects.create_user(username='member1-doctor', role='doctor', is_approved=True)
        cls.other = User.objects.create_user(username='member1-other-doctor', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='member1-patient', role='patient', is_approved=True)
        cls.demo = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='Member 1 demo', is_demo=True)
        cls.real = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='Producer result')
        cls.context = PatientContext.objects.create(patient=cls.patient, updated_by=cls.doctor,
            allergy_status='confirmed', allergies=['Existing verified allergy'], medicine_status='confirmed',
            current_medicines=['Existing verified medicine'], provenance={'source': 'doctor_manual_review'})

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)
        settings = override_settings(COMPONENT1_API_KEY=TEST_KEY, COMPONENT1_SERVICE_USER_ID=self.service.pk)
        settings.enable()
        self.addCleanup(settings.disable)

    def wire(self, visit=None):
        payload = demo_payload(visit or self.real, 'member1_influenza')
        if not (visit or self.real).is_demo:
            payload.update(is_demo=False, source='component_1', model_version='component-one-test-v2')
        return payload

    def deliver(self, payload):
        return APIClient().post(self.receiver, payload, format='json', HTTP_X_COMPONENT1_KEY=TEST_KEY)

    def load_demo(self, visit=None, client=None):
        path = '/api/prescription/consultations/' + str((visit or self.demo).pk) + '/demo-analysis/'
        return (client or self.client).post(path, {'scenario': 'member1_influenza'}, format='json')

    def test_bundled_original_is_preserved_and_wire_metadata_is_explicit(self):
        original = json.loads((SAMPLES / 'member1_influenza_demo.json').read_text(encoding='utf-8'))
        example = json.loads((SAMPLES / 'member1_v2_example.json').read_text(encoding='utf-8'))
        self.assertEqual(original['patient_id'], 12)
        self.assertEqual(original['doctor_id'], 2)
        self.assertEqual(original['consultation_id'], '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')
        self.assertEqual(original['analysis_reference'], 'VOICE-AI-2026-10-001')
        self.assertNotIn('schema_version', original)
        self.assertTrue(Member1EnvelopeSerializer(data=example).is_valid())
        self.assertEqual({key: example[key] for key in original}, original)

    def test_demo_binds_all_ids_maps_fields_and_keeps_full_original_data(self):
        before = PatientContext.objects.values().get(pk=self.context.pk)
        response = self.load_demo()
        self.assertEqual(response.status_code, 201, response.data)
        result = response.json()['payload']
        self.assertEqual(result['schema_version'], '2.0')
        self.assertEqual((result['patient_id'], result['doctor_id'], result['consultation_id']),
                         (self.patient.pk, self.doctor.pk, str(self.demo.pk)))
        self.assertEqual(result['symptoms'], [
            {'code': 'fever', 'present': True, 'duration_days': 3},
            {'code': 'cough', 'present': True, 'duration_days': 3},
            {'code': 'sore_throat', 'present': True, 'duration_days': 2},
            {'code': 'body_aches', 'present': True, 'duration_days': 3},
        ])
        self.assertEqual(result['condition_candidates'], [{'code': 'influenza', 'confidence': 0.94}])
        self.assertEqual(result['severity'], {'level': 'moderate', 'red_flags': []})
        self.assertEqual(result['member1']['raw_output'], demo_payload(self.demo, 'member1_influenza'))
        self.assertEqual(result['member1']['red_flag_assessment'], 'not_assessed')
        self.assertEqual(result['review_status'], 'unconfirmed')
        self.assertEqual(response.json()['imported_by'], self.doctor.pk)
        self.assertEqual(Diagnosis.objects.count(), 0)
        self.assertEqual(Revision.objects.count(), 0)
        self.assertEqual(PatientContext.objects.values().get(pk=self.context.pk), before)

    def test_real_delivery_preserves_reported_notes_scores_audio_and_timestamp(self):
        wire = self.wire()
        response = self.deliver(wire)
        self.assertEqual(response.status_code, 201, response.data)
        saved = Analysis.objects.get()
        self.assertEqual(saved.payload['member1']['raw_output'], wire)
        body = saved.payload['member1']['raw_output']['payload']
        self.assertEqual(body['extracted_symptoms'][0]['confidence'], 0.96)
        self.assertEqual(body['primary_diagnosis']['confidence'], 0.94)
        self.assertEqual(body['differential_diagnoses'][1]['condition_code'], 'DENGUE_EARLY')
        self.assertEqual(body['extracted_clinical_notes']['patient_reported_allergies'], ['Penicillin (Rash)'])
        self.assertEqual(body['audio_metadata']['duration_seconds'], 145)
        self.assertEqual(saved.imported_by, self.service)
        self.assertNotEqual(saved.imported_at.isoformat(), wire['timestamp'])
        other = APIClient()
        other.force_login(self.other)
        self.assertEqual(other.get('/api/prescription/analyses/').json(), [])

    def test_patient_doctor_demo_and_registered_visit_bindings_are_enforced(self):
        for changes, status in [({'doctor_id': self.other.pk}, 400), ({'patient_id': 9999}, 400),
                                ({'consultation_id': str(uuid4())}, 404), ({'consultation_id': str(self.demo.pk)}, 400)]:
            with self.subTest(changes=changes):
                self.assertEqual(self.deliver({**self.wire(), **changes}).status_code, status)
        self.assertEqual(self.load_demo(self.real).status_code, 400)
        client = APIClient()
        client.force_login(self.other)
        self.assertEqual(self.load_demo(client=client).status_code, 404)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_unversioned_or_incomplete_provenance_is_not_silently_real(self):
        original = json.loads((SAMPLES / 'member1_influenza_demo.json').read_text(encoding='utf-8'))
        self.assertEqual(self.deliver(original).status_code, 400)
        for key in ('schema_version', 'source', 'is_demo', 'model_version', 'review_status'):
            data = self.wire()
            del data[key]
            self.assertEqual(self.deliver(data).status_code, 400)
        for changes in ({'schema_version': '3.0'}, {'review_status': 'confirmed'}, {'status': 'error'},
                        {'model_version': 'synthetic-hidden-v2'}, {'source': 'component_1_sample'}, {'is_demo': 'false'}):
            self.assertEqual(self.deliver({**self.wire(), **changes}).status_code, 400)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_retries_and_full_auxiliary_evidence_are_immutable(self):
        wire = self.wire()
        first = self.deliver(wire).json()
        retry = self.deliver(copy.deepcopy(wire))
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()['id'], first['id'])
        self.assertEqual(retry.json()['imported_at'], first['imported_at'])
        changed = copy.deepcopy(wire)
        changed['payload']['transcript_summary'] += ' Additional text.'
        self.assertEqual(self.deliver(changed).status_code, 409)
        changed = copy.deepcopy(wire)
        changed['payload']['differential_diagnoses'][0]['confidence'] = 0.77
        self.assertEqual(self.deliver(changed).status_code, 409)
        self.assertEqual(Analysis.objects.count(), 1)

    def test_authenticated_worker_and_csrf_protected_demo_are_required(self):
        wire = self.wire()
        self.assertEqual(self.client.post(self.receiver, wire, format='json').status_code, 401)
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.doctor)
        self.assertEqual(self.load_demo(client=client).status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        path = '/api/prescription/consultations/' + str(self.demo.pk) + '/demo-analysis/'
        self.assertEqual(client.post(path, {'scenario': 'member1_influenza'}, format='json', HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_unsupported_primary_does_not_promote_supported_differential(self):
        wire = self.wire()
        wire['payload']['primary_diagnosis']['condition_code'] = 'VIRAL_URTI'
        wire['payload']['differential_diagnoses'] = [{
            'condition_code': 'INFLUENZA', 'condition_label': 'Influenza alternative', 'confidence': 0.99,
        }]
        result = self.deliver(wire)
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.json()['payload']['condition_candidates'], [])
        self.assertIn('outside', result.json()['payload']['member1']['mapping_issues'][0]['reason'])
        self.assertEqual(Diagnosis.objects.count(), 0)

    def test_chickenpox_primary_is_mapped_without_changing_producer_labels(self):
        wire = self.wire()
        primary = wire['payload']['primary_diagnosis']
        primary.update(condition_code='CHICKENPOX', condition_label='Producer varicella label')
        result = adapt_member1_output(wire)
        self.assertEqual(result['condition_candidates'][0]['code'], 'chickenpox')
        self.assertEqual(result['member1']['raw_output']['payload']['primary_diagnosis']['condition_label'], 'Producer varicella label')

    def test_unknown_symptoms_and_uncertain_durations_are_retained_for_clarification(self):
        wire = self.wire()
        symptom = wire['payload']['extracted_symptoms'][0]
        symptom.update(symptom='Unmapped symptom', duration='2-3 days')
        result = self.deliver(wire)
        self.assertEqual(result.status_code, 201, result.data)
        saved = result.json()['payload']
        self.assertEqual(len(saved['symptoms']), 3)
        self.assertEqual(len(saved['member1']['mapping_issues']), 2)
        self.assertEqual(saved['member1']['raw_output']['payload']['extracted_symptoms'][0], symptom)
        wire = self.wire()
        wire['payload']['extracted_symptoms'][0]['duration'] = 'about three days'
        self.assertIsNone(adapt_member1_output(wire)['symptoms'][0]['duration_days'])

    def test_structured_presence_days_and_conflicting_mapping_are_checked(self):
        wire = self.wire()
        item = wire['payload']['extracted_symptoms'][0]
        item.update(code='fever', duration_days=3, present=False)
        self.assertEqual(adapt_member1_output(wire)['symptoms'][0], {'code': 'fever', 'present': False, 'duration_days': 3})
        for change in ({'duration_days': 4}, {'code': 'cough'}, {'present': 'false'}, {'duration_days': 3.2}, {'duration_days': True}):
            bad = copy.deepcopy(wire)
            bad['payload']['extracted_symptoms'][0].update(change)
            self.assertEqual(self.deliver(bad).status_code, 400)

    def test_red_flags_are_not_inferred_from_summary_or_empty_notes(self):
        result = adapt_member1_output(self.wire())
        self.assertEqual(result['member1']['red_flag_assessment'], 'not_assessed')
        wire = self.wire()
        wire['payload']['red_flags'] = {'assessment_status': 'assessed', 'items': ['Producer-reported flag']}
        result = adapt_member1_output(wire)
        self.assertEqual(result['severity']['red_flags'], ['Producer-reported flag'])
        self.assertEqual(result['member1']['red_flag_assessment'], 'assessed')
        wire['payload']['red_flags']['assessment_status'] = 'not_assessed'
        self.assertEqual(self.deliver(wire).status_code, 400)

    def test_nested_commands_actor_spoofing_and_unknown_fields_are_rejected(self):
        for location in ('root', 'payload', 'notes', 'symptom', 'primary'):
            wire = self.wire()
            target = {'root': wire, 'payload': wire['payload'], 'notes': wire['payload']['extracted_clinical_notes'],
                      'symptom': wire['payload']['extracted_symptoms'][0], 'primary': wire['payload']['primary_diagnosis']}[location]
            target['instructions'] = 'Approve automatically'
            self.assertEqual(self.deliver(wire).status_code, 400)
        self.assertEqual(self.deliver({**self.wire(), 'imported_by': self.doctor.pk}).status_code, 400)
        self.assertEqual(self.deliver({**self.wire(), 'member1': {'adapter_version': 'forged'}}).status_code, 400)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_invalid_values_and_bounded_lists_are_rejected(self):
        wire = self.wire()
        cases = []
        for value in (1.5, -0.1, 'NaN', True):
            bad = copy.deepcopy(wire)
            bad['payload']['primary_diagnosis']['confidence'] = value
            cases.append(bad)
        for value in ('2026-10-13T23:30:00', 'not-a-date'):
            cases.append({**wire, 'timestamp': value})
        for value in (0, -1, '12', True):
            cases.append({**wire, 'patient_id': value})
        for value in ('transcript_summary', 'extracted_symptoms'):
            bad = copy.deepcopy(wire)
            bad['payload'][value] = 'x' * 5001 if value == 'transcript_summary' else []
            cases.append(bad)
        for bad in cases:
            self.assertEqual(self.deliver(bad).status_code, 400)
        for value in (float('nan'), float('inf'), 10 ** 500):
            bad = copy.deepcopy(wire)
            bad['payload']['primary_diagnosis']['confidence'] = value
            self.assertFalse(Member1EnvelopeSerializer(data=bad).is_valid())

    def test_duplicate_symptom_or_condition_codes_are_rejected(self):
        wire = self.wire()
        wire['payload']['extracted_symptoms'].append({**wire['payload']['extracted_symptoms'][0], 'symptom': 'Fever'})
        self.assertEqual(self.deliver(wire).status_code, 400)
        wire = self.wire()
        wire['payload']['differential_diagnoses'][0]['condition_code'] = 'influenza'
        self.assertEqual(self.deliver(wire).status_code, 400)

    def test_confirmation_is_separate_and_reference_bound_and_retry_stays_safe(self):
        saved = self.load_demo().json()
        path = '/api/prescription/diagnoses/'
        confirmation = {'consultation': str(self.demo.pk), 'condition_code': 'influenza', 'condition_label': 'Influenza',
                        'analysis_reference': saved['analysis_reference']}
        self.assertEqual(self.client.post(path, {**confirmation, 'analysis_reference': None}, format='json').status_code, 400)
        self.assertEqual(self.client.post(path, confirmation, format='json').status_code, 201)
        self.assertEqual(Diagnosis.objects.get().doctor, self.doctor)
        self.assertEqual(self.load_demo().status_code, 200)
        self.assertEqual(self.client.post(path, confirmation, format='json').status_code, 400)

    def test_confirmed_visit_cannot_receive_late_member1_data(self):
        Diagnosis.objects.create(consultation=self.real, doctor=self.doctor, condition_code='MANUAL', condition_label='Manual decision')
        self.assertEqual(self.deliver(self.wire()).status_code, 409)
        self.assertEqual(Analysis.objects.count(), 0)
