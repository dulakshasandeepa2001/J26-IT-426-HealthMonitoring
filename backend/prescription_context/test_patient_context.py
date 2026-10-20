"""Patient history and registered age tests. Use in-memory test_settings."""

from datetime import date, datetime, timezone
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient
from accounts.models import User
from .models import (
    PrescriptionContextConsultation as Consultation,
    PrescriptionContextPatientcontext as PatientContext,
    PrescriptionContextContextrevision as Revision,
)
from .patient_data import patient_age


class RegisteredAgeTests(SimpleTestCase):
    def test_registered_birthday_and_day_before_are_calculated_correctly(self):
        with patch('prescription_context.patient_data.timezone.now', return_value=datetime(2026, 10, 12, 8, tzinfo=timezone.utc)):
            self.assertEqual(patient_age(date(2000, 10, 13)), (25, 'valid'))
            self.assertEqual(patient_age(date(2000, 10, 12)), (26, 'valid'))
            self.assertEqual(patient_age(date(2026, 10, 12)), (0, 'valid'))

    def test_missing_or_future_dob_never_produces_an_invented_age(self):
        with patch('prescription_context.patient_data.timezone.now', return_value=datetime(2026, 10, 12, 8, tzinfo=timezone.utc)):
            self.assertEqual(patient_age(None), (None, 'missing'))
            self.assertEqual(patient_age(date(2026, 10, 13)), (None, 'future'))

    def test_age_uses_the_sri_lankan_calendar_date(self):
        # This UTC instant is already October 13 in Sri Lanka.
        with patch('prescription_context.patient_data.timezone.now', return_value=datetime(2026, 10, 12, 19, tzinfo=timezone.utc)):
            self.assertEqual(patient_age(date(2000, 10, 13)), (26, 'valid'))

    def test_leap_day_birthday_is_handled_without_an_invalid_date(self):
        with patch('prescription_context.patient_data.timezone.now', return_value=datetime(2025, 2, 28, 8, tzinfo=timezone.utc)):
            self.assertEqual(patient_age(date(2000, 2, 29)), (24, 'valid'))
        with patch('prescription_context.patient_data.timezone.now', return_value=datetime(2025, 3, 1, 8, tzinfo=timezone.utc)):
            self.assertEqual(patient_age(date(2000, 2, 29)), (25, 'valid'))


class PatientContextReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='context-doctor', role='doctor', is_approved=True)
        cls.other_doctor = User.objects.create_user(username='context-other-doctor', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='context-patient', role='patient', is_approved=True, birthday=date(2000, 10, 13))
        cls.other_patient = User.objects.create_user(username='context-other-patient', role='patient', is_approved=True)
        cls.consultation = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, reason='First visit')
        cls.other_consultation = Consultation.objects.create(doctor=cls.other_doctor, patient=cls.other_patient, reason='Private visit')
        cls.shared_consultation = Consultation.objects.create(doctor=cls.other_doctor, patient=cls.patient, reason='Authorized shared patient visit')

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)

    def endpoint(self, consultation=None):
        return '/api/prescription/consultations/' + str((consultation or self.consultation).pk) + '/patient-context/'

    def payload(self, expected=None):
        return {
            'allergy_status': 'confirmed', 'allergies': ['  Test allergy  ', 'TEST ALLERGY'],
            'medicine_status': 'confirmed', 'current_medicines': ['Test existing medicine'],
            'reviewed': True, 'expected_updated_at': expected,
        }

    def save(self, payload=None, consultation=None, client=None):
        return (client or self.client).post(self.endpoint(consultation), payload or self.payload(), format='json')

    def test_first_review_persists_history_and_uses_registered_dob(self):
        with patch('prescription_context.patient_data.timezone.now', return_value=datetime(2026, 10, 12, 8, tzinfo=timezone.utc)):
            response = self.save()
        self.assertEqual(response.status_code, 200, response.data)
        saved = response.json()
        self.assertEqual(saved['allergies'], ['Test allergy'])
        self.assertEqual(saved['date_of_birth'], '2000-10-13')
        self.assertEqual(saved['age_years'], 25)
        self.assertEqual(saved['updated_by'], self.doctor.pk)
        self.assertIsNone(saved['weight'])
        self.assertEqual(saved['provenance']['last_reviewed_consultation'], str(self.consultation.pk))
        self.patient.refresh_from_db()
        self.assertEqual(self.patient.birthday, date(2000, 10, 13))
        revision = Revision.objects.get()
        self.assertEqual(revision.doctor, self.doctor)
        self.assertEqual(revision.consultation, self.consultation)
        self.assertIsNone(revision.snapshot['before'])
        self.assertEqual(revision.snapshot['after']['allergies'], ['Test allergy'])

    def test_explicit_identity_resolution_keeps_raw_history_and_server_audit(self):
        from medicine_knowledge.services import seed_catalogue
        seed_catalogue()
        choices = self.client.get(self.endpoint().replace('patient-context/', 'history-identities/')).json()
        product = next(row for row in choices['products'] if row['id'] == 'paracetamol-500mg-tablet')
        details = {'allergies': [{'recorded_text': 'Penicillin (Rash)', 'identity': 'penicillin', 'reaction': 'Rash', 'reaction_date': None, 'clarification_note': ''}],
            'medicines': [{'recorded_text': 'Paracetamol 500mg SOS', 'catalogue_id': product['id'], 'expected_identity_hash': product['identity_hash'], 'schedule': 'SOS', 'clarification_note': 'Product name, tablet and strength confirmed with patient.'}]}
        body = {**self.payload(), 'allergies': ['Penicillin (Rash)'], 'current_medicines': ['Paracetamol 500mg SOS'], 'history_details': details}
        response = self.save(body)
        self.assertEqual(response.status_code, 200, response.data)
        record = response.json()
        self.assertEqual(record['allergies'], body['allergies'])
        self.assertEqual(record['current_medicines'], body['current_medicines'])
        identity = record['provenance']['history_identity']
        self.assertEqual(identity['reviewed_by'], self.doctor.pk)
        self.assertEqual(identity['consultation_id'], str(self.consultation.pk))
        self.assertEqual(identity['details'], details)
        self.assertEqual(Revision.objects.get().snapshot['after']['history_identity'], identity)
        for field, value in [('recorded_text', 'Changed text'), ('identity', 'unsupported allergy')]:
            from copy import deepcopy
            bad = deepcopy(body); bad['expected_updated_at'] = record['updated_at']
            bad['history_details']['allergies'][0][field] = value
            self.assertEqual(self.save(bad).status_code, 400)
        self.assertEqual(self.client.get(self.endpoint(self.other_consultation).replace('patient-context/', 'history-identities/')).status_code, 404)

    def test_identity_selection_cannot_relabel_known_allergy_or_forge_a_review(self):
        details = {'allergies': [{'recorded_text': 'Paracetamol (Rash)', 'identity': 'penicillin', 'reaction': 'Rash', 'reaction_date': None, 'clarification_note': 'Arbitrary replacement attempt'}], 'medicines': []}
        body = {**self.payload(), 'allergies': ['Paracetamol (Rash)'], 'medicine_status': 'none', 'current_medicines': [], 'history_details': details}
        self.assertEqual(self.save(body).status_code, 400)
        details['allergies'][0]['identity'] = 'paracetamol'
        details['reviewed_by'] = self.other_doctor.pk
        self.assertEqual(self.save(body).status_code, 400)
        details.pop('reviewed_by')
        details['allergies'][0]['reaction_date'] = 'unknown'
        self.assertEqual(self.save(body).status_code, 400)
        self.assertFalse(PatientContext.objects.exists())

    def test_medicine_resolution_requires_current_identity_and_explicit_clarification(self):
        from medicine_knowledge.services import seed_catalogue
        from copy import deepcopy
        seed_catalogue()
        options = self.client.get(self.endpoint().replace('patient-context/', 'history-identities/')).json()
        product = next(row for row in options['products'] if row['id'] == 'paracetamol-500mg-tablet')
        self.assertNotIn('paracetamol', [name.casefold() for name in product['aliases']], 'Ingredient names cannot propose a formulation')
        row = {'recorded_text': 'Paracetamol', 'catalogue_id': product['id'], 'expected_identity_hash': product['identity_hash'], 'schedule': '', 'clarification_note': ''}
        body = {**self.payload(), 'allergy_status': 'none', 'allergies': [], 'current_medicines': ['Paracetamol'], 'history_details': {'allergies': [], 'medicines': [row]}}
        self.assertEqual(self.save(body).status_code, 400, 'Ingredient name does not establish strength/form')
        row['clarification_note'] = 'Patient confirmed strength and tablet formulation.'
        for field, invalid in [('catalogue_id', 'unknown-product'), ('expected_identity_hash', '0' * 64)]:
            bad = deepcopy(body); bad['history_details']['medicines'][0][field] = invalid
            self.assertEqual(self.save(bad).status_code, 400)
        self.assertEqual(self.save(body).status_code, 200)

    def test_changed_raw_history_drops_previous_identity_resolution(self):
        details = {'allergies': [{'recorded_text': 'Penicillin (Rash)', 'identity': 'penicillin', 'reaction': 'Rash', 'reaction_date': None, 'clarification_note': ''}], 'medicines': []}
        body = {**self.payload(), 'allergies': ['Penicillin (Rash)'], 'medicine_status': 'none', 'current_medicines': [], 'history_details': details}
        first = self.save(body).json()
        changed = {**body, 'expected_updated_at': first['updated_at'], 'allergies': ['Unresolved new allergy']}
        changed.pop('history_details')
        response = self.save(changed)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn('history_identity', response.json()['provenance'])
        revision = Revision.objects.latest('id')
        self.assertEqual(revision.snapshot['before']['history_identity']['details'], details)
        self.assertIn('history_identity', revision.changed_fields)

    def test_management_proposals_are_audited_without_changing_active_history(self):
        from copy import deepcopy
        body = {**self.payload(), 'medicine_plans': [
            {'recorded_text': 'Test existing medicine', 'action': 'stop', 'note': 'Synthetic proposal pending separate clinical review.'}]}
        response = self.save(body)
        self.assertEqual(response.status_code, 200, response.data)
        saved = response.json()
        self.assertEqual(saved['current_medicines'], ['Test existing medicine'])
        self.assertEqual(saved['medicine_status'], 'confirmed')
        proposal = saved['provenance']['medicine_plan']
        self.assertEqual(proposal['status'], 'proposed_only')
        self.assertFalse(proposal['changes_active_history'])
        self.assertEqual(proposal['reviewed_by'], self.doctor.pk)
        self.assertEqual(proposal['consultation_id'], str(self.consultation.pk))
        self.assertEqual(Revision.objects.get().snapshot['after']['medicine_plan'], proposal)
        for change in ({'note': 'short'}, {'action': 'approved'}, {'recorded_text': 'Another medicine'}, {'reviewed_by': self.other_doctor.pk}):
            bad = deepcopy(body)
            bad['expected_updated_at'] = saved['updated_at']
            bad['medicine_plans'][0].update(change)
            self.assertEqual(self.save(bad).status_code, 400)
        self.assertEqual(Revision.objects.count(), 1, 'Invalid proposals must not save partial history')

    def test_proposal_is_not_carried_to_another_visit_or_changed_history(self):
        body = {**self.payload(), 'medicine_plans': [
            {'recorded_text': 'Test existing medicine', 'action': 'continue', 'note': 'Fictional proposed action with review still required.'}]}
        saved = self.save(body).json()
        unchanged = {**self.payload(saved['updated_at']), 'allergies': saved['allergies']}
        same_visit = self.save(unchanged).json()
        self.assertEqual(same_visit['provenance']['medicine_plan']['details'], body['medicine_plans'])
        next_visit = Consultation.objects.create(doctor=self.doctor, patient=self.patient, reason='Return visit')
        unchanged['expected_updated_at'] = same_visit['updated_at']
        next_record = self.save(unchanged, consultation=next_visit).json()
        self.assertNotIn('medicine_plan', next_record['provenance'])
        self.assertEqual(Revision.objects.order_by('id').first().snapshot['after']['medicine_plan']['details'], body['medicine_plans'])
        body['expected_updated_at'] = next_record['updated_at']
        saved = self.save(body).json()
        changed = {**unchanged, 'expected_updated_at': saved['updated_at'], 'current_medicines': ['New unresolved medicine']}
        self.assertNotIn('medicine_plan', self.save(changed).json()['provenance'])

    def test_next_visit_loads_same_patient_data_and_can_record_a_new_review(self):
        first = self.save().json()
        next_visit = self.client.post('/api/prescription/consultations/', {'patient': self.patient.pk, 'reason': 'Return visit'}, format='json').json()
        context = self.client.get('/api/prescription/patient-contexts/?patient=' + str(self.patient.pk)).json()[0]
        self.assertEqual(context['id'], first['id'])
        self.assertEqual(context['current_medicines'], first['current_medicines'])
        self.assertNotEqual(context['provenance']['last_reviewed_consultation'], next_visit['id'])
        payload = self.payload(context['updated_at'])
        payload['allergies'] = first['allergies']
        endpoint = '/api/prescription/consultations/' + next_visit['id'] + '/patient-context/'
        response = self.client.post(endpoint, payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['id'], first['id'])
        self.assertEqual(response.json()['provenance']['last_reviewed_consultation'], next_visit['id'])
        self.assertEqual(PatientContext.objects.count(), 1)
        self.assertEqual(Revision.objects.count(), 2)
        self.assertEqual(Revision.objects.order_by('-id').first().changed_fields, [])

    def test_none_and_unknown_are_distinct_and_no_dob_or_weight_is_required_to_record_them(self):
        self.patient.birthday = None
        self.patient.save(update_fields=['birthday'])
        response = self.save({**self.payload(), 'allergy_status': 'none', 'allergies': [], 'medicine_status': 'unknown', 'current_medicines': []})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['allergy_status'], 'none')
        self.assertEqual(response.json()['medicine_status'], 'unknown')
        self.assertIsNone(response.json()['age_years'])
        self.assertEqual(response.json()['dob_status'], 'missing')

    def test_review_and_status_list_consistency_are_required(self):
        cases = [
            {**self.payload(), 'reviewed': False},
            {**self.payload(), 'allergies': []},
            {**self.payload(), 'allergies': ['   ']},
            {**self.payload(), 'allergy_status': 'none'},
            {**self.payload(), 'medicine_status': 'unknown'},
            {**self.payload(), 'medicine_status': 'invalid'},
            {**self.payload(), 'allergies': ['x' * 201]},
            {**self.payload(), 'current_medicines': ['Test'] * 51},
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                self.assertEqual(self.save(payload).status_code, 400)
        self.assertEqual(self.client.post(self.endpoint(), {}, format='json').status_code, 400)
        self.assertEqual(PatientContext.objects.count(), 0)
        self.assertEqual(Revision.objects.count(), 0)

    def test_client_cannot_supply_actor_patient_dob_weight_or_provenance(self):
        for field, value in [('patient', self.other_patient.pk), ('updated_by', self.other_doctor.pk), ('date_of_birth', '1990-01-01'), ('weight', '65.00'), ('provenance', {'source': 'fake'})]:
            with self.subTest(field=field):
                self.assertEqual(self.save({**self.payload(), field: value}).status_code, 400)
        self.assertEqual(PatientContext.objects.count(), 0)

    def test_unassigned_encounters_and_non_doctor_accounts_cannot_write(self):
        self.assertEqual(self.save(consultation=self.other_consultation).status_code, 404)
        admin = User.objects.create_user(username='context-admin', role='admin', is_approved=True)
        pending = User.objects.create_user(username='context-pending', role='doctor', is_approved=False)
        for actor in [self.patient, admin, pending, None]:
            client = APIClient()
            if actor:
                client.force_login(actor)
            self.assertEqual(self.save(client=client).status_code, 403)
        self.assertEqual(PatientContext.objects.count(), 0)

    def test_inactive_patient_cannot_receive_a_new_review(self):
        self.patient.is_active = False
        self.patient.save(update_fields=['is_active'])
        self.assertEqual(self.save().status_code, 400)

    def test_another_doctors_newer_review_cannot_be_silently_overwritten(self):
        first = self.save().json()
        other = APIClient()
        other.force_login(self.other_doctor)
        update = {**self.payload(first['updated_at']), 'allergies': ['Newer test allergy']}
        self.assertEqual(self.save(update, consultation=self.shared_consultation, client=other).status_code, 200)
        response = self.save({**self.payload(first['updated_at']), 'allergies': ['Stale test allergy']})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(PatientContext.objects.get().allergies, ['Newer test allergy'])
        self.assertEqual(Revision.objects.count(), 2)

    def test_first_visit_requires_refresh_if_context_was_created_in_another_session(self):
        self.save()
        self.assertEqual(self.save().status_code, 409)
        self.assertEqual(Revision.objects.count(), 1)

    def test_existing_weight_is_preserved_and_dob_is_resynced_from_registration(self):
        context = PatientContext.objects.create(patient=self.patient, updated_by=self.doctor, date_of_birth=date(1990, 1, 1), weight='65.00', weight_unit='kg', allergy_status='unknown', medicine_status='unknown')
        response = self.save(self.payload(context.updated_at.isoformat()))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['date_of_birth'], '2000-10-13')
        self.assertEqual(response.json()['weight'], '65.00')
        self.assertEqual(Revision.objects.get().snapshot['before']['date_of_birth'], '1990-01-01')

    def test_failed_history_write_rolls_back_patient_context(self):
        with patch('prescription_context.views.PrescriptionContextContextrevision.objects.create', side_effect=RuntimeError('Test history failure')):
            with self.assertRaises(RuntimeError):
                self.save()
        self.assertEqual(PatientContext.objects.count(), 0)

    def test_context_write_requires_csrf_for_a_real_doctor_session(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.doctor)
        self.assertEqual(self.save(client=client).status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        self.assertEqual(client.post(self.endpoint(), self.payload(), format='json', HTTP_X_CSRFTOKEN=token).status_code, 200)
