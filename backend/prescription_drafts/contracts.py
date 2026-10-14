from rest_framework import serializers
from decimal import Decimal
from prescription_context.analysis_contract import StrictSerializer


class ClinicalDetailsSerializer(StrictSerializer):
    reviewed = serializers.BooleanField()
    onset_hours = serializers.DecimalField(max_digits=6, decimal_places=1, min_value=0, max_value=8760, allow_null=True)
    red_flags = serializers.ChoiceField(choices=('none', 'present', 'unknown'))
    renal_assessment = serializers.ChoiceField(choices=('standard', 'requires_adjustment', 'unknown'))
    hepatic_assessment = serializers.ChoiceField(choices=('standard', 'requires_review', 'unknown'))
    special_population = serializers.ChoiceField(choices=('standard', 'requires_review', 'unknown'))
    varicella_risk = serializers.ChoiceField(choices=('risk_group_confirmed', 'typical_uncomplicated_child', 'unknown'))
    laiv_timing = serializers.ChoiceField(choices=('no_conflict', 'requires_review', 'unknown'))
    weight_kg = serializers.DecimalField(max_digits=4, decimal_places=1, min_value=Decimal('0.1'), max_value=350, allow_null=True)
    verified_symptoms = serializers.ListField(child=serializers.ChoiceField(choices=('fever', 'body_aches', 'itching')), max_length=3, default=list)
    symptoms_reviewed = serializers.BooleanField(default=False)
    symptom_durations = serializers.DictField(child=serializers.DecimalField(max_digits=6, decimal_places=1, min_value=0, max_value=8760, allow_null=True), default=dict)
    topical_assessment = serializers.ChoiceField(choices=('standard', 'requires_review', 'unknown'), default='unknown')

    def validate_verified_symptoms(self, value):
        if len(value) != len(set(value)):
            raise serializers.ValidationError('Symptom targets must be unique.')
        return value

    def validate_symptom_durations(self, value):
        if set(value) - {'fever', 'body_aches', 'itching'}:
            raise serializers.ValidationError('Unsupported symptom duration key.')
        return value

    def validate_reviewed(self, value):
        if not value:
            raise serializers.ValidationError('Review these clinical inputs for this visit before screening.')
        return value


class DoseSerializer(StrictSerializer):
    schedule_type = serializers.ChoiceField(choices=('scheduled', 'oral_prn', 'topical_prn'), default='scheduled')
    amount = serializers.DecimalField(max_digits=8, decimal_places=3, min_value=Decimal('0.001'), max_value=99999, allow_null=True, default=None)
    unit = serializers.ChoiceField(choices=('mg', 'g', 'mL'), allow_null=True, default=None)
    doses_per_day = serializers.IntegerField(min_value=1, max_value=24, allow_null=True, default=None)
    duration_days = serializers.IntegerField(min_value=1, max_value=365, allow_null=True, default=None)
    route = serializers.ChoiceField(choices=('oral', 'topical'))
    interval_hours = serializers.IntegerField(min_value=1, max_value=24, allow_null=True, default=None)
    max_doses_per_day = serializers.IntegerField(min_value=1, max_value=24, allow_null=True, default=None)
    max_daily_amount_mg = serializers.IntegerField(min_value=1, max_value=99999, allow_null=True, default=None)
    review_after_days = serializers.IntegerField(min_value=1, max_value=365, allow_null=True, default=None)
    instructions = serializers.CharField(max_length=1000, allow_blank=True, default='')

    def validate(self, data):
        if data['schedule_type'] == 'scheduled' and any(data[key] is None for key in ('amount', 'unit', 'doses_per_day', 'duration_days')):
            raise serializers.ValidationError('A scheduled regimen needs amount, unit, frequency and duration.')
        if data['schedule_type'] == 'topical_prn' and (data['route'] != 'topical' or any(data[key] is not None for key in ('amount', 'unit', 'doses_per_day', 'duration_days', 'interval_hours', 'max_doses_per_day', 'max_daily_amount_mg'))):
            raise serializers.ValidationError('The topical as-needed regimen has no numeric amount, interval or fixed course.')
        if data['schedule_type'] == 'oral_prn' and (data['route'] != 'oral' or data['amount'] is None or data['unit'] is None or data['interval_hours'] is None or data['max_doses_per_day'] is None or data['max_daily_amount_mg'] is None or data['doses_per_day'] is not None or data['duration_days'] is not None):
            raise serializers.ValidationError('Oral as-needed dosing needs mass, spacing and daily limits, with no fixed course.')
        return data


class ProposalSerializer(StrictSerializer):
    medicine_id = serializers.SlugField(max_length=100)
    dose = DoseSerializer(allow_null=True)
    origin = serializers.ChoiceField(choices=('manual', 'rule_suggestion'), default='manual')


class RegimenClinicalSerializer(ClinicalDetailsSerializer):
    reviewed = serializers.BooleanField(default=False)

    def validate_reviewed(self, value):
        # A read-only suggestion cannot acknowledge the resulting regimen.
        return False


class RegimenRequestSerializer(StrictSerializer):
    diagnosis_id = serializers.IntegerField(min_value=1)
    expected_context_updated_at = serializers.DateTimeField()
    clinical = RegimenClinicalSerializer()


class DraftRequestSerializer(StrictSerializer):
    request_key = serializers.UUIDField()
    diagnosis_id = serializers.IntegerField(min_value=1)
    expected_context_updated_at = serializers.DateTimeField()
    expected_latest_revision = serializers.IntegerField(min_value=0)
    clinical = ClinicalDetailsSerializer()
    proposals = ProposalSerializer(many=True, max_length=10)
    selection_mode = serializers.ChoiceField(choices=('manual', 'automatic'), default='manual')
    expected_plan_hash = serializers.RegexField(regex=r'^[0-9a-f]{64}$', required=False)

    def validate(self, data):
        if data['selection_mode'] == 'automatic' and data['proposals']:
            raise serializers.ValidationError({'proposals': 'Automatic selection derives all regimens on the server; do not submit medicine proposals.'})
        if data['selection_mode'] == 'automatic' and 'expected_plan_hash' not in data:
            raise serializers.ValidationError({'expected_plan_hash': 'Preview and review the current automatic plan before generation.'})
        return data

    def validate_proposals(self, value):
        ids = [item['medicine_id'] for item in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError('Each medicine can have only one proposed dose in a draft.')
        return value
