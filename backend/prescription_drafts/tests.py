from copy import deepcopy
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from medicine_knowledge.models import MedicineEntry, content_digest
from medicine_knowledge.services import seed_catalogue
from prescription_context.analysis_ingestion import demo_payload, ingest_analysis
from prescription_context.models import (
    PrescriptionContextConsultation as Consultation, PrescriptionContextDiagnosisconfirmation as Diagnosis,
    PrescriptionContextPatientcontext as Context,
)
from .models import SafetyProfile, SafetyReview, PrescriptionDraft
from .profiles import seed_profiles, engine_digest
from .services import freshness_reason


class DraftWorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='draft-doctor', role='doctor', is_approved=True)
        cls.other = User.objects.create_user(username='draft-other', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='draft-patient', role='patient', is_approved=True, birthday=date(1990, 1, 1))
        cls.visit = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='Screening fixture', is_demo=True)
        analysis, _ = ingest_analysis(demo_payload(cls.visit, 'influenza'), cls.doctor, mode='demo')
        cls.diagnosis = Diagnosis.objects.create(consultation=cls.visit, doctor=cls.doctor, condition_code='influenza', condition_label='Influenza', analysis_reference=analysis.analysis_reference)
        cls.context = Context.objects.create(patient=cls.patient, updated_by=cls.doctor, allergy_status='none', medicine_status='none',
            provenance={'last_reviewed_consultation': str(cls.visit.pk), 'last_reviewed_by': cls.doctor.pk})
        seed_catalogue()
        seed_profiles()
        # Explicit clinician fixture decisions, only in the isolated test database.
        for entry in MedicineEntry.objects.all():
            entry.review_status = 'reviewed'; entry.reviewed_by = cls.doctor; entry.reviewed_at = timezone.now()
            entry.reviewed_content_hash = entry.content_hash; entry.save()
        for profile in SafetyProfile.objects.all():
            profile.review_status = 'reviewed'; profile.reviewed_by = cls.doctor; profile.reviewed_at = timezone.now()
            profile.reviewed_content_hash = profile.content_hash; profile.reviewed_engine_hash = engine_digest(); profile.save()

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)
        self.context.refresh_from_db()
        self.patient.refresh_from_db()
        self.diagnosis.refresh_from_db()
        self.path = '/api/prescription/drafts/generate/' + str(self.visit.pk) + '/'

    def body(self, **changes):
        return {'request_key': str(uuid4()), 'diagnosis_id': self.diagnosis.pk,
            'expected_context_updated_at': self.context.updated_at.isoformat(), 'expected_latest_revision': 0,
            'clinical': {'reviewed': True, 'onset_hours': '24.0', 'red_flags': 'none', 'renal_assessment': 'standard',
                         'hepatic_assessment': 'standard', 'special_population': 'standard', 'varicella_risk': 'unknown',
                         'laiv_timing': 'no_conflict', 'weight_kg': None},
            'proposals': [{'medicine_id': 'oseltamivir-75mg-capsule', 'dose': {'amount': '75', 'unit': 'mg', 'doses_per_day': 2, 'duration_days': 5, 'route': 'oral'}}], **changes}

    def generate(self, body=None):
        return self.client.post(self.path, body or self.body(), format='json')

    def candidate(self, response, medicine='oseltamivir-75mg-capsule'):
        self.assertIn(response.status_code, (200, 201), response.data)
        return next(item for item in response.json()['result']['candidates'] if item['medicine_id'] == medicine)

    def category(self, candidate, name):
        return next(item for item in candidate['checks'] if item['category'] == name)

    def update_context(self, **changes):
        for key, value in changes.items():
            setattr(self.context, key, value)
        self.context.save()

    def test_generation_persists_scoped_unapproved_snapshot_and_registered_age(self):
        original = Context.objects.values().get(pk=self.context.pk)
        response = self.generate()
        candidate = self.candidate(response)
        self.assertEqual(self.category(candidate, 'dose')['status'], 'passed')
        self.assertEqual(candidate['screening_status'], 'warning')
        record = response.json()
        self.assertFalse(record['result']['approved']); self.assertFalse(record['result']['published'])
        self.assertEqual(record['result']['mode'], 'rules_only_unranked')
        self.assertTrue(record['current_state']['is_current'])
        self.assertEqual(record['snapshot']['patient']['birthday'], '1990-01-01')
        self.assertEqual(record['doctor'], self.doctor.pk)
        self.assertEqual(record['patient'], self.patient.pk)
        self.assertEqual(record['snapshot']['context']['provenance']['last_reviewed_by'], self.doctor.pk)
        self.assertEqual(Context.objects.values().get(pk=self.context.pk), original)
        self.assertEqual(self.client.get('/api/prescription/drafts/').json()[0]['id'], record['id'])
        self.assertEqual(self.client.get('/api/prescription/drafts/')['Cache-Control'], 'no-store')

    def test_exact_retries_are_idempotent_and_changed_key_body_conflicts(self):
        body = self.body()
        first = self.generate(body)
        retry = self.generate(body)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()['id'], first.json()['id'])
        self.assertEqual(retry.json()['created_at'], first.json()['created_at'])
        body['clinical']['onset_hours'] = '20'
        self.assertEqual(self.generate(body).status_code, 409)
        self.assertEqual(PrescriptionDraft.objects.count(), 1)

    def test_edit_creates_immutable_revision_and_stale_revision_is_rejected(self):
        self.generate()
        stale = self.body()
        self.assertEqual(self.generate(stale).status_code, 409)
        body = self.body(expected_latest_revision=1)
        body['proposals'][0]['dose']['doses_per_day'] = 1
        second = self.generate(body)
        self.assertEqual(second.status_code, 201, second.data)
        self.assertEqual(second.json()['revision'], 2)
        self.assertEqual(self.category(self.candidate(second), 'dose')['status'], 'blocked')
        first = PrescriptionDraft.objects.get(revision=1)
        self.assertEqual(first.result['candidates'][0]['checks'][-2]['category'], 'dose')
        self.assertIsNotNone(freshness_reason(first))
        self.assertEqual(PrescriptionDraft.objects.count(), 2)

    def test_generation_requires_diagnosis_current_context_and_own_visit(self):
        self.assertEqual(self.generate(self.body(diagnosis_id=9999)).status_code, 400)
        bad = self.body(expected_context_updated_at='2000-01-01T00:00:00Z')
        self.assertEqual(self.generate(bad).status_code, 409)
        self.update_context(provenance={'last_reviewed_consultation': str(uuid4()), 'last_reviewed_by': self.doctor.pk})
        self.assertEqual(self.generate().status_code, 400)
        self.client.force_login(self.other)
        self.assertEqual(self.generate().status_code, 404)
        self.assertEqual(PrescriptionDraft.objects.count(), 0)

    def test_unknown_information_is_not_treated_as_none(self):
        self.update_context(allergy_status='unknown', medicine_status='unknown')
        body = self.body(); body['clinical'].update(red_flags='unknown', renal_assessment='unknown', special_population='unknown', onset_hours=None, laiv_timing='unknown')
        candidate = self.candidate(self.generate(body))
        for category in ('allergy', 'interaction', 'renal', 'clinical_scope', 'special_population', 'onset', 'vaccine_interaction', 'dose'):
            self.assertEqual(self.category(candidate, category)['status'], 'cannot_validate')
        self.assertEqual(candidate['screening_status'], 'cannot_validate')

    def test_known_allergy_matches_and_unmapped_allergy_requires_clarification(self):
        self.update_context(allergy_status='confirmed', allergies=['Oseltamivir (Rash)'])
        self.assertEqual(self.category(self.candidate(self.generate()), 'allergy')['status'], 'blocked')
        self.update_context(allergies=['Penicillin (Rash)'])
        response = self.generate(self.body(expected_latest_revision=1))
        self.assertEqual(self.category(self.candidate(response), 'allergy')['status'], 'cannot_validate')

    def test_ingredient_duplicates_and_unresolved_current_medicines_are_exposed(self):
        self.update_context(medicine_status='confirmed', current_medicines=['Tamiflu'])
        candidate = self.candidate(self.generate())
        self.assertEqual(self.category(candidate, 'duplicate_ingredient')['status'], 'blocked')
        self.update_context(current_medicines=['Unknown tablet 10mg'])
        candidate = self.candidate(self.generate(self.body(expected_latest_revision=1)))
        self.assertEqual(self.category(candidate, 'duplicate_ingredient')['status'], 'cannot_validate')
        self.assertEqual(self.category(candidate, 'interaction')['status'], 'cannot_validate')

    def test_numeric_dose_units_frequency_and_duration_boundaries(self):
        for index, (amount, unit, frequency, duration, expected) in enumerate([
            ('0.075', 'g', 2, 5, 'passed'), ('75', 'mg', 1, 5, 'blocked'),
            ('76', 'mg', 2, 5, 'blocked'), ('75', 'mg', 2, 6, 'blocked'), ('12.5', 'mL', 2, 5, 'cannot_validate'),
        ]):
            body = self.body(expected_latest_revision=index)
            body['proposals'][0]['dose'].update(amount=amount, unit=unit, doses_per_day=frequency, duration_days=duration)
            self.assertEqual(self.category(self.candidate(self.generate(body)), 'dose')['status'], expected)

    def test_pediatric_weight_and_formulation_boundaries_do_not_assume_adult_dose(self):
        self.patient.birthday = date(timezone.now().year - 10, 1, 1); self.patient.save(update_fields=['birthday'])
        for index, (weight, expected) in enumerate([(None, 'cannot_validate'), ('40.0', 'cannot_validate'), ('40.1', 'passed')]):
            body = self.body(expected_latest_revision=index); body['clinical']['weight_kg'] = weight
            self.assertEqual(self.category(self.candidate(self.generate(body)), 'dose')['status'], expected)

    def test_missing_registered_dob_never_uses_cached_context_age(self):
        self.patient.birthday = None; self.patient.save(update_fields=['birthday'])
        self.update_context(date_of_birth=date(1970, 1, 1))
        response = self.generate()
        self.assertIsNone(response.json()['snapshot']['patient']['age_years'])
        self.assertEqual(self.category(self.candidate(response), 'dose')['status'], 'cannot_validate')

    def test_onset_window_is_scope_not_automatic_drug_prohibition(self):
        body = self.body(); body['clinical']['onset_hours'] = '48.1'
        candidate = self.candidate(self.generate(body))
        self.assertEqual(self.category(candidate, 'onset')['status'], 'cannot_validate')
        self.assertEqual(self.category(candidate, 'dose')['status'], 'passed')

    def test_pending_or_stale_reviews_cannot_enter_executable_screening(self):
        SafetyProfile.objects.update(review_status='pending')
        self.assertEqual(self.generate().status_code, 400)
        self.assertEqual(PrescriptionDraft.objects.count(), 0)

    def test_chickenpox_risk_group_cross_allergy_and_pediatric_dose_boundaries(self):
        self.diagnosis.condition_code = 'chickenpox'; self.diagnosis.condition_label = 'Chickenpox'
        self.diagnosis.save(update_fields=['condition_code', 'condition_label'])
        self.patient.birthday = date(timezone.now().year - 10, 1, 1); self.patient.save(update_fields=['birthday'])
        for index, (weight, risk, expected) in enumerate([
            (None, 'risk_group_confirmed', 'cannot_validate'), ('39.9', 'risk_group_confirmed', 'cannot_validate'),
            ('40.0', 'risk_group_confirmed', 'passed'), ('40.1', 'risk_group_confirmed', 'passed'),
            ('40.1', 'typical_uncomplicated_child', 'passed'),
        ]):
            body = self.body(expected_latest_revision=index)
            body['clinical'].update(onset_hours='24', weight_kg=weight, varicella_risk=risk)
            body['proposals'] = [{'medicine_id': 'acyclovir-800mg-tablet', 'dose': {'amount': '800', 'unit': 'mg', 'doses_per_day': 4, 'duration_days': 5, 'route': 'oral'}}]
            candidate = self.candidate(self.generate(body), 'acyclovir-800mg-tablet')
            self.assertEqual(self.category(candidate, 'dose')['status'], expected)
            self.assertEqual(self.category(candidate, 'indication_scope')['status'], 'blocked' if risk == 'typical_uncomplicated_child' else 'passed')
        self.update_context(allergy_status='confirmed', allergies=['Valacyclovir (Rash)'])
        body = self.body(expected_latest_revision=5); body['clinical'].update(onset_hours='24.1', weight_kg='40.1', varicella_risk='risk_group_confirmed')
        body['proposals'] = []
        candidate = self.candidate(self.generate(body), 'acyclovir-800mg-tablet')
        self.assertEqual(self.category(candidate, 'allergy')['status'], 'blocked')
        self.assertEqual(self.category(candidate, 'onset')['status'], 'cannot_validate')

    def test_symptom_relief_requires_verified_patient_scope(self):
        body = self.body()
        body['proposals'] = [{'medicine_id': 'paracetamol-500mg-tablet', 'dose': {'amount': '500', 'unit': 'mg', 'doses_per_day': 1, 'duration_days': 1, 'route': 'oral'}}]
        candidate = self.candidate(self.generate(body), 'paracetamol-500mg-tablet')
        self.assertEqual(self.category(candidate, 'dose')['status'], 'cannot_validate')
        self.assertIn('source_sections', candidate)

    def test_changed_inputs_knowledge_engine_and_reviewer_invalidate_draft(self):
        self.generate()
        draft = PrescriptionDraft.objects.get()
        self.assertIsNone(freshness_reason(draft))
        self.update_context(allergies=['New record'], allergy_status='confirmed')
        self.assertIsNotNone(freshness_reason(draft))
        self.context.updated_at = timezone.datetime.fromisoformat(draft.snapshot['context']['updated_at'])
        Context.objects.filter(pk=self.context.pk).update(updated_at=self.context.updated_at)
        with patch('prescription_drafts.services.engine_digest', return_value='changed-engine'):
            self.assertIsNotNone(freshness_reason(draft))
        self.doctor.is_approved = False; self.doctor.save(update_fields=['is_approved'])
        self.assertIsNotNone(freshness_reason(draft))

    def test_unsupported_diagnosis_and_forged_patient_actor_or_results_are_rejected(self):
        for key in ('doctor', 'patient', 'result', 'approved'):
            self.assertEqual(self.generate({**self.body(), key: 999}).status_code, 400)
        self.diagnosis.condition_code = 'DENGUE_EARLY'; self.diagnosis.save(update_fields=['condition_code'])
        self.assertEqual(self.generate().status_code, 400)
        self.assertEqual(PrescriptionDraft.objects.count(), 0)

    def test_normalization_evidence_and_snapshot_survive_failed_save(self):
        with patch('prescription_drafts.services.PrescriptionDraft.objects.create', side_effect=RuntimeError('save failure')):
            with self.assertRaises(RuntimeError):
                self.generate()
        self.assertEqual(PrescriptionDraft.objects.count(), 0)
        self.assertEqual(Context.objects.get(pk=self.context.pk).allergy_status, 'none')

    def test_routes_are_role_scoped_read_only_and_csrf_protected(self):
        saved = self.generate().json()
        for role in ('patient', 'admin', 'lab'):
            client = APIClient(); user = User.objects.create_user(username='draft-denied-' + role, role=role, is_approved=True); client.force_login(user)
            self.assertEqual(client.get('/api/prescription/drafts/').status_code, 403)
            self.assertEqual(client.get('/api/prescription/safety-profiles/').status_code, 403)
        other = APIClient(); other.force_login(self.other)
        self.assertEqual(other.get('/api/prescription/drafts/').json(), [])
        self.assertEqual(other.get('/api/prescription/drafts/' + saved['id'] + '/').status_code, 404)
        self.assertEqual(self.client.patch('/api/prescription/drafts/' + saved['id'] + '/', {'approved': True}, format='json').status_code, 405)
        client = APIClient(enforce_csrf_checks=True); client.force_login(self.doctor)
        self.assertEqual(client.post(self.path, self.body(expected_latest_revision=1), format='json').status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        self.assertEqual(client.post(self.path, self.body(expected_latest_revision=1), format='json', HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_clinical_review_and_consistent_proposed_fields_are_required(self):
        body = self.body(); body['clinical']['reviewed'] = False
        self.assertEqual(self.generate(body).status_code, 400)
        body = self.body(); body['proposals'][0]['dose']['amount'] = 'NaN'
        self.assertEqual(self.generate(body).status_code, 400)
        body = self.body(); body['proposals'].append(deepcopy(body['proposals'][0]))
        self.assertEqual(self.generate(body).status_code, 400)

    def preview(self, body=None):
        body = body or self.body()
        data = {key: body[key] for key in ('diagnosis_id', 'expected_context_updated_at', 'clinical')}
        data['clinical'] = {**data['clinical'], 'reviewed': False}
        return self.client.post('/api/prescription/drafts/regimens/' + str(self.visit.pk) + '/', data, format='json')

    def suggestion(self, response, medicine='oseltamivir-75mg-capsule'):
        self.assertEqual(response.status_code, 200, response.data)
        return next(item for item in response.json()['suggestions'] if item['medicine_id'] == medicine)

    def test_regimen_preview_uses_reviewed_rules_without_writing_or_acknowledging(self):
        context = Context.objects.values().get(pk=self.context.pk)
        reviews = SafetyReview.objects.count()
        response = self.preview()
        suggestion = self.suggestion(response)
        self.assertEqual(suggestion['status'], 'suggested')
        self.assertEqual(suggestion['dose'], {'amount': '75', 'unit': 'mg', 'doses_per_day': 2, 'duration_days': 5, 'route': 'oral'})
        self.assertTrue(suggestion['review_required'])
        self.assertFalse(response.json()['approved']); self.assertFalse(response.json()['published'])
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(PrescriptionDraft.objects.count(), 0)
        self.assertEqual(SafetyReview.objects.count(), reviews)
        self.assertEqual(Context.objects.values().get(pk=self.context.pk), context)
        self.assertEqual(self.suggestion(self.preview())['dose'], suggestion['dose'])
        self.assertEqual(self.suggestion(response, 'paracetamol-500mg-tablet')['status'], 'unavailable')
        self.assertIn('Review the symptom targets', self.suggestion(response, 'paracetamol-500mg-tablet')['reasons'][-1]['message'])

    def test_auto_regimens_withheld_for_missing_out_of_scope_or_caution_context(self):
        for changes in ({'onset_hours': None}, {'onset_hours': '48.1'}, {'renal_assessment': 'unknown'},
                        {'renal_assessment': 'requires_adjustment'}, {'red_flags': 'present'}, {'red_flags': 'unknown'},
                        {'special_population': 'unknown'}, {'special_population': 'requires_review'},
                        {'laiv_timing': 'unknown'}, {'laiv_timing': 'requires_review'}):
            body = self.body(); body['clinical'].update(changes)
            with self.subTest(changes=changes):
                row = self.suggestion(self.preview(body))
                self.assertEqual(row['status'], 'unavailable'); self.assertIsNone(row['dose']); self.assertTrue(row['reasons'])

    def test_auto_regimens_withheld_for_allergy_duplicate_and_unresolved_medicines(self):
        for changes in ({'allergy_status': 'unknown'}, {'allergy_status': 'confirmed', 'allergies': ['Oseltamivir (Rash)']},
                        {'allergy_status': 'confirmed', 'allergies': ['Penicillin (Rash)']},
                        {'allergy_status': 'none', 'allergies': [], 'medicine_status': 'unknown'},
                        {'medicine_status': 'confirmed', 'current_medicines': ['Tamiflu']},
                        {'medicine_status': 'confirmed', 'current_medicines': ['Unknown tablet']}):
            self.update_context(**changes)
            row = self.suggestion(self.preview())
            self.assertIsNone(row['dose']); self.assertTrue(row['reasons'])

    def test_automatic_pediatric_regimen_requires_dob_measured_weight_and_exact_product(self):
        self.patient.birthday = None; self.patient.save(update_fields=['birthday'])
        self.update_context(date_of_birth=date(1990, 1, 1), weight='65', weight_unit='kg')
        self.assertIsNone(self.suggestion(self.preview())['dose'])
        self.patient.birthday = date(timezone.now().year - 10, 1, 1); self.patient.save(update_fields=['birthday'])
        for weight, available in ((None, False), ('15', False), ('23', False), ('40', False), ('40.1', True)):
            body = self.body(); body['clinical']['weight_kg'] = weight
            row = self.suggestion(self.preview(body))
            self.assertEqual(row['dose'] is not None, available)
            if weight is None:
                self.assertTrue(any('Measured weight is required' in item['message'] for item in row['reasons']))
            elif not available:
                self.assertTrue(any('different reviewed strength/formulation' in item['message'] for item in row['reasons']))

    def test_acyclovir_automatic_regimen_requires_varicella_indication_and_window(self):
        self.diagnosis.condition_code = 'chickenpox'; self.diagnosis.condition_label = 'Chickenpox'
        self.diagnosis.save(update_fields=['condition_code', 'condition_label'])
        body = self.body(); body['clinical'].update(varicella_risk='risk_group_confirmed', onset_hours='24')
        self.assertEqual(self.suggestion(self.preview(body), 'acyclovir-800mg-tablet')['dose'],
                         {'amount': '800', 'unit': 'mg', 'doses_per_day': 4, 'duration_days': 5, 'route': 'oral'})
        self.assertIsNone(self.suggestion(self.preview(body), 'calamine-zinc-oxide-lotion')['dose'])
        for changes in ({'varicella_risk': 'unknown'}, {'varicella_risk': 'typical_uncomplicated_child'}, {'onset_hours': '24.1'}):
            body['clinical'].update(changes)
            self.assertIsNone(self.suggestion(self.preview(body), 'acyclovir-800mg-tablet')['dose'])

    def test_automatic_origin_is_recomputed_and_archived_after_clinician_acknowledgement(self):
        body = self.body(); body['proposals'][0]['origin'] = 'rule_suggestion'
        body['clinical']['reviewed'] = False
        self.assertEqual(self.generate(body).status_code, 400)
        body['clinical']['reviewed'] = True
        response = self.generate(body)
        self.assertEqual(self.candidate(response)['regimen_origin'], 'rule_suggestion')
        self.assertEqual(response.json()['snapshot']['proposals'][0]['origin'], 'rule_suggestion')
        self.assertIn('regimen_suggestions', response.json()['snapshot'])
        self.assertEqual(self.generate(body).status_code, 200)
        changed = self.body(expected_latest_revision=1); changed['proposals'][0]['origin'] = 'rule_suggestion'
        changed['clinical']['onset_hours'] = '72'
        self.assertEqual(self.generate(changed).status_code, 409)
        changed['clinical']['onset_hours'] = '24'; changed['proposals'][0]['dose']['amount'] = '0.003'
        self.assertEqual(self.generate(changed).status_code, 409)
        self.assertEqual(PrescriptionDraft.objects.count(), 1)

    def test_preview_role_csrf_stale_context_and_forged_fields(self):
        path = '/api/prescription/drafts/regimens/' + str(self.visit.pk) + '/'
        body = self.body(); data = {key: body[key] for key in ('diagnosis_id', 'expected_context_updated_at', 'clinical')}
        self.assertEqual(self.client.post(path, {**data, 'patient_id': 999}, format='json').status_code, 400)
        self.assertEqual(self.client.post(path, {**data, 'expected_context_updated_at': '2000-01-01T00:00:00Z'}, format='json').status_code, 409)
        other = APIClient(); other.force_login(self.other)
        self.assertEqual(other.post(path, data, format='json').status_code, 404)
        self.client.force_login(self.patient)
        self.assertEqual(self.client.post(path, data, format='json').status_code, 403)
        protected = APIClient(enforce_csrf_checks=True); protected.force_login(self.doctor)
        self.assertEqual(protected.post(path, data, format='json').status_code, 403)
        token = protected.get('/session/').json()['csrfToken']
        self.assertEqual(protected.post(path, data, format='json', HTTP_X_CSRFTOKEN=token).status_code, 200)
        self.client.force_login(self.doctor); SafetyProfile.objects.update(review_status='pending')
        self.assertEqual(self.preview().status_code, 400)


class SafetyProfileReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='safety-reviewer', role='doctor', is_approved=True)
        seed_catalogue(); seed_profiles()

    def setUp(self):
        self.client = APIClient(); self.client.force_login(self.doctor)
        self.profile = SafetyProfile.objects.get(pk='oseltamivir-75mg-capsule')
        self.path = '/api/prescription/safety-profiles/' + self.profile.pk + '/review/'

    def body(self, **changes):
        return {'decision': 'reviewed', 'notes': 'Reviewed the executable scope and evidence.', 'evidence_checked': True,
                'expected_content_hash': self.profile.content_hash, 'expected_updated_at': self.profile.updated_at.isoformat(), **changes}

    def test_seed_is_pending_idempotent_and_never_grants_clinical_review(self):
        self.assertFalse(self.profile.review_is_current)
        self.assertEqual(seed_profiles(), {'created': 0, 'updated': 0, 'unchanged': 4})
        self.assertEqual(SafetyReview.objects.count(), 4)

    def test_rule_review_is_separate_atomic_actor_derived_and_stale_safe(self):
        self.assertEqual(self.client.post(self.path, self.body(evidence_checked=False), format='json').status_code, 400)
        response = self.client.post(self.path, self.body(), format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.review_is_current)
        self.assertFalse(self.profile.medicine.review_is_current)
        self.assertEqual(self.profile.reviewed_by, self.doctor)
        self.assertEqual(self.profile.reviewed_engine_hash, engine_digest())
        history = self.client.get('/api/prescription/safety-profiles/' + self.profile.pk + '/history/').json()
        self.assertEqual(history[0]['reviewer_name'], self.doctor.username)
        stale = self.body(); stale['expected_updated_at'] = '2000-01-01T00:00:00Z'
        self.assertEqual(self.client.post(self.path, stale, format='json').status_code, 409)

    def test_code_and_content_edits_or_revoked_reviewer_fail_closed(self):
        self.client.post(self.path, self.body(), format='json')
        self.profile.refresh_from_db()
        with patch('prescription_drafts.profiles.engine_digest', return_value='different-code'):
            self.assertFalse(self.profile.review_is_current)
        self.doctor.role = 'admin'; self.doctor.save(update_fields=['role'])
        self.profile = SafetyProfile.objects.select_related('reviewed_by', 'medicine').get(pk=self.profile.pk)
        self.assertFalse(self.profile.review_is_current)

    def test_rule_review_requires_csrf_and_rejects_injected_policy(self):
        self.assertEqual(self.client.post(self.path, self.body(content={'arbitrary': 'policy'}), format='json').status_code, 400)
        client = APIClient(enforce_csrf_checks=True); client.force_login(self.doctor)
        self.assertEqual(client.post(self.path, self.body(), format='json').status_code, 403)
        self.assertEqual(self.client.patch('/api/prescription/safety-profiles/' + self.profile.pk + '/', {}, format='json').status_code, 405)
