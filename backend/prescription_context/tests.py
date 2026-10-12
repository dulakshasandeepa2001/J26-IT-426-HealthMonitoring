"""Run using medicare_project.test_settings: only an in-memory database is used."""

from io import StringIO
from uuid import UUID, uuid4

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from .models import (
    PrescriptionContextConsultation as Consultation,
    PrescriptionContextConsultationanalysis as Analysis,
    PrescriptionContextPatientcontext as PatientContext,
    PrescriptionContextContextrevision as Revision,
    PrescriptionContextDiagnosisconfirmation as Diagnosis,
)


class EncounterAccessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='staff', password='test-password', is_staff=True)
        cls.doctor = User.objects.create_user(username='doctor-one', password='test-password', role='doctor', is_approved=True)
        cls.other_doctor = User.objects.create_user(username='doctor-two', password='test-password', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='patient-one', role='patient', is_approved=True)
        cls.other_patient = User.objects.create_user(username='patient-two', role='patient', is_approved=True)
        cls.unassigned = User.objects.create_user(username='patient-unassigned', role='patient', is_approved=True)
        cls.encounter = Consultation.objects.create(doctor=cls.doctor, patient=cls.patient, assigned_by=cls.staff, reason='First assigned visit', is_demo=True)
        cls.other_encounter = Consultation.objects.create(doctor=cls.other_doctor, patient=cls.other_patient, assigned_by=cls.staff, reason='Private visit')
        cls.context = PatientContext.objects.create(
            patient=cls.patient, updated_by=cls.doctor, allergy_status='confirmed', allergies=['Test allergy'],
            medicine_status='unknown', current_medicines=[], provenance={'source': 'test fixture'},
        )
        cls.other_context = PatientContext.objects.create(
            patient=cls.other_patient, updated_by=cls.other_doctor, allergy_status='none',
            medicine_status='none',
        )
        cls.analysis = Analysis.objects.create(consultation=cls.encounter, imported_by=cls.doctor, analysis_reference='test-own', payload={'fixture': True})
        cls.other_analysis = Analysis.objects.create(consultation=cls.other_encounter, imported_by=cls.other_doctor, analysis_reference='test-other', payload={'private': True})
        cls.revision = Revision.objects.create(consultation=cls.encounter, doctor=cls.doctor, context=cls.context, snapshot={'allergies': ['Test allergy']}, changed_fields=['allergies'])
        cls.other_revision = Revision.objects.create(consultation=cls.other_encounter, doctor=cls.other_doctor, context=cls.other_context, snapshot={}, changed_fields=[])
        cls.diagnosis = Diagnosis.objects.create(consultation=cls.encounter, doctor=cls.doctor, condition_code='TEST', condition_label='Test diagnosis')
        cls.other_diagnosis = Diagnosis.objects.create(consultation=cls.other_encounter, doctor=cls.other_doctor, condition_code='PRIVATE', condition_label='Private diagnosis')

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)

    def endpoint(self, path):
        return '/api/prescription/' + path + '/'

    def test_all_endpoints_require_an_approved_doctor_session(self):
        endpoints = ['patients', 'consultations', 'analyses', 'patient-contexts', 'revisions', 'diagnoses']
        for role in [None, 'patient', 'lab', 'pending', 'inactive']:
            client = APIClient()
            if role:
                if role == 'patient':
                    user = self.patient
                else:
                    user = User.objects.create_user(username='denied-' + role, role='doctor' if role in ['pending', 'inactive'] else role, is_approved=role != 'pending', is_active=role != 'inactive')
                client.force_login(user)
            for path in endpoints:
                with self.subTest(role=role, path=path):
                    self.assertEqual(client.get(self.endpoint(path)).status_code, 403)

    def test_directory_only_exposes_assigned_registered_patients(self):
        response = self.client.get(self.endpoint('patients'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual([item['id'] for item in response.json()], [self.patient.pk])
        self.assertEqual(set(response.json()[0]), {'id', 'username', 'display_name', 'birthday', 'age_years', 'dob_status'})
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(self.client.get(self.endpoint('patients') + str(self.other_patient.pk) + '/').status_code, 404)

    def test_encounters_and_every_linked_resource_are_scoped_to_logged_in_doctor(self):
        paths = {
            'consultations': (self.encounter.pk, self.other_encounter.pk),
            'analyses': (self.analysis.pk, self.other_analysis.pk),
            'patient-contexts': (self.context.pk, self.other_context.pk),
            'revisions': (self.revision.pk, self.other_revision.pk),
            'diagnoses': (self.diagnosis.pk, self.other_diagnosis.pk),
        }
        for path, (own_id, other_id) in paths.items():
            with self.subTest(path=path):
                data = self.client.get(self.endpoint(path) + '?doctor=' + str(self.other_doctor.pk)).json()
                self.assertEqual([str(item['id']) for item in data], [str(own_id)])
                self.assertEqual(self.client.get(self.endpoint(path) + str(other_id) + '/').status_code, 404)
        self.assertEqual(self.client.get(self.endpoint('consultations') + '?patient=' + str(self.other_patient.pk)).json(), [])
        self.assertEqual(self.client.get(self.endpoint('patient-contexts') + '?patient=' + str(self.other_patient.pk)).json(), [])
        self.assertEqual(self.client.get(self.endpoint('analyses') + '?consultation=' + str(self.other_encounter.pk)).json(), [])

    def test_each_visit_gets_a_server_identity_without_replacing_patient_context(self):
        forged_id = str(uuid4())
        before = PatientContext.objects.values().get(pk=self.context.pk)
        first = self.client.post(self.endpoint('consultations'), {
            'patient': self.patient.pk, 'reason': '  Second visit  ', 'id': forged_id,
            'doctor': self.other_doctor.pk, 'assigned_by': self.other_doctor.pk,
            'started_at': '2000-01-01T00:00:00Z', 'is_demo': False,
        }, format='json')
        second = self.client.post(self.endpoint('consultations'), {'patient': self.patient.pk, 'reason': 'Third visit'}, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(second.status_code, 201, second.data)
        a, b = first.json(), second.json()
        UUID(a['id'])
        self.assertNotEqual(a['id'], forged_id)
        self.assertNotEqual(a['id'], b['id'])
        self.assertEqual(a['doctor'], self.doctor.pk)
        self.assertEqual(a['patient'], b['patient'])
        self.assertIsNone(a['assigned_by'])
        self.assertTrue(a['is_demo'])
        self.assertEqual(a['reason'], 'Second visit')
        self.assertFalse(a['started_at'].startswith('2000-'))
        self.assertEqual(PatientContext.objects.values().get(pk=self.context.pk), before)
        # A fresh browser session reads the visits from the database.
        fresh = APIClient()
        fresh.force_login(self.doctor)
        ids = [item['id'] for item in fresh.get(self.endpoint('consultations')).json()]
        self.assertIn(a['id'], ids)
        self.assertIn(b['id'], ids)

    def test_cannot_start_a_visit_for_unassigned_or_invalid_patient(self):
        for patient in [self.other_patient.pk, self.unassigned.pk, self.doctor.pk, 999999]:
            response = self.client.post(self.endpoint('consultations'), {'patient': patient, 'reason': 'Test'}, format='json')
            self.assertEqual(response.status_code, 400)
        self.patient.is_active = False
        self.patient.save(update_fields=['is_active'])
        self.assertEqual(self.client.post(self.endpoint('consultations'), {'patient': self.patient.pk, 'reason': 'Test'}, format='json').status_code, 400)

    def test_missing_and_invalid_visit_details_do_not_create_records(self):
        count = Consultation.objects.count()
        for payload in [{}, {'patient': self.patient.pk}, {'patient': self.patient.pk, 'reason': '  '}, {'patient': self.patient.pk, 'reason': 'x' * 301}]:
            self.assertEqual(self.client.post(self.endpoint('consultations'), payload, format='json').status_code, 400)
        self.assertEqual(Consultation.objects.count(), count)
        self.assertEqual(self.client.get(self.endpoint('consultations') + '?patient=invalid').status_code, 400)
        self.assertEqual(self.client.get(self.endpoint('analyses') + '?consultation=invalid').status_code, 400)

    def test_visit_identity_and_context_history_cannot_be_rewritten_or_deleted(self):
        for method in ['patch', 'put', 'delete']:
            response = getattr(self.client, method)(self.endpoint('consultations') + str(self.encounter.pk) + '/', {}, format='json')
            self.assertEqual(response.status_code, 405)
        for path in ['analyses', 'patient-contexts', 'revisions']:
            self.assertEqual(self.client.post(self.endpoint(path), {}, format='json').status_code, 405)

    def test_diagnosis_create_cannot_impersonate_doctor_or_cross_encounter_boundary(self):
        payload = {'consultation': str(self.encounter.pk), 'doctor': self.other_doctor.pk, 'condition_code': 'MANUAL', 'condition_label': 'Follow-up diagnosis'}
        response = self.client.post(self.endpoint('diagnoses'), payload, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['doctor'], self.doctor.pk)
        payload['consultation'] = str(self.other_encounter.pk)
        self.assertEqual(self.client.post(self.endpoint('diagnoses'), payload, format='json').status_code, 400)

    def test_manual_assignment_creates_the_first_accessible_encounter(self):
        output = StringIO()
        call_command('assign_consultation', doctor_id=self.doctor.pk, patient_id=self.unassigned.pk,
                     assigned_by=self.staff.pk, reason='PP1 first appointment', demo=True, stdout=output)
        assignment = Consultation.objects.get(patient=self.unassigned)
        self.assertEqual(assignment.assigned_by, self.staff)
        self.assertTrue(assignment.is_demo)
        ids = [item['id'] for item in self.client.get(self.endpoint('patients')).json()]
        self.assertIn(self.unassigned.pk, ids)
        count = Consultation.objects.count()
        with self.assertRaises(CommandError):
            call_command('assign_consultation', doctor_id=self.doctor.pk, patient_id=self.unassigned.pk,
                         assigned_by=self.patient.pk, reason='Invalid assigner', demo=True, stdout=output)
        self.assertEqual(Consultation.objects.count(), count)

    def test_django_admin_can_assign_first_visit_with_validated_registered_roles(self):
        self.staff.is_superuser = True
        self.staff.save(update_fields=['is_superuser'])
        self.client.force_login(self.staff)
        path = '/admin/prescription_context/prescriptioncontextconsultation/'
        response = self.client.get(path + 'add/')
        self.assertEqual(response.status_code, 200)
        form = response.context['adminform'].form
        self.assertIn(self.doctor, form.fields['doctor'].queryset)
        self.assertNotIn(self.patient, form.fields['doctor'].queryset)
        self.assertIn(self.unassigned, form.fields['patient'].queryset)
        self.assertNotIn(self.doctor, form.fields['patient'].queryset)
        response = self.client.post(path + 'add/', {
            'doctor': self.doctor.pk, 'patient': self.unassigned.pk,
            'reason': 'PP1 manually assigned visit', 'is_demo': 'on', '_save': 'Save',
        })
        self.assertEqual(response.status_code, 302)
        visit = Consultation.objects.get(patient=self.unassigned)
        self.assertEqual(visit.assigned_by, self.staff)
        self.assertTrue(visit.is_demo)
        self.assertEqual(self.client.get(path + str(visit.pk) + '/change/').status_code, 200)


class SessionLifecycleTests(TestCase):
    def setUp(self):
        self.doctor = User.objects.create_user(username='session-doctor', email='doctor@example.invalid', password='test-password', role='doctor', is_approved=True)
        self.patient = User.objects.create_user(username='session-patient', role='patient', is_approved=True)
        Consultation.objects.create(doctor=self.doctor, patient=self.patient, reason='Assigned')
        self.client = APIClient(enforce_csrf_checks=True)

    def token(self):
        return self.client.get('/session/').json()['csrfToken']

    def login(self):
        return self.client.post('/login/', {'username': self.doctor.email, 'password': 'test-password'}, format='json', HTTP_X_CSRFTOKEN=self.token(), HTTP_ORIGIN='http://localhost:3000')

    def test_csrf_is_required_for_login_and_encounter_creation(self):
        self.assertEqual(self.client.post('/login/', {'username': self.doctor.username, 'password': 'test-password'}, format='json').status_code, 403)
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.get('/session/').json()['user']['id'], self.doctor.pk)
        endpoint = '/api/prescription/consultations/'
        payload = {'patient': self.patient.pk, 'reason': 'New visit'}
        self.assertEqual(self.client.post(endpoint, payload, format='json').status_code, 403)
        self.assertEqual(self.client.post(endpoint, payload, format='json', HTTP_X_CSRFTOKEN=self.token(), HTTP_ORIGIN='http://localhost:3000').status_code, 201)
        self.assertTrue(self.client.cookies['sessionid']['httponly'])

    def test_logout_revokes_access_and_cannot_be_triggered_by_a_get(self):
        self.login()
        self.assertEqual(self.client.get('/logout/').status_code, 405)
        self.assertEqual(self.client.post('/logout/').status_code, 403)
        self.assertEqual(self.client.post('/logout/', HTTP_X_CSRFTOKEN=self.token()).status_code, 200)
        self.assertIsNone(self.client.get('/session/').json()['user'])
        self.assertEqual(self.client.get('/api/prescription/patients/').status_code, 403)

    def test_pending_and_inactive_accounts_cannot_login(self):
        self.doctor.is_approved = False
        self.doctor.save(update_fields=['is_approved'])
        self.assertEqual(self.login().status_code, 403)
        self.doctor.is_approved = True
        self.doctor.is_active = False
        self.doctor.save(update_fields=['is_approved', 'is_active'])
        self.assertEqual(self.login().status_code, 403)
        self.assertIsNone(self.client.get('/session/').json()['user'])
