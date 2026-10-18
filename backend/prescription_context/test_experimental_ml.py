"""Saved-artifact inference and access isolation; uses only the in-memory DB."""

from unittest.mock import patch
from uuid import uuid4

from django.db import connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from accounts.models import User
from prescription_research.expansion import comparison as experiment
from . import experimental_ml as demo
from .models import PrescriptionContextConsultation as Consultation
from .models import PrescriptionContextPatientcontext as PatientContext


@override_settings(PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=True)
class ExperimentalMLTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='ml-doctor', role='doctor', is_approved=True)
        cls.other = User.objects.create_user(username='ml-other', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='ml-patient', role='patient', is_approved=True, birthday='1981-01-01')
        cls.admin = User.objects.create_user(username='ml-admin', role='admin', is_approved=True, is_staff=True)
        cls.visit = Consultation.objects.create(patient=cls.patient, doctor=cls.doctor, is_demo=True, reason='Synthetic fixture access')
        cls.real = Consultation.objects.create(patient=cls.patient, doctor=cls.doctor, is_demo=False, reason='Real encounter')
        cls.context = PatientContext.objects.create(patient=cls.patient, updated_by=cls.doctor,
            allergy_status='confirmed', allergies=['LIVE-ALLERGY-MUST-NOT-APPEAR'],
            medicine_status='confirmed', current_medicines=['LIVE-MEDICINE-MUST-NOT-APPEAR'])

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)
        self.url = self.url_for(self.visit.pk)

    @staticmethod
    def url_for(visit):
        return f'/api/prescription/consultations/{visit}/experimental-ml/'

    def predict(self, scenario='SIX-acute_multi_symptom-06', candidate='ors-low-osmolarity-powder', **changes):
        body = dict(synthetic_demo=True, scenario_id=scenario, candidate_id=candidate)
        body.update(changes)
        return self.client.post(self.url, body, format='json')

    def test_options_expose_actual_frozen_counts_versions_limits_and_no_patient_data(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        data = response.json()
        self.assertEqual(data['consultation_id'], str(self.visit.pk))
        self.assertEqual(data['experiment_version'], experiment.VERSION)
        self.assertEqual(data['algorithm'], 'categorical_tree')
        self.assertEqual(len(data['scenarios']), 60)
        self.assertEqual(sum(row['condition'] is None for row in data['scenarios']), 3)
        self.assertEqual(len(data['candidates']), 6)
        self.assertEqual(data['fit_unique_inputs'], 27)
        self.assertEqual(data['test_agreement']['novel_mapped_unique']['correct'], 10)
        self.assertEqual(data['test_agreement']['novel_mapped_unique']['inputs'], 16)
        self.assertEqual(data['label_provenance']['label_method'], 'rule_derived')
        self.assertEqual(data['clinical_review_status'], 'not_reviewed')
        self.assertFalse(data['live_patient_data_used'])
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertNotIn('birthday', str(data))
        self.assertNotIn('LIVE-', str(data))

    def test_six_mapped_conditions_keep_purpose_and_review_eligibility_false(self):
        candidates = ['oseltamivir-75mg-capsule', 'acyclovir-800mg-tablet', 'paracetamol-500mg-tablet',
            'paracetamol-500mg-tablet', 'cmc-sodium-05pct-ophthalmic-solution', 'ors-low-osmolarity-powder']
        conditions = ['influenza', 'chickenpox', 'measles', 'mumps', 'viral_conjunctivitis', 'viral_gastroenteritis']
        for index, candidate in enumerate(candidates, 1):
            with self.subTest(condition=conditions[index - 1]):
                response = self.predict(f'SIX-acute_multi_symptom-{index:02}', candidate)
                self.assertEqual(response.status_code, 200, response.data)
                data = response.json()
                self.assertEqual(data['fixture']['condition'], conditions[index - 1])
                self.assertEqual(data['mapping_status'], 'mapped')
                self.assertEqual(data['fixture']['patient_features']['age_years'], 42)
                self.assertNotIn('LIVE-', str(data))
                self.assertFalse(data['prescription_eligible'])
                self.assertFalse(data['approved'])
                self.assertFalse(data['published'])
                self.assertFalse(data['deterministic_safety']['review_gate_evaluated'])
                self.assertFalse(data['deterministic_safety']['full_safety_clearance'])
                self.assertTrue(data['evidence_references'])

    def test_relevant_ors_keeps_identity_block_and_never_proposes_regimen(self):
        response = self.predict()
        self.assertEqual(response.status_code, 200, response.data)
        data = response.json()
        self.assertEqual(data['provisional_prediction']['label'], 'relevant')
        self.assertEqual(data['deterministic_safety']['aggregate_status'], 'blocked')
        self.assertIn('product_identity', [x['category'] for x in data['deterministic_safety']['findings'] if x['status'] == 'blocked'])
        self.assertNotIn('regimen', data)
        self.assertFalse(data['medical_confidence_calibrated'])

    def test_unsupported_and_unmapped_cases_abstain_without_clearing_unknowns(self):
        batch = demo.data_io.read_json(demo.dataset.DEFAULT_OUTPUT / 'batch.json')
        unsupported = next(row for row in batch['candidate_rows'] if row['mapping_status'] == 'unsupported_condition')
        for row in (unsupported, batch['candidate_rows'][0]):
            response = self.predict(row['scenario_id'], row['candidate_id'])
            self.assertEqual(response.status_code, 200, response.data)
            data = response.json()
            self.assertEqual(data['provisional_prediction']['status'], 'abstained')
            self.assertIsNone(data['provisional_prediction']['label'])
            self.assertEqual(data['deterministic_safety'], row['research_safety'])
            self.assertEqual(data['model_features'], row['model_features'])

    def test_inference_does_not_fit_or_write_any_database_records(self):
        before = PatientContext.objects.values().get(pk=self.context.pk)
        with patch.object(experiment, 'train', side_effect=AssertionError('no training')), \
             patch.object(experiment, 'fit_candidates', side_effect=AssertionError('no fit')), \
             patch.object(experiment.learners, 'fit', side_effect=AssertionError('no learner fit')), \
             CaptureQueriesContext(connection) as queries:
            first = self.predict()
            second = self.predict()
            self.assertEqual(first.status_code, 200, first.data)
            self.assertEqual(first.json(), second.json())
        self.assertFalse([q['sql'] for q in queries if q['sql'].lstrip().upper().startswith(('INSERT ', 'UPDATE ', 'DELETE ', 'ALTER ', 'CREATE '))])
        self.assertEqual(PatientContext.objects.values().get(pk=self.context.pk), before)

    def test_server_flag_default_off_blocks_reads_and_predictions_before_artifacts(self):
        with override_settings(PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=False), patch.object(demo, 'frozen_options', side_effect=AssertionError('disabled')):
            for response in (self.client.get(self.url), self.predict()):
                self.assertEqual(response.status_code, 403)
                self.assertIn('disabled', str(response.data))

    def test_real_unknown_foreign_and_inactive_patient_consultations_denied(self):
        other_visit = Consultation.objects.create(patient=self.patient, doctor=self.other, is_demo=True, reason='Foreign')
        for visit, status in ((self.real, 403), (other_visit, 404)):
            with self.subTest(visit=visit.pk):
                self.assertEqual(self.client.get(self.url_for(visit.pk)).status_code, status)
                self.assertEqual(self.client.post(self.url_for(visit.pk), {}, format='json').status_code, status)
        self.assertEqual(self.client.get(self.url_for(uuid4())).status_code, 404)
        self.patient.is_active = False
        self.patient.save(update_fields=['is_active'])
        self.assertEqual(self.client.get(self.url).status_code, 404)

    def test_anonymous_patient_admin_and_unapproved_doctor_denied(self):
        self.assertEqual(APIClient().get(self.url).status_code, 403)
        for user in (self.patient, self.admin, self.other):
            self.client.force_login(user)
            self.assertIn(self.client.get(self.url).status_code, (403, 404))
        self.doctor.is_approved = False
        self.doctor.save(update_fields=['is_approved'])
        self.client.force_login(self.doctor)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_strict_body_and_query_reject_live_inputs_paths_and_training(self):
        for extra in ({'patient_id': self.patient.pk}, {'age': 36}, {'model_features': {}}, {'train': True}, {'output': '../x'}, {'approved': True}, {'synthetic_demo': 'true'}, {'synthetic_demo': False}, {'scenario_id': None}):
            with self.subTest(extra=extra):
                self.assertEqual(self.predict(**extra).status_code, 400)
        for body in ([], {}, {'synthetic_demo': True}):
            self.assertEqual(self.client.post(self.url, body, format='json').status_code, 400)
        self.assertEqual(self.client.get(self.url + '?patient_id=1').status_code, 400)
        self.assertEqual(self.predict(scenario='live-patient-12').status_code, 400)
        self.assertEqual(self.predict(candidate='../../selected_model.json').status_code, 400)

    def test_missing_or_changed_artifact_returns_safe_503_without_rebuild(self):
        for failure in (FileNotFoundError('private/local/path'), ValueError('hash drift')):
            with self.subTest(failure=failure), patch.object(experiment, 'verify_run', side_effect=failure):
                for response in (self.client.get(self.url), self.predict()):
                    self.assertEqual(response.status_code, 503)
                    self.assertIn('cannot train or rebuild', str(response.data))
                    self.assertNotIn('private/local/path', str(response.data))

    def test_post_requires_csrf_and_put_delete_are_not_available(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.doctor)
        self.assertEqual(client.post(self.url, {'synthetic_demo': True}, format='json').status_code, 403)
        for method in ('put', 'patch', 'delete'):
            self.assertEqual(getattr(self.client, method)(self.url, {}, format='json').status_code, 405)
