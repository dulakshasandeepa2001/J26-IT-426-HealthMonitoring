from datetime import timedelta
from io import StringIO
from uuid import uuid4
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from accounts.models import User
from prescription_context.models import PrescriptionContextConsultation as Consultation
from prescription_context.models import PrescriptionContextDiagnosisconfirmation as Diagnosis
from .models import (LocationSample, ProximityEncounter, RiskZoneVersion, RiskZoneVisit,
                     ExposureAnalysis, TrackingConsent, DiagnosisMetadata)
from .serializers import LocationSerializer
from .services import cleanup, process_zone, process_user, process_encounters, refresh_summary


class ExposureTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.user = User.objects.create_user(username='tracking', role='patient', is_approved=True)
        self.other = User.objects.create_user(username='other', role='patient', is_approved=True)
        self.doctor = User.objects.create_user(username='doctor', role='doctor', is_approved=True)
        self.visit = Consultation.objects.create(patient=self.user, doctor=self.doctor, reason='existing')
        self.diagnosis = Diagnosis.objects.create(consultation=self.visit, doctor=self.doctor,
            condition_code='influenza', condition_label='Influenza')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def consent(self, user=None):
        return TrackingConsent.objects.create(user=user or self.user, granted=True)

    def wire(self, **changes):
        data = dict(client_record_id=str(uuid4()), latitude=6.0, longitude=80.0,
            accuracy_m=2, recorded_at=(self.now-timedelta(minutes=1)).isoformat(), data_mode='real')
        data.update(changes)
        return data

    def sample(self, user=None, **changes):
        data = dict(client_record_id=uuid4(), latitude=6, longitude=80, accuracy_m=2,
                    recorded_at=self.now-timedelta(minutes=1), data_mode='real')
        data.update(changes)
        return LocationSample.objects.create(user=user or self.user, **data)

    def zone(self, **changes):
        data = dict(version=1, disease_code='influenza', latitude=6, longitude=80, radius_m=100,
            risk_level='reviewed', valid_from=self.now-timedelta(days=2), valid_to=None,
            identified_at=self.now, source='test', review_status='approved', data_mode='real')
        data.update(changes)
        return RiskZoneVersion.objects.create(**data)

    def encounter(self, **changes):
        data = dict(user_a=self.user, user_b=self.other, started_at=self.now-timedelta(minutes=2),
            ended_at=self.now-timedelta(minutes=1), estimated_duration_seconds=0,
            estimated_distance_m=1, detection_source='gps', data_mode='real', deduplication_key=str(uuid4()))
        data.update(changes)
        return ProximityEncounter.objects.create(**data)

    def test_login_and_consent_required(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post('/api/exposure/locations/', {'samples': [self.wire()]}, format='json').status_code, 403)
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post('/api/exposure/locations/', {'samples': [self.wire()]}, format='json').status_code, 403)
        self.assertEqual(LocationSample.objects.count(), 0)

    def test_session_auth_and_csrf_are_used(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.user)
        self.assertEqual(client.get('/api/exposure/consent/').status_code, 200)
        self.assertEqual(client.put('/api/exposure/consent/', {'granted': True}, format='json').status_code, 403)

    def test_consent_can_be_revoked(self):
        for granted in (True, False):
            response = self.client.put('/api/exposure/consent/', {'granted': granted}, format='json')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data['granted'], granted)

    def test_replay_and_conflicting_replay_are_atomic(self):
        self.consent()
        sample = self.wire()
        for expected in (201, 200):
            self.assertEqual(self.client.post('/api/exposure/locations/', {'samples': [sample]}, format='json').status_code, expected)
        conflict = {**sample, 'latitude': 8}
        response = self.client.post('/api/exposure/locations/', {'samples': [self.wire(), conflict]}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(LocationSample.objects.count(), 1)

    def test_user_id_injection_and_mode_collision_rejected(self):
        self.consent()
        self.assertEqual(self.client.post('/api/exposure/locations/', {'samples': [self.wire(user_id=self.other.pk)]}, format='json').status_code, 400)
        sample = self.wire()
        self.client.post('/api/exposure/locations/', {'samples': [sample]}, format='json')
        sample['data_mode'] = 'synthetic_demo'
        self.assertEqual(self.client.post('/api/exposure/locations/', {'samples': [sample]}, format='json').status_code, 400)

    def test_validation_and_exact_retention_boundary(self):
        good = self.wire(recorded_at=(self.now-timedelta(days=14)).isoformat())
        self.assertTrue(LocationSerializer(data=good, context={'now': self.now}).is_valid())
        invalid = [dict(recorded_at=(self.now-timedelta(days=14, microseconds=1)).isoformat()),
            dict(recorded_at=(self.now+timedelta(seconds=1)).isoformat()), dict(recorded_at='2026-01-01T12:00:00'),
            dict(latitude=91), dict(longitude=-181), dict(accuracy_m=-1), dict(latitude=float('nan'))]
        for changes in invalid:
            with self.subTest(changes=changes):
                self.assertFalse(LocationSerializer(data=self.wire(**changes), context={'now': self.now}).is_valid())

    def test_timezone_offsets_normalized(self):
        sample = self.wire(recorded_at=(self.now-timedelta(hours=1)).astimezone(
            timezone.get_fixed_timezone(330)).isoformat())
        serializer = LocationSerializer(data=sample, context={'now': self.now})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        self.assertEqual(serializer.validated_data['recorded_at'], self.now-timedelta(hours=1))

    def test_read_is_own_unexpired_mode_only(self):
        own = self.sample()
        self.sample(user=self.other)
        self.sample(data_mode='synthetic_demo')
        self.sample(recorded_at=self.now-timedelta(days=15))
        response = self.client.get('/api/exposure/locations/')
        self.assertEqual([row['id'] for row in response.data], [own.pk])
        self.assertEqual(response['Cache-Control'], 'no-store')

    def test_zone_checks_time_space_consent_and_mode(self):
        self.consent()
        zone = self.zone()
        self.sample()
        self.sample(latitude=7)
        self.sample(recorded_at=self.now-timedelta(days=3))
        self.sample(data_mode='synthetic_demo')
        self.sample(user=self.other)
        self.sample(accuracy_m=101)
        self.assertEqual(process_zone(zone, self.now), 1)
        self.assertEqual(process_zone(zone, self.now), 0)
        visit = RiskZoneVisit.objects.get()
        self.assertEqual(visit.entered_at, visit.exited_at)
        self.assertEqual(visit.estimated_duration_seconds, 0)

    def test_new_zone_rechecks_14_days_and_preserves_versions(self):
        self.consent()
        self.sample(recorded_at=self.now-timedelta(days=13))
        zone = self.zone(valid_from=self.now-timedelta(days=14))
        process_zone(zone, self.now)
        self.assertEqual(RiskZoneVisit.objects.count(), 1)
        self.zone(zone_id=zone.zone_id, version=2, valid_from=self.now-timedelta(days=14), latitude=8)
        self.assertEqual(refresh_summary(self.user.pk, 'real', 'influenza').exposure_summary['zone_observations_14d'], 0)
        self.assertEqual(RiskZoneVisit.objects.count(), 1)

    def test_cleanup_boundaries_and_reference_safety(self):
        self.sample(recorded_at=self.now-timedelta(days=14))
        expired = self.sample(recorded_at=self.now-timedelta(days=14, seconds=1))
        self.encounter(started_at=self.now-timedelta(days=8), ended_at=self.now-timedelta(days=7))
        encounter = self.encounter(started_at=self.now-timedelta(days=9), ended_at=self.now-timedelta(days=8))
        analysis = ExposureAnalysis.objects.create(user=self.user, disease_code='influenza', data_mode='real', encounter=encounter)
        self.assertEqual(cleanup(now=self.now), {'LocationSample': 1, 'ProximityEncounter': 1})
        self.assertTrue(LocationSample.objects.filter(pk=expired.pk).exists())
        cleanup(dry_run=False, now=self.now)
        analysis.refresh_from_db()
        self.assertIsNone(analysis.encounter_id)
        self.assertEqual(LocationSample.objects.count(), 1)
        self.assertEqual(ProximityEncounter.objects.count(), 1)
        self.assertTrue(Diagnosis.objects.filter(pk=self.diagnosis.pk).exists())
        self.assertTrue(Consultation.objects.filter(pk=self.visit.pk).exists())
        self.assertEqual(User.objects.count(), 3)

    def test_cleanup_is_bounded_and_idempotent(self):
        for _ in range(3):
            self.sample(recorded_at=self.now-timedelta(days=15))
        self.assertEqual(cleanup(dry_run=False, batch_size=1, max_batches=1, now=self.now)['LocationSample'], 1)
        cleanup(dry_run=False, now=self.now)
        self.assertEqual(cleanup(dry_run=False, now=self.now)['LocationSample'], 0)
        output = StringIO()
        call_command('cleanup_exposure', '--dry-run', stdout=output)
        self.assertIn('LocationSample', output.getvalue())

    def test_self_encounters_rejected_by_database(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.encounter(user_b=self.user)

    def test_encounters_disabled_without_reviewed_policy(self):
        self.consent()
        self.consent(self.other)
        self.sample()
        self.sample(user=self.other)
        self.assertEqual(process_encounters(self.user.pk, 'real'), 0)

    @override_settings(EXPOSURE_GPS_POLICY={'distance_m': 10, 'max_accuracy_m': 3, 'time_tolerance_seconds': 2, 'review_reference': 'test-only'})
    def test_encounters_are_deduplicated_and_never_bridge_gaps(self):
        self.consent()
        self.consent(self.other)
        self.sample()
        self.sample(user=self.other)
        self.sample(user=self.other, recorded_at=self.now-timedelta(days=8))
        self.sample(user=self.other, data_mode='synthetic_demo')
        self.assertEqual(process_encounters(self.user.pk, 'real', self.now), 1)
        self.assertEqual(process_encounters(self.other.pk, 'real', self.now), 0)
        self.assertEqual(ProximityEncounter.objects.get().estimated_duration_seconds, 0)

    def test_processing_updates_summaries_without_medical_invention(self):
        self.consent()
        self.sample()
        self.zone()
        process_user(self.user.pk, 'real')
        process_user(self.user.pk, 'real')
        self.assertEqual(ExposureAnalysis.objects.count(), 6)
        analysis = ExposureAnalysis.objects.get(disease_code='influenza')
        self.assertIsNone(analysis.model_score)
        self.assertEqual(analysis.exposure_summary['zone_observations_14d'], 1)
        self.assertEqual(RiskZoneVisit.objects.count(), 1)

    def test_expired_encounters_excluded_from_read_before_cleanup(self):
        encounter = self.encounter()
        refresh_summary(self.user.pk, 'real', 'influenza')
        ProximityEncounter.objects.filter(pk=encounter.pk).update(started_at=self.now-timedelta(days=9), ended_at=self.now-timedelta(days=8))
        response = self.client.get('/api/exposure/analyses/')
        self.assertEqual(response.data[0]['exposure_summary']['encounters_7d'], 0)
        self.assertNotIn('user_b', str(response.data))

    def test_metadata_approval_does_not_confirm_or_change_legacy_diagnosis(self):
        url = f'/api/exposure/diagnoses/{self.diagnosis.pk}/metadata/'
        payload = {'doctor_approved': True, 'diagnosis_status': 'suspected'}
        self.assertEqual(self.client.put(url, payload, format='json').status_code, 403)
        self.client.force_authenticate(self.doctor)
        self.assertEqual(self.client.put(url, payload, format='json').status_code, 200)
        metadata = DiagnosisMetadata.objects.get()
        self.assertEqual(metadata.diagnosis_status, 'suspected')
        self.assertIsNone(metadata.diagnosed_at)
        self.assertEqual(metadata.approved_by, self.doctor)
        self.diagnosis.refresh_from_db()
        self.assertEqual(self.diagnosis.condition_code, 'influenza')

    def test_zone_write_requires_admin_and_is_append_only(self):
        zone = self.zone()
        from .serializers import ZoneSerializer
        payload = dict(ZoneSerializer(zone).data)
        payload.pop('id')
        self.assertEqual(self.client.post('/api/exposure/zones/', payload, format='json').status_code, 403)
        self.user.role = 'admin'
        self.user.save()
        self.assertEqual(self.client.post('/api/exposure/zones/', payload, format='json').status_code, 400)
        payload['version'] = 2
        self.assertEqual(self.client.post('/api/exposure/zones/', payload, format='json').status_code, 201)
        self.assertEqual(RiskZoneVersion.objects.count(), 2)

    def test_diagnosis_changes_are_seen_by_scheduled_reprocessing(self):
        self.consent()
        self.encounter()
        process_user(self.user.pk, 'real')
        analysis = ExposureAnalysis.objects.get(user=self.user, disease_code='mumps', data_mode='real')
        self.assertFalse(analysis.exposure_summary['diagnosis_review_required'])
        consultation = Consultation.objects.create(patient=self.other, doctor=self.doctor, reason='new')
        diagnosis = Diagnosis.objects.create(consultation=consultation, doctor=self.doctor,
            condition_code='mumps', condition_label='Mumps')
        call_command('process_exposure', '--all-users', stdout=StringIO())
        analysis.refresh_from_db()
        self.assertTrue(analysis.exposure_summary['diagnosis_review_required'])
        self.assertIsNone(analysis.model_score)
        diagnosis.condition_code = 'measles'
        diagnosis.save()
        process_user(self.user.pk, 'real')
        analysis.refresh_from_db()
        self.assertFalse(analysis.exposure_summary['diagnosis_review_required'])

    def test_other_doctor_cannot_update_metadata(self):
        self.other.role = 'doctor'
        self.other.save()
        self.client.force_authenticate(self.other)
        response = self.client.put(f'/api/exposure/diagnoses/{self.diagnosis.pk}/metadata/',
            {'doctor_approved': True}, format='json')
        self.assertEqual(response.status_code, 404)
        self.assertFalse(DiagnosisMetadata.objects.exists())

    def test_closed_and_unreviewed_zones_are_not_used(self):
        self.consent()
        self.sample()
        self.assertEqual(process_zone(self.zone(valid_to=self.now-timedelta(hours=1)), self.now), 0)
        self.assertEqual(process_zone(self.zone(review_status='pending'), self.now), 0)
        self.assertEqual(process_zone(self.zone(valid_from=self.now+timedelta(days=1)), self.now), 0)

    def test_cleanup_preserves_zone_history_and_minimal_summaries(self):
        self.consent()
        self.sample()
        process_user(self.user.pk, 'real')
        zone = self.zone()
        process_zone(zone)
        cleanup(dry_run=False, now=self.now+timedelta(days=30))
        self.assertEqual(LocationSample.objects.count(), 0)
        self.assertEqual(RiskZoneVersion.objects.count(), 1)
        self.assertEqual(RiskZoneVisit.objects.count(), 1)
        self.assertEqual(ExposureAnalysis.objects.count(), 6)
