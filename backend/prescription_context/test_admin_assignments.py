"""Admin portal integration tests; run with medicare_project.test_settings."""

from io import StringIO
from uuid import UUID, uuid4

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import PendingDoctor, User
from .models import PrescriptionContextConsultation as Consultation
from .models import PrescriptionContextPatientcontext as PatientContext


class AdminAssignmentTests(TestCase):
    endpoint = '/api/prescription/admin/assignments/'

    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='portal-admin', password='test-password', role='admin', is_approved=True, is_staff=False, is_superuser=False)
        cls.doctor = User.objects.create_user(username='assigned-doctor', role='doctor', is_approved=True)
        cls.other_doctor = User.objects.create_user(username='unassigned-doctor', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='registered-patient', role='patient', is_approved=True)
        cls.inactive_patient = User.objects.create_user(username='inactive-patient', role='patient', is_approved=True, is_active=False)
        cls.pending_doctor = User.objects.create_user(username='pending-doctor', role='doctor', is_approved=False)
        cls.context = PatientContext.objects.create(patient=cls.patient, updated_by=cls.doctor, allergy_status='none', medicine_status='unknown')

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.admin)

    def payload(self):
        return {'doctor': self.doctor.pk, 'patient': self.patient.pk, 'reason': 'PP1 first consultation', 'is_demo': True}

    def test_existing_admin_without_staff_access_can_load_eligible_choices(self):
        response = self.client.get(self.endpoint + 'options/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.admin.is_staff)
        self.assertFalse(self.admin.is_superuser)
        data = response.json()
        self.assertEqual({item['id'] for item in data['doctors']}, {self.doctor.pk, self.other_doctor.pk})
        self.assertEqual([item['id'] for item in data['patients']], [self.patient.pk])
        for item in data['doctors'] + data['patients']:
            self.assertNotIn('password', item)
            self.assertNotIn('NIC_number', item)
            self.assertNotIn('email', item)
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_first_assignment_is_saved_and_grants_only_selected_doctor_access(self):
        before = PatientContext.objects.values().get(pk=self.context.pk)
        spoofed_id = str(uuid4())
        response = self.client.post(self.endpoint, {
            **self.payload(), 'id': spoofed_id, 'assigned_by': self.other_doctor.pk,
            'started_at': '2000-01-01T00:00:00Z',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        visit = response.json()
        UUID(visit['id'])
        self.assertNotEqual(visit['id'], spoofed_id)
        self.assertEqual(visit['assigned_by'], self.admin.pk)
        self.assertFalse(visit['started_at'].startswith('2000-'))
        self.assertEqual(visit['patient_name'], self.patient.username)
        self.assertEqual(visit['doctor_name'], self.doctor.username)
        self.assertTrue(visit['is_demo'])
        self.admin.refresh_from_db()
        self.assertFalse(self.admin.is_staff)
        self.assertEqual(PatientContext.objects.values().get(pk=self.context.pk), before)
        doctor_client = APIClient()
        doctor_client.force_login(self.doctor)
        self.assertEqual([item['id'] for item in doctor_client.get('/api/prescription/patients/').json()], [self.patient.pk])
        self.assertEqual(doctor_client.get('/api/prescription/consultations/').json()[0]['id'], visit['id'])
        doctor_client.force_login(self.other_doctor)
        self.assertEqual(doctor_client.get('/api/prescription/patients/').json(), [])
        self.assertEqual(doctor_client.get('/api/prescription/consultations/' + visit['id'] + '/').status_code, 404)
        fresh_admin = APIClient()
        fresh_admin.force_login(self.admin)
        self.assertEqual(fresh_admin.get(self.endpoint).json()[0]['id'], visit['id'])

    def test_other_roles_and_unapproved_or_inactive_admins_cannot_assign(self):
        denied = [self.doctor, self.patient, None]
        denied += [User.objects.create_user(username='denied-' + kind, role='admin' if kind != 'staff-only' else None, is_staff=kind == 'staff-only', is_approved=kind != 'pending-admin', is_active=kind != 'inactive-admin') for kind in ['staff-only', 'pending-admin', 'inactive-admin']]
        for actor in denied:
            client = APIClient()
            if actor:
                client.force_login(actor)
            with self.subTest(actor=actor):
                self.assertEqual(client.get(self.endpoint).status_code, 403)
                self.assertEqual(client.get(self.endpoint + 'options/').status_code, 403)
                self.assertEqual(client.post(self.endpoint, self.payload(), format='json').status_code, 403)
        self.assertEqual(Consultation.objects.count(), 0)

    def test_registration_roles_and_visit_details_are_validated(self):
        invalid = [
            {**self.payload(), 'doctor': self.patient.pk},
            {**self.payload(), 'doctor': self.pending_doctor.pk},
            {**self.payload(), 'doctor': 999999},
            {**self.payload(), 'patient': self.doctor.pk},
            {**self.payload(), 'patient': self.inactive_patient.pk},
            {**self.payload(), 'reason': '   '},
            {**self.payload(), 'reason': 'x' * 301},
            {},
        ]
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post(self.endpoint, payload, format='json').status_code, 400)
        self.assertEqual(Consultation.objects.count(), 0)

    def test_pp1_demo_is_the_default_and_non_demo_can_be_selected(self):
        payload = self.payload()
        del payload['is_demo']
        first = self.client.post(self.endpoint, payload, format='json')
        second = self.client.post(self.endpoint, {**payload, 'is_demo': False}, format='json')
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertTrue(first.json()['is_demo'])
        self.assertFalse(second.json()['is_demo'])
        self.assertNotEqual(first.json()['id'], second.json()['id'])

    def test_recent_assignments_are_bounded_and_cannot_be_deleted_or_reassigned(self):
        for index in range(12):
            Consultation.objects.create(doctor=self.doctor, patient=self.patient, assigned_by=self.admin, reason='Assigned ' + str(index))
        Consultation.objects.create(doctor=self.doctor, patient=self.patient, reason='Doctor follow-up')
        visits = self.client.get(self.endpoint).json()
        self.assertEqual(len(visits), 10)
        self.assertEqual(visits[0]['reason'], 'Assigned 11')
        for method in ['patch', 'put', 'delete']:
            self.assertIn(getattr(self.client, method)(self.endpoint + visits[0]['id'] + '/', {}, format='json').status_code, [404, 405])

    def test_assignment_post_requires_csrf_even_for_a_valid_admin(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        self.assertEqual(client.post(self.endpoint, self.payload(), format='json').status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        response = client.post(self.endpoint, self.payload(), format='json', HTTP_X_CSRFTOKEN=token, HTTP_ORIGIN='http://localhost:3000')
        self.assertEqual(response.status_code, 201)

    def test_command_also_accepts_an_existing_admin_without_staff(self):
        call_command('assign_consultation', doctor_id=self.doctor.pk, patient_id=self.patient.pk, assigned_by=self.admin.pk, reason='PP1 assignment', demo=True, stdout=StringIO())
        self.assertEqual(Consultation.objects.get().assigned_by, self.admin)

    def test_existing_admin_approval_endpoints_require_an_admin_session(self):
        for actor in [self.doctor, self.patient, None]:
            client = APIClient()
            if actor:
                client.force_login(actor)
            self.assertEqual(client.get('/pending-doctors/').status_code, 403)
            self.assertEqual(client.post('/approve-doctor/999999/').status_code, 403)
            self.assertEqual(client.post('/reject-doctor/999999/').status_code, 403)
        self.assertEqual(self.client.get('/pending-doctors/').status_code, 200)

    def test_doctor_approval_still_works_for_an_admin_without_staff(self):
        pending = PendingDoctor.objects.create(username='new-approved-doctor', email='new@example.invalid', password='test-password', phone='0000000000', NIC_number='TEST00000001', birthday='1990-01-01', university='Test University', degrees='Test degree', working_hospital='Test Hospital')
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        path = '/approve-doctor/' + str(pending.pk) + '/'
        self.assertEqual(client.post(path).status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        self.assertEqual(client.post(path, HTTP_X_CSRFTOKEN=token).status_code, 200)
        user = User.objects.get(username=pending.username)
        self.assertTrue(user.is_approved)
        self.assertEqual(user.role, 'doctor')
        self.assertIn(user.pk, [item['id'] for item in client.get(self.endpoint + 'options/').json()['doctors']])
