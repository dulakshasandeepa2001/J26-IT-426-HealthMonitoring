"""Additive tracking storage. No signals or writes to legacy business records."""
import uuid
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.db.models import F, Q

MODES = [('real', 'Real'), ('synthetic_demo', 'Synthetic demo')]
DISEASES = [(code, code.replace('_', ' ').title()) for code in (
    'influenza', 'chickenpox', 'measles', 'mumps',
    'viral_conjunctivitis', 'viral_gastroenteritis')]


class TrackingConsent(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, models.CASCADE)
    granted = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)


class LocationSample(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.CASCADE)
    client_record_id = models.UUIDField()
    latitude = models.FloatField(validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.FloatField(validators=[MinValueValidator(-180), MaxValueValidator(180)])
    recorded_at = models.DateTimeField(db_index=True)
    accuracy_m = models.FloatField(validators=[MinValueValidator(0)])
    received_at = models.DateTimeField(auto_now_add=True)
    data_mode = models.CharField(max_length=20, choices=MODES)

    class Meta:
        indexes = [models.Index(fields=['user', 'recorded_at'])]
        constraints = [
            models.UniqueConstraint(fields=['user', 'client_record_id'], name='exposure_unique_sample'),
            models.CheckConstraint(condition=Q(latitude__gte=-90, latitude__lte=90, longitude__gte=-180, longitude__lte=180, accuracy_m__gte=0), name='exposure_valid_location'),
        ]


class ProximityEncounter(models.Model):
    user_a = models.ForeignKey(settings.AUTH_USER_MODEL, models.CASCADE, related_name='+')
    user_b = models.ForeignKey(settings.AUTH_USER_MODEL, models.CASCADE, related_name='+')
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(db_index=True)
    estimated_duration_seconds = models.FloatField(validators=[MinValueValidator(0)])
    estimated_distance_m = models.FloatField(validators=[MinValueValidator(0)])
    detection_source = models.CharField(max_length=10, choices=[('gps', 'GPS'), ('ble', 'BLE')])
    quality_flags = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    data_mode = models.CharField(max_length=20, choices=MODES)
    deduplication_key = models.CharField(max_length=64, unique=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(user_a__lt=F('user_b')), name='exposure_ordered_pair'),
            models.CheckConstraint(condition=Q(ended_at__gte=F('started_at'), estimated_duration_seconds__gte=0, estimated_distance_m__gte=0), name='exposure_valid_encounter'),
        ]


class DiagnosisMetadata(models.Model):
    diagnosis = models.OneToOneField('prescription_context.PrescriptionContextDiagnosisconfirmation', models.CASCADE, related_name='exposure_metadata')
    # Disease, ownership, confirmation time and confirming doctor are already
    # available through diagnosis -> consultation. Never copy or fabricate them.
    diagnosis_status = models.CharField(max_length=12, choices=[('unknown', 'Unknown'), ('suspected', 'Suspected'), ('confirmed', 'Confirmed')], default='unknown')
    symptom_started_at = models.DateTimeField(null=True, blank=True)
    diagnosed_at = models.DateTimeField(null=True, blank=True)
    doctor_approved = models.BooleanField(default=False)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, models.SET_NULL, null=True, blank=True, related_name='+')
    approved_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)


class RiskZoneVersion(models.Model):
    zone_id = models.UUIDField(default=uuid.uuid4)
    version = models.PositiveIntegerField()
    disease_code = models.CharField(max_length=30, choices=DISEASES)
    # Circle geometry avoids a new PostGIS dependency.
    latitude = models.FloatField(validators=[MinValueValidator(-90), MaxValueValidator(90)])
    longitude = models.FloatField(validators=[MinValueValidator(-180), MaxValueValidator(180)])
    radius_m = models.FloatField(validators=[MinValueValidator(0)])
    risk_level = models.CharField(max_length=30)
    valid_from = models.DateTimeField()
    valid_to = models.DateTimeField(null=True, blank=True)
    identified_at = models.DateTimeField()
    source = models.CharField(max_length=200)
    review_status = models.CharField(max_length=10, choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='pending')
    created_at = models.DateTimeField(auto_now_add=True)
    data_mode = models.CharField(max_length=20, choices=MODES)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['zone_id', 'version'], name='exposure_unique_zone_version'),
            models.CheckConstraint(condition=Q(valid_to__isnull=True) | Q(valid_to__gte=F('valid_from')), name='exposure_valid_zone_time'),
            models.CheckConstraint(condition=Q(latitude__gte=-90, latitude__lte=90, longitude__gte=-180, longitude__lte=180, radius_m__gte=0, version__gte=1), name='exposure_valid_zone_geometry'),
        ]


class RiskZoneVisit(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.CASCADE)
    zone_version = models.ForeignKey(RiskZoneVersion, models.PROTECT)
    entered_at = models.DateTimeField()
    exited_at = models.DateTimeField()
    estimated_duration_seconds = models.FloatField(validators=[MinValueValidator(0)])
    detected_at = models.DateTimeField(auto_now_add=True)
    quality_flags = models.JSONField(default=list)
    data_mode = models.CharField(max_length=20, choices=MODES)
    deduplication_key = models.CharField(max_length=64, unique=True)

    class Meta:
        constraints = [models.CheckConstraint(condition=Q(exited_at__gte=F('entered_at'), estimated_duration_seconds__gte=0), name='exposure_valid_visit')]


class ExposureAnalysis(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, models.CASCADE)
    disease_code = models.CharField(max_length=30, choices=DISEASES)
    analysed_at = models.DateTimeField(auto_now=True)
    model_version = models.CharField(max_length=100, blank=True)
    feature_schema_version = models.CharField(max_length=100, blank=True)
    model_score = models.FloatField(null=True, blank=True)
    exposure_summary = models.JSONField(default=dict)
    data_mode = models.CharField(max_length=20, choices=MODES)
    encounter = models.ForeignKey(ProximityEncounter, models.SET_NULL, null=True, blank=True)
    zone_visit = models.ForeignKey(RiskZoneVisit, models.SET_NULL, null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'disease_code', 'data_mode'], name='exposure_unique_summary')]
