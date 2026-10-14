"""Versioned Member 1 voice-result adapter. No diagnosis or patient-context writes."""

import copy
import math
import re

from rest_framework import serializers
from .analysis_contract import StrictSerializer


PILOT_CONDITIONS = {'influenza', 'chickenpox'}
SYMPTOM_ALIASES = {
    'fever': 'fever', 'high fever': 'fever',
    'cough': 'cough', 'dry cough': 'cough',
    'sore throat': 'sore_throat',
    'body aches': 'body_aches', 'muscle aches': 'body_aches',
    'myalgia': 'body_aches', 'myalgia (body aches)': 'body_aches',
    'rash': 'rash', 'itching': 'itching',
}
SYMPTOM_CODES = set(SYMPTOM_ALIASES.values())


class FiniteNumberField(serializers.FloatField):
    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, (int, float)):
            self.fail('invalid')
        try:
            finite = math.isfinite(float(data))
        except (OverflowError, ValueError):
            finite = False
        if not finite:
            self.fail('invalid')
        return super().to_internal_value(data)


class ScoreField(FiniteNumberField):
    def __init__(self, **kwargs):
        super().__init__(min_value=0, max_value=1, **kwargs)


class TextField(serializers.CharField):
    def to_internal_value(self, data):
        if not isinstance(data, str):
            self.fail('invalid')
        return super().to_internal_value(data)


class PositiveIdField(serializers.IntegerField):
    def __init__(self, **kwargs):
        super().__init__(min_value=1, **kwargs)

    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, int):
            self.fail('invalid')
        return super().to_internal_value(data)


class BooleanFlagField(serializers.BooleanField):
    def to_internal_value(self, data):
        if not isinstance(data, bool):
            self.fail('invalid', input=data)
        return super().to_internal_value(data)


class IntegerDaysField(serializers.IntegerField):
    def __init__(self, **kwargs):
        super().__init__(min_value=0, max_value=365, **kwargs)

    def to_internal_value(self, data):
        if isinstance(data, bool) or not isinstance(data, int):
            self.fail('invalid')
        return super().to_internal_value(data)


class LowerChoiceField(serializers.ChoiceField):
    def to_internal_value(self, data):
        if isinstance(data, str):
            data = data.lower()
        return super().to_internal_value(data)


class TimestampField(serializers.DateTimeField):
    def to_internal_value(self, data):
        if not isinstance(data, str) or not re.search(r'(Z|[+-]\d{2}:\d{2})$', data):
            raise serializers.ValidationError('Use an ISO timestamp with an explicit UTC offset.')
        return super().to_internal_value(data)


class AudioSerializer(StrictSerializer):
    duration_seconds = FiniteNumberField(min_value=0, max_value=86400)
    language = serializers.RegexField(r'^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$', max_length=35)
    audio_quality = LowerChoiceField(choices=('clear', 'noisy', 'poor', 'unknown'))

    def validate_duration_seconds(self, value):
        if not math.isfinite(value):
            raise serializers.ValidationError('Audio duration must be finite.')
        return value


class ExtractedSymptomSerializer(StrictSerializer):
    symptom = TextField(max_length=200)
    code = serializers.RegexField(r'^[a-z][a-z0-9_]{0,49}$', required=False)
    present = BooleanFlagField(required=False, default=True)
    duration = TextField(max_length=100)
    duration_days = IntegerDaysField(required=False, allow_null=True)
    severity = LowerChoiceField(choices=('mild', 'moderate', 'severe', 'unknown'))
    confidence = ScoreField()

    def validate(self, data):
        inferred = SYMPTOM_ALIASES.get(' '.join(data['symptom'].casefold().split()))
        if inferred and data.get('code') and data['code'] != inferred:
            raise serializers.ValidationError({'code': 'Structured code conflicts with the known symptom label.'})
        parsed_days = duration_days(data['duration'])
        if data.get('duration_days') is not None and parsed_days is not None and data['duration_days'] != parsed_days:
            raise serializers.ValidationError({'duration_days': 'Structured duration conflicts with the exact day text.'})
        return data


class DifferentialSerializer(StrictSerializer):
    condition_code = serializers.RegexField(r'^[A-Za-z][A-Za-z0-9_]{0,49}$')
    condition_label = TextField(max_length=200)
    confidence = ScoreField()


class PrimaryDiagnosisSerializer(DifferentialSerializer):
    severity_level = LowerChoiceField(choices=('mild', 'moderate', 'severe', 'unknown'))
    icd_10_code = TextField(max_length=30, required=False, allow_null=True)


class VitalsSerializer(StrictSerializer):
    temperature = TextField(max_length=100, required=False)
    blood_pressure = TextField(max_length=100, required=False)
    heart_rate = TextField(max_length=100, required=False)
    oxygen_saturation = TextField(max_length=100, required=False)
    respiratory_rate = TextField(max_length=100, required=False)


class ClinicalNotesSerializer(StrictSerializer):
    chief_complaint = TextField(max_length=2000)
    patient_reported_allergies = serializers.ListField(child=TextField(max_length=200), max_length=50)
    patient_current_medications = serializers.ListField(child=TextField(max_length=200), max_length=50)
    vital_signs_mentioned = VitalsSerializer()


