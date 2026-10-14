"""Validated v1 handoff from Component 1; payloads are data, never instructions."""

import math
from rest_framework import serializers


class StrictSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, dict):
            unexpected = set(data) - set(self.fields)
            if unexpected:
                raise serializers.ValidationError({'non_field_errors': [
                    'Unsupported fields: ' + ', '.join(sorted(unexpected)),
                ]})
        return super().to_internal_value(data)


class SymptomSerializer(StrictSerializer):
    code = serializers.RegexField(r'^[a-z][a-z0-9_]{0,49}$')
    present = serializers.BooleanField()
    duration_days = serializers.IntegerField(min_value=0, max_value=365, allow_null=True)


class ConditionCandidateSerializer(StrictSerializer):
    code = serializers.ChoiceField(choices=('influenza', 'chickenpox'))
    confidence = serializers.FloatField(min_value=0, max_value=1)

    def validate_confidence(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError('Confidence must be a finite number between 0 and 1.')
        return value


class SeveritySerializer(StrictSerializer):
    level = serializers.ChoiceField(choices=('mild', 'moderate', 'severe', 'unknown'))
    red_flags = serializers.ListField(child=serializers.CharField(max_length=200), max_length=20)


class Component1PayloadSerializer(StrictSerializer):
    schema_version = serializers.ChoiceField(choices=('1.0',))
    analysis_reference = serializers.RegexField(r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$', max_length=150)
    patient_id = serializers.IntegerField(min_value=1)
    consultation_id = serializers.UUIDField()
    source = serializers.ChoiceField(choices=('component_1_sample', 'component_1'))
    is_demo = serializers.BooleanField()
    symptoms = SymptomSerializer(many=True, min_length=1, max_length=50)
    condition_candidates = ConditionCandidateSerializer(many=True, min_length=1, max_length=2)
    severity = SeveritySerializer()
    review_status = serializers.ChoiceField(choices=('unconfirmed',))
    model_version = serializers.CharField(max_length=100)

    def validate(self, data):
        if data['consultation_id'].int == 0:
            raise serializers.ValidationError({'consultation_id': 'Use the registered consultation UUID.'})
        expected_source = 'component_1_sample' if data['is_demo'] else 'component_1'
        if data['source'] != expected_source:
            raise serializers.ValidationError({'source': 'Source must match the demo status.'})
        if not data['is_demo'] and data['model_version'].lower().startswith(('synthetic', 'demo')):
            raise serializers.ValidationError({'model_version': 'A synthetic model cannot be presented as a real result.'})
        for field in ('symptoms', 'condition_candidates'):
            codes = [item['code'] for item in data[field]]
            if len(codes) != len(set(codes)):
                raise serializers.ValidationError({field: 'Duplicate codes are not allowed.'})
        data['consultation_id'] = str(data['consultation_id'])
        return data


class DemoScenarioSerializer(StrictSerializer):
    scenario = serializers.ChoiceField(choices=('influenza', 'chickenpox', 'member1_influenza'))
