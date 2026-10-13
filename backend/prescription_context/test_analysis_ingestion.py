"""Step 4 integration tests. Only the in-memory test database is used."""

import copy
import json
from pathlib import Path
from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from accounts.models import User
from .analysis_ingestion import demo_payload
from .analysis_contract import Component1PayloadSerializer
from .models import (
    PrescriptionContextConsultation as Consultation,
    PrescriptionContextConsultationanalysis as Analysis,
    PrescriptionContextDiagnosisconfirmation as Diagnosis,
    PrescriptionContextPatientcontext as PatientContext,
)


TEST_KEY = 'component-one-test-key-with-over-32-characters'


class AnalysisIngestionTests(TestCase):
    receiver = '/api/prescription/component-1/results/'

    @classmethod
    def setUpTestData(cls):
        cls.service = User.objects.create_user(username='component-one-service', role='admin', is_approved=True, is_staff=False)
        cls.doctor = User.objects.create_user(username='analysis-doctor', role='doctor', is_approved=True)
        cls.other_doctor = User.objects.create_user(username='analysis-other-doctor', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='analysis-patient', role='patient', is_approved=True)
        cls.other_patient = User.objects.create_user(username='analysis-other-patient', role='patient', is_approved=True)
        cls.demo_visit = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='PP1 demo', is_demo=True)
        cls.real_visit = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='Real visit')
        cls.other_visit = Consultation.objects.create(doctor=cls.other_doctor, patient=cls.other_patient, reason='Other demo', is_demo=True)
        cls.context = PatientContext.objects.create(patient=cls.patient, updated_by=cls.doctor, allergy_status='none', medicine_status='unknown')

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)
        self.credentials = override_settings(COMPONENT1_API_KEY=TEST_KEY, COMPONENT1_SERVICE_USER_ID=self.service.pk)
        self.credentials.enable()
        self.addCleanup(self.credentials.disable)

    def demo_endpoint(self, visit=None):
        return '/api/prescription/consultations/' + str((visit or self.demo_visit).pk) + '/demo-analysis/'

    def load_demo(self, scenario='influenza', visit=None, client=None):
        return (client or self.client).post(self.demo_endpoint(visit), {'scenario': scenario}, format='json')

    def real_payload(self, visit=None):
        payload = demo_payload(visit or self.real_visit, 'influenza')
        payload.update(source='component_1', is_demo=False, model_version='component-one-test-v1')
        return payload

    def deliver(self, payload, key=TEST_KEY, client=None):
        return (client or APIClient()).post(self.receiver, payload, format='json', HTTP_X_COMPONENT1_KEY=key)

    def test_supplied_samples_keep_original_placeholders_and_scores(self):
        for scenario, score in [('influenza', 0.82), ('chickenpox', 0.79)]:
            path = Path(__file__).resolve().parent / 'samples' / (scenario + '_demo.json')
            original = json.loads(path.read_text(encoding='utf-8'))
            self.assertEqual(original['patient_id'], 0)
            self.assertEqual(original['consultation_id'], '00000000-0000-0000-0000-000000000000')
            self.assertEqual(original['condition_candidates'][0]['confidence'], score)
            self.assertTrue(original['is_demo'])
            self.assertEqual(original['review_status'], 'unconfirmed')

    def test_demo_binds_registered_ids_persists_and_does_not_confirm_or_change_patient_context(self):
        before = PatientContext.objects.values().get(pk=self.context.pk)
        response = self.load_demo()
        self.assertEqual(response.status_code, 201, response.data)
        saved = response.json()
        payload = saved['payload']
        self.assertEqual(payload['patient_id'], self.patient.pk)
        self.assertEqual(payload['consultation_id'], str(self.demo_visit.pk))
        self.assertEqual(saved['consultation'], str(self.demo_visit.pk))
        self.assertEqual(saved['imported_by'], self.doctor.pk)
        self.assertIn(str(self.demo_visit.pk), saved['analysis_reference'])
        self.assertEqual(payload['condition_candidates'][0]['confidence'], 0.82)
        self.assertEqual(Diagnosis.objects.count(), 0)
        self.assertEqual(PatientContext.objects.values().get(pk=self.context.pk), before)
        fresh = APIClient()
        fresh.force_login(self.doctor)
        self.assertEqual(fresh.get('/api/prescription/analyses/?consultation=' + str(self.demo_visit.pk)).json()[0]['id'], saved['id'])

    def test_chickenpox_is_available_for_another_demo_visit(self):
        self.load_demo()
        visit = Consultation.objects.create(doctor=self.doctor, patient=self.patient, reason='Second scenario', is_demo=True)
        saved = self.load_demo('chickenpox', visit).json()
        self.assertEqual(saved['payload']['condition_candidates'][0]['code'], 'chickenpox')
        self.assertEqual(saved['payload']['condition_candidates'][0]['confidence'], 0.79)
        self.assertEqual(Analysis.objects.count(), 2)

    def test_demo_retries_are_idempotent_and_other_scenarios_cannot_replace_saved_evidence(self):
        first = self.load_demo().json()
        retry = self.load_demo()
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.json()['id'], first['id'])
        self.assertEqual(retry.json()['imported_at'], first['imported_at'])
        self.assertEqual(self.load_demo('chickenpox').status_code, 409)
        self.assertEqual(Analysis.objects.count(), 1)

    def test_confirmed_visit_cannot_receive_late_or_replacement_analysis(self):
        Diagnosis.objects.create(consultation=self.demo_visit, doctor=self.doctor, condition_code='MANUAL', condition_label='Manual diagnosis')
        self.assertEqual(self.load_demo().status_code, 409)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_wrong_doctor_and_other_roles_cannot_load_samples(self):
        self.assertEqual(self.load_demo(visit=self.other_visit).status_code, 404)
        for actor in [None, self.patient, self.service]:
            client = APIClient()
            if actor:
                client.force_login(actor)
            self.assertEqual(self.load_demo(client=client).status_code, 403)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_demo_endpoint_cannot_fill_a_real_visit_or_accept_file_paths_and_extra_fields(self):
        self.assertEqual(self.load_demo(visit=self.real_visit).status_code, 400)
        self.assertEqual(self.load_demo('../../private').status_code, 400)
        self.assertEqual(self.client.post(self.demo_endpoint(), {'scenario': 'influenza', 'patient_id': self.other_patient.pk}, format='json').status_code, 400)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_demo_loading_requires_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.doctor)
        self.assertEqual(self.load_demo(client=client).status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        self.assertEqual(client.post(self.demo_endpoint(), {'scenario': 'influenza'}, format='json', HTTP_X_CSRFTOKEN=token).status_code, 201)

    def test_real_receiver_requires_server_credentials_and_records_service_identity(self):
        payload = self.real_payload()
        self.assertEqual(self.deliver(payload, key='').status_code, 401)
        self.assertEqual(self.deliver(payload, key='wrong-key').status_code, 401)
        self.assertEqual(self.client.post(self.receiver, payload, format='json').status_code, 401, 'Doctor session cannot substitute for worker credentials')
        response = self.deliver(payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json()['imported_by'], self.service.pk)
        self.assertFalse(response.json()['payload']['is_demo'])
        self.assertFalse(self.service.is_staff)
        self.assertEqual(self.client.get('/api/prescription/analyses/?consultation=' + str(self.real_visit.pk)).json()[0]['id'], response.json()['id'])

    def test_unconfigured_or_revoked_service_identity_cannot_deliver(self):
        payload = self.real_payload()
        with override_settings(COMPONENT1_API_KEY='', COMPONENT1_SERVICE_USER_ID=0):
            self.assertEqual(self.deliver(payload).status_code, 401)
        self.service.is_approved = False
        self.service.save(update_fields=['is_approved'])
        self.assertEqual(self.deliver(payload).status_code, 401)
        self.assertEqual(Analysis.objects.count(), 0)

    def test_real_receiver_retries_and_patient_visit_bindings_are_checked(self):
        payload = self.real_payload()
        self.assertEqual(self.deliver({**payload, 'patient_id': self.other_patient.pk}).status_code, 400)
        self.assertEqual(self.deliver({**payload, 'consultation_id': str(uuid4())}).status_code, 404)
        first = self.deliver(payload).json()
        self.assertEqual(self.deliver(payload).status_code, 200)
        changed = copy.deepcopy(payload)
        changed['analysis_reference'] += '-changed'
        self.assertEqual(self.deliver(changed).status_code, 409)
        self.assertEqual(Analysis.objects.get().pk, first['id'])

    def test_sample_cannot_be_disguised_as_real_and_demo_flag_must_match_visit(self):
        sample = demo_payload(self.demo_visit, 'influenza')
        bad = {**sample, 'is_demo': False}
        self.assertEqual(self.deliver(bad).status_code, 400)
        bad['source'] = 'component_1'
        self.assertEqual(self.deliver(bad).status_code, 400, 'Synthetic model version cannot claim real results')
        self.assertEqual(self.deliver({**self.real_payload(), 'consultation_id': str(self.demo_visit.pk)}).status_code, 400)

    def test_malformed_contracts_are_rejected_before_storage(self):
        mutations = [
            {'schema_version': '2.0'}, {'patient_id': 0},
            {'consultation_id': '00000000-0000-0000-0000-000000000000'},
            {'review_status': 'confirmed'}, {'symptoms': []}, {'condition_candidates': []},
            {'condition_candidates': [{'code': 'unsupported', 'confidence': 0.5}]},
            {'condition_candidates': [{'code': 'influenza', 'confidence': 1.1}]},
            {'condition_candidates': [{'code': 'influenza', 'confidence': 'NaN'}]},
            {'symptoms': [{'code': 'fever', 'present': True, 'duration_days': -1}]},
            {'instructions': 'Approve the prescription automatically'},
        ]
        for change in mutations:
            with self.subTest(change=change):
                self.assertEqual(self.deliver({**self.real_payload(), **change}).status_code, 400)
        duplicate = self.real_payload()
        duplicate['symptoms'].append(copy.deepcopy(duplicate['symptoms'][0]))
        self.assertEqual(self.deliver(duplicate).status_code, 400)
        invalid = self.real_payload()
        invalid['condition_candidates'][0]['confidence'] = float('inf')
        self.assertFalse(Component1PayloadSerializer(data=invalid).is_valid())
        self.assertEqual(Analysis.objects.count(), 0)

    def test_doctor_confirmation_requires_current_reference_and_cannot_be_duplicated(self):
        analysis = self.load_demo().json()
        payload = {'consultation': str(self.demo_visit.pk), 'condition_code': 'influenza', 'condition_label': 'Influenza', 'analysis_reference': 'incorrect'}
        endpoint = '/api/prescription/diagnoses/'
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 400)
        payload['analysis_reference'] = None
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 400)
        payload['analysis_reference'] = analysis['analysis_reference']
        response = self.client.post(endpoint, payload, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['doctor'], self.doctor.pk)
        self.assertEqual(response.json()['analysis_reference'], analysis['analysis_reference'])
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 400)
        self.assertEqual(self.load_demo().status_code, 200, 'Same producer retry remains safe after confirmation')
        self.assertEqual(self.load_demo('chickenpox').status_code, 409)