class RedFlagSerializer(StrictSerializer):
    assessment_status = serializers.ChoiceField(choices=('assessed', 'not_assessed'))
    items = serializers.ListField(child=TextField(max_length=200), max_length=20)

    def validate(self, data):
        if data['assessment_status'] == 'not_assessed' and data['items']:
            raise serializers.ValidationError('Reported flags require assessed status.')
        return data


class Member1BodySerializer(StrictSerializer):
    audio_metadata = AudioSerializer()
    transcript_summary = TextField(max_length=5000)
    extracted_symptoms = ExtractedSymptomSerializer(many=True, min_length=1, max_length=50)
    primary_diagnosis = PrimaryDiagnosisSerializer()
    differential_diagnoses = DifferentialSerializer(many=True, max_length=10)
    extracted_clinical_notes = ClinicalNotesSerializer()
    suggested_treatment_categories = serializers.ListField(child=TextField(max_length=200), max_length=20)
    red_flags = RedFlagSerializer(required=False)

    def validate(self, data):
        diagnoses = [data['primary_diagnosis'], *data['differential_diagnoses']]
        codes = [item['condition_code'].casefold() for item in diagnoses]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError('Primary and differential condition codes must be unique.')
        mapped = []
        for item in data['extracted_symptoms']:
            code = symptom_code(item)
            if code:
                mapped.append(code)
        if len(mapped) != len(set(mapped)):
            raise serializers.ValidationError('Duplicate mapped symptoms need producer clarification.')
        return data


class Member1EnvelopeSerializer(StrictSerializer):
    schema_version = serializers.ChoiceField(choices=('2.0',))
    source = serializers.ChoiceField(choices=('component_1', 'component_1_sample'))
    is_demo = BooleanFlagField()
    model_version = TextField(max_length=100)
    review_status = serializers.ChoiceField(choices=('unconfirmed',))
    status = serializers.ChoiceField(choices=('success',))
    analysis_reference = serializers.RegexField(r'^[A-Za-z0-9][A-Za-z0-9_.:-]*$', max_length=150)
    consultation_id = serializers.UUIDField()
    patient_id = PositiveIdField()
    doctor_id = PositiveIdField()
    timestamp = TimestampField()
    payload = Member1BodySerializer()

    def validate(self, data):
        if data['consultation_id'].int == 0:
            raise serializers.ValidationError({'consultation_id': 'Use a registered consultation UUID.'})
        expected_source = 'component_1_sample' if data['is_demo'] else 'component_1'
        if data['source'] != expected_source:
            raise serializers.ValidationError({'source': 'Source must match the demo status.'})
        if not data['is_demo'] and data['model_version'].casefold().startswith(('synthetic', 'demo')):
            raise serializers.ValidationError({'model_version': 'Synthetic output cannot claim real model provenance.'})
        return data


def duration_days(text):
    match = re.fullmatch(r'(\d+)\s*(?:day|days|d)', text.strip(), re.IGNORECASE)
    if match and int(match[1]) <= 365:
        return int(match[1])
    return None


def symptom_code(item):
    code = item.get('code') or SYMPTOM_ALIASES.get(' '.join(item['symptom'].casefold().split()))
    return code if code in SYMPTOM_CODES else None


def adapt_member1_output(payload):
    contract = Member1EnvelopeSerializer(data=payload)
    contract.is_valid(raise_exception=True)
    data = contract.validated_data
    body = data['payload']
    symptoms, issues = [], []
    for index, item in enumerate(body['extracted_symptoms']):
        code = symptom_code(item)
        days = item.get('duration_days')
        if days is None:
            days = duration_days(item['duration'])
        if code is None:
            issues.append({'field': f'payload.extracted_symptoms.{index}.symptom',
                           'reason': 'Symptom identity is outside the supported mapping; clinician review required.'})
        else:
            symptoms.append({'code': code, 'present': item['present'], 'duration_days': days})
        if duration_days(item['duration']) is None:
            issues.append({'field': f'payload.extracted_symptoms.{index}.duration',
                           'reason': 'Duration text is not an exact number of days; verify onset and any structured duration.'})
    primary = body['primary_diagnosis']
    primary_code = primary['condition_code'].casefold()
    if primary_code not in PILOT_CONDITIONS:
        issues.append({'field': 'payload.primary_diagnosis.condition_code',
                       'reason': 'Primary condition is outside the influenza/chickenpox pilot; no pilot diagnosis is prefilled.'})
    flags = body.get('red_flags', {'assessment_status': 'not_assessed', 'items': []})
    return {
        'schema_version': '2.0', 'analysis_reference': data['analysis_reference'],
        'patient_id': data['patient_id'], 'doctor_id': data['doctor_id'],
        'consultation_id': str(data['consultation_id']),
        'source': data['source'], 'is_demo': data['is_demo'],
        'model_version': data['model_version'], 'review_status': 'unconfirmed',
        'symptoms': symptoms,
        # Never promote a differential to primary, even if its score is higher.
        'condition_candidates': [{'code': primary_code, 'confidence': primary['confidence']}] if primary_code in PILOT_CONDITIONS else [],
        'severity': {'level': primary['severity_level'], 'red_flags': flags['items']},
        'member1': {'adapter_version': 'member1-v2.0.0', 'raw_output': copy.deepcopy(payload),
                    'red_flag_assessment': flags['assessment_status'], 'mapping_issues': issues},
    }
