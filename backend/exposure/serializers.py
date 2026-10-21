import math
from datetime import timedelta
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import serializers
from .models import LocationSample, RiskZoneVersion, DiagnosisMetadata, MODES


class AwareDateTime(serializers.DateTimeField):
    def to_internal_value(self, value):
        try:
            parsed = parse_datetime(value) if isinstance(value, str) else value
            if parsed is None or timezone.is_naive(parsed):
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise serializers.ValidationError('Use an ISO-8601 timestamp with a timezone offset.')
        return super().to_internal_value(value)


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict) and set(data) - set(self.fields):
            raise serializers.ValidationError('Unsupported fields: ' + ', '.join(sorted(set(data) - set(self.fields))))
        return super().to_internal_value(data)


class LocationSerializer(StrictSerializer, serializers.ModelSerializer):
    recorded_at = AwareDateTime()

    class Meta:
        model = LocationSample
        fields = ['client_record_id', 'latitude', 'longitude', 'recorded_at', 'accuracy_m', 'data_mode']

    def validate(self, data):
        now = self.context.get('now', timezone.now())
        if data['recorded_at'] < now - timedelta(days=14):
            raise serializers.ValidationError({'recorded_at': 'Expired: raw locations are retained for 14 days.'})
        # Reject future timestamps rather than invent a tolerated skew.
        if data['recorded_at'] > now:
            raise serializers.ValidationError({'recorded_at': 'Future timestamps are not accepted; synchronize the device clock.'})
        if not all(math.isfinite(data[k]) for k in ('latitude', 'longitude', 'accuracy_m')):
            raise serializers.ValidationError('Coordinates and accuracy must be finite.')
        return data


class BatchSerializer(StrictSerializer):
    samples = LocationSerializer(many=True, allow_empty=False, max_length=500)


class ConsentSerializer(StrictSerializer):
    granted = serializers.BooleanField()


class ModeSerializer(StrictSerializer):
    data_mode = serializers.ChoiceField(choices=MODES, default='real')


class ZoneSerializer(StrictSerializer, serializers.ModelSerializer):
    valid_from = AwareDateTime()
    valid_to = AwareDateTime(allow_null=True, required=False)
    identified_at = AwareDateTime()

    class Meta:
        model = RiskZoneVersion
        fields = ['id', 'zone_id', 'version', 'disease_code', 'latitude', 'longitude', 'radius_m', 'risk_level', 'valid_from', 'valid_to', 'identified_at', 'source', 'review_status', 'data_mode']
        read_only_fields = ['id']
        validators = []

    def validate(self, data):
        if data.get('valid_to') and data['valid_to'] < data['valid_from']:
            raise serializers.ValidationError('valid_to must not precede valid_from.')
        if data['version'] < 1 or not all(math.isfinite(data[k]) for k in ('latitude', 'longitude', 'radius_m')):
            raise serializers.ValidationError('Use a positive version and finite geometry.')
        return data


class MetadataSerializer(StrictSerializer, serializers.ModelSerializer):
    doctor_approved = serializers.BooleanField(required=True)
    symptom_started_at = AwareDateTime(allow_null=True, required=False)
    diagnosed_at = AwareDateTime(allow_null=True, required=False)

    class Meta:
        model = DiagnosisMetadata
        fields = ['diagnosis_status', 'symptom_started_at', 'diagnosed_at', 'doctor_approved']

    def validate(self, data):
        if any(data.get(k) and data[k] > timezone.now() for k in ('symptom_started_at', 'diagnosed_at')):
            raise serializers.ValidationError('Medical event dates cannot be in the future; leave unknown dates null.')
        return data
