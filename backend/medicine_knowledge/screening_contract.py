from rest_framework import serializers
from prescription_context.analysis_contract import StrictSerializer
from prescription_context.member1_v21 import BOOLEAN_OBSERVATIONS
from prescription_context.member1_adapter import BooleanFlagField
from prescription_drafts.contracts import ClinicalDetailsSerializer

SYMPTOMS = ('fever', 'body_aches', 'itching', 'jaw_pain', 'ocular_dryness', 'ocular_irritation', 'diarrhoea', 'vomiting', 'recent_fluid_loss')


class ConcernSerializer(StrictSerializer):
    def get_fields(self):
        return {name: BooleanFlagField(allow_null=True, default=None, required=False) for name in BOOLEAN_OBSERVATIONS}


class SixConditionClinicalSerializer(ClinicalDetailsSerializer):
    reviewed = BooleanFlagField()
    symptoms_reviewed = BooleanFlagField(default=False)
    verified_symptoms = serializers.ListField(child=serializers.ChoiceField(choices=SYMPTOMS), max_length=9, default=list)
    condition_assessments = ConcernSerializer(default=dict)
    care_setting = serializers.ChoiceField(choices=('unknown', 'outpatient', 'hospital'), default='unknown')
    condition_severity = serializers.ChoiceField(choices=('unknown', 'mild', 'moderate', 'severe'), default='unknown')
    influenza_guideline = serializers.ChoiceField(choices=('unselected', 'CDC_2026', 'WHO_2024'), default='unselected')
    ophthalmic_integrity = serializers.ChoiceField(choices=('unknown', 'acceptable', 'requires_review'), default='unknown')
    excipient_assessment = serializers.ChoiceField(choices=('unknown', 'acceptable', 'requires_review'), default='unknown')
    dehydration_assessment = serializers.ChoiceField(choices=('unknown', 'none', 'mild', 'moderate', 'severe'), default='unknown')
    oral_fluid_tolerance = serializers.ChoiceField(choices=('unknown', 'tolerated', 'not_tolerated'), default='unknown')
    nsaid_assessment = serializers.ChoiceField(choices=('unknown', 'standard', 'requires_review'), default='unknown')
    gi_bleeding_assessment = serializers.ChoiceField(choices=('unknown', 'none', 'present'), default='unknown')
    cardiovascular_assessment = serializers.ChoiceField(choices=('unknown', 'standard', 'requires_review'), default='unknown')

    def get_fields(self):
        fields = super().get_fields()
        for name in ('red_flags', 'renal_assessment', 'hepatic_assessment', 'special_population', 'varicella_risk', 'laiv_timing'):
            fields[name].required = False
            fields[name].default = 'unknown'
        for name in ('onset_hours', 'weight_kg'):
            fields[name].required = False
            fields[name].default = None
        return fields

    def validate_symptom_durations(self, value):
        if set(value) - set(SYMPTOMS):
            raise serializers.ValidationError('Unsupported symptom duration key.')
        return value

    def validate(self, data):
        data['condition_assessments'] = {name: data['condition_assessments'].get(name) for name in BOOLEAN_OBSERVATIONS}
        if not data['symptoms_reviewed'] and data['verified_symptoms']:
            raise serializers.ValidationError('Confirm symptom review before supplying verified targets.')
        if set(data['symptom_durations']) - set(data['verified_symptoms']):
            raise serializers.ValidationError('Durations may only describe verified present symptom targets.')
        return data


class SixConditionPreviewSerializer(StrictSerializer):
    diagnosis_id = serializers.IntegerField(min_value=1)
    expected_context_updated_at = serializers.DateTimeField()
    expected_analysis_hash = serializers.RegexField(r'^[a-f0-9]{64}$')
    clinical = SixConditionClinicalSerializer()


class SixConditionSaveSerializer(SixConditionPreviewSerializer):
    request_key = serializers.UUIDField()
    expected_latest_revision = serializers.IntegerField(min_value=0)
    expected_plan_hash = serializers.RegexField(r'^[a-f0-9]{64}$')
