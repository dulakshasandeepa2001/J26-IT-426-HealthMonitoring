"""Explicit, replay-safe processing; never invoked from legacy request signals."""
import hashlib
import math
from datetime import timedelta
from django.db import transaction
from django.conf import settings
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from .models import (TrackingConsent, LocationSample, ProximityEncounter,
                     RiskZoneVersion, RiskZoneVisit, ExposureAnalysis, DISEASES)


def key(*values):
    return hashlib.sha256('|'.join(str(v) for v in values).encode()).hexdigest()


def distance_m(a_lat, a_lon, b_lat, b_lon):
    lat1, lat2 = math.radians(a_lat), math.radians(b_lat)
    dlat, dlon = lat2 - lat1, math.radians(b_lon - a_lon)
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371008.8 * 2 * math.asin(math.sqrt(min(1, max(0, h))))


@transaction.atomic
def upload_locations(user, samples):
    consent = TrackingConsent.objects.select_for_update().filter(user=user).first()
    if not consent or not consent.granted:
        raise PermissionDenied('Tracking consent is required.')
    created_count = 0
    for sample in samples:
        row, created = LocationSample.objects.get_or_create(
            user=user, client_record_id=sample['client_record_id'], defaults=sample)
        if not created and any(getattr(row, field) != value for field, value in sample.items()):
            raise ValidationError('client_record_id was already used for a different sample.')
        created_count += int(created)
    return {'created': created_count, 'duplicates': len(samples) - created_count}


def process_zone(zone, now=None, user_id=None):
    """A single observation proves presence, not continuous residence.

    Zero-duration visits deliberately do not interpolate through missing GPS.
    Unknown valid_to means open-ended until a subsequent reviewed version.
    """
    now = now or timezone.now()
    if zone.review_status != 'approved':
        return 0
    samples = LocationSample.objects.filter(
        data_mode=zone.data_mode, recorded_at__gte=max(now - timedelta(days=14), zone.valid_from),
        recorded_at__lte=now, user__trackingconsent__granted=True)
    if user_id is not None:
        samples = samples.filter(user_id=user_id)
    if zone.valid_to:
        samples = samples.filter(recorded_at__lte=zone.valid_to)
    # A new approved version supersedes the earlier one from its effective start.
    successors = list(RiskZoneVersion.objects.filter(
        zone_id=zone.zone_id, data_mode=zone.data_mode,
        review_status='approved', version__gt=zone.version).values_list('valid_from', flat=True))
    if successors:
        samples = samples.filter(recorded_at__lt=min(successors))
    count = 0
    for sample in samples.iterator(chunk_size=500):
        distance = distance_m(sample.latitude, sample.longitude, zone.latitude, zone.longitude)
        # Require the accuracy disk to fit within the zone; uncertain boundary
        # overlap is not silently promoted to a definite visit.
        if distance + sample.accuracy_m > zone.radius_m:
            continue
        _, created = RiskZoneVisit.objects.get_or_create(
            deduplication_key=key('zone', zone.pk, sample.user_id, sample.client_record_id),
            defaults=dict(user_id=sample.user_id, zone_version=zone,
                          entered_at=sample.recorded_at, exited_at=sample.recorded_at,
                          estimated_duration_seconds=0, data_mode=sample.data_mode,
                          quality_flags=['single_observation', 'entry_exit_estimated', 'duration_unknown']))
        count += int(created)
    return count


def refresh_summary(user_id, mode, disease_code, now=None):
    now = now or timezone.now()
    # No participant identities, encounter payloads or trajectories are copied.
    visits = RiskZoneVisit.objects.filter(user_id=user_id, data_mode=mode,
        zone_version__disease_code=disease_code, zone_version__review_status='approved',
        entered_at__gte=now - timedelta(days=14))
    # Old version visits remain historical evidence, but never score superseded
    # observations as current zone evidence.
    visit_count = 0
    for visit in visits.select_related('zone_version').iterator(chunk_size=500):
        if not RiskZoneVersion.objects.filter(zone_id=visit.zone_version.zone_id,
                data_mode=mode, review_status='approved', version__gt=visit.zone_version.version,
                valid_from__lte=visit.entered_at).exists():
            visit_count += 1
    encounters = ProximityEncounter.objects.filter(
        Q(user_a_id=user_id) | Q(user_b_id=user_id), data_mode=mode, ended_at__gte=now-timedelta(days=7))
    # Diagnosis linkage can be reviewed, but an infectious window is not inferred
    # from confirmation/approval timestamps.
    from prescription_context.models import PrescriptionContextDiagnosisconfirmation as Diagnosis
    peer_ids = set()
    for a, b in encounters.values_list('user_a_id', 'user_b_id'):
        peer_ids.add(b if a == user_id else a)
    diagnosis_count = Diagnosis.objects.filter(consultation__patient_id__in=peer_ids,
        consultation__is_demo=(mode == 'synthetic_demo'), condition_code__iexact=disease_code).count()
    summary = {
        'status': 'not_scored', 'zone_observations_14d': visit_count,
        'encounters_7d': encounters.count(),
        'diagnosis_review_required': bool(diagnosis_count),
        'limitations': ['Reviewed detection thresholds and infectious windows are not configured.',
                       'Existing simulation model requires unavailable medical and 28-day features; no values were fabricated.',
                       'A missing encounter or visit is not proof of no exposure.'],
    }
    return ExposureAnalysis.objects.update_or_create(user_id=user_id, data_mode=mode,
        disease_code=disease_code, defaults={'exposure_summary': summary, 'model_score': None,
                                           'model_version': '', 'feature_schema_version': ''})[0]


def process_user(user_id, mode):
    if not TrackingConsent.objects.filter(user_id=user_id, granted=True).exists():
        return
    process_encounters(user_id, mode)
    for zone in RiskZoneVersion.objects.filter(review_status='approved', data_mode=mode).iterator():
        process_zone(zone, user_id=user_id)
    for disease_code, _ in DISEASES:
        refresh_summary(user_id, mode, disease_code)


def process_encounters(user_id, mode, now=None):
    """Conservative instantaneous GPS co-observations, with reviewed settings.

    No default distance, accuracy or time tolerance is a clinical recommendation.
    No durations are synthesized between samples and no expired rows recreated.
    """
    policy = getattr(settings, 'EXPOSURE_GPS_POLICY', None)
    if not policy:
        return 0
    required = ('distance_m', 'max_accuracy_m', 'time_tolerance_seconds')
    if (not isinstance(policy, dict) or not policy.get('review_reference') or
            any(not isinstance(policy.get(k), (int, float)) or isinstance(policy[k], bool)
                or not math.isfinite(policy[k]) or policy[k] < 0 for k in required)):
        raise ValueError('EXPOSURE_GPS_POLICY requires reviewed finite nonnegative thresholds and review_reference.')
    now = now or timezone.now()
    earliest = now - timedelta(days=7)
    tolerance = timedelta(seconds=policy['time_tolerance_seconds'])
    samples = LocationSample.objects.filter(user_id=user_id, data_mode=mode,
        recorded_at__gte=earliest, recorded_at__lte=now,
        accuracy_m__lte=policy['max_accuracy_m'])
    count = 0
    for sample in samples.iterator(chunk_size=500):
        others = LocationSample.objects.filter(data_mode=mode,
            user__trackingconsent__granted=True, accuracy_m__lte=policy['max_accuracy_m'],
            recorded_at__gte=max(earliest, sample.recorded_at-tolerance),
            recorded_at__lte=min(now, sample.recorded_at+tolerance)).exclude(user_id=user_id)
        for other in others.iterator(chunk_size=500):
            distance = distance_m(sample.latitude, sample.longitude, other.latitude, other.longitude)
            if distance + sample.accuracy_m + other.accuracy_m > policy['distance_m']:
                continue
            a, b = sorted((sample, other), key=lambda row: row.user_id)
            start, end = sorted((a.recorded_at, b.recorded_at))
            _, created = ProximityEncounter.objects.get_or_create(
                deduplication_key=key('gps', mode, a.user_id, a.client_record_id, b.user_id, b.client_record_id),
                defaults=dict(user_a_id=a.user_id, user_b_id=b.user_id, started_at=start, ended_at=end,
                    estimated_duration_seconds=0, estimated_distance_m=distance, detection_source='gps',
                    quality_flags=['single_co_observation', 'duration_unknown'], data_mode=mode))
            count += int(created)
    return count


def cleanup(*, dry_run=True, batch_size=500, max_batches=10, now=None):
    """Bounded deletion, exclusively from the two NEW expiring tables."""
    now = now or timezone.now()
    counts = {}
    for model, field, days in ((LocationSample, 'recorded_at', 14), (ProximityEncounter, 'ended_at', 7)):
        expired = model.objects.filter(**{field + '__lt': now - timedelta(days=days)})
        if dry_run:
            counts[model.__name__] = expired.count()
            continue
        total = 0
        for _ in range(max_batches):
            with transaction.atomic():
                ids = list(expired.order_by('pk').values_list('pk', flat=True)[:batch_size])
                if not ids:
                    break
                _, deleted = expired.filter(pk__in=ids).delete()
                total += deleted.get(model._meta.label, 0)
        counts[model.__name__] = total
    return counts
