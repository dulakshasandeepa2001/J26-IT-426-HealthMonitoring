"""Six-condition Member 1 2.1 handoff. Source observations never grant clearance."""

import copy
from decimal import Decimal
import re

from rest_framework import serializers
from .analysis_contract import StrictSerializer
from .member1_adapter import (
    AudioSerializer, BooleanFlagField, ClinicalNotesSerializer, DifferentialSerializer,
    FiniteNumberField, IntegerDaysField, LowerChoiceField, Member1EnvelopeSerializer,
    PrimaryDiagnosisSerializer, RedFlagSerializer, ScoreField, TextField, TimestampField,
    SYMPTOM_ALIASES as LEGACY_ALIASES,
)

HANDOFF_CONDITIONS = ('influenza', 'chickenpox', 'measles', 'mumps', 'viral_conjunctivitis', 'viral_gastroenteritis')
# Handoff support is distinct from reviewed product coverage and ML support.
# The active screening service accepts all six canonical conditions.
PRESCRIPTION_CONDITIONS = HANDOFF_CONDITIONS
SYMPTOM_ALIASES = {
    **LEGACY_ALIASES,
    'jaw pain': 'jaw_pain',
    'ocular dryness': 'ocular_dryness', 'dry eyes': 'ocular_dryness',
    'ocular irritation': 'ocular_irritation', 'eye irritation': 'ocular_irritation',
    'diarrhoea': 'diarrhoea', 'diarrhea': 'diarrhoea',
    'vomiting': 'vomiting', 'recent fluid loss': 'recent_fluid_loss',
}
SYMPTOM_CODES = set(SYMPTOM_ALIASES.values())
BOOLEAN_OBSERVATIONS = (
    'respiratory_concern', 'neurological_concern', 'hydration_concern', 'intake_difficulty',
    'abdominal_pain', 'testicular_pain_or_swelling', 'eye_pain', 'photophobia', 'vision_change',
    'marked_or_worsening_redness', 'contact_lens_use', 'suspected_herpetic_eye_disease',
    'blood_in_stool', 'severe_abdominal_pain', 'fluid_restriction',
    'immunocompromised', 'pregnant_or_breastfeeding',
)
ASSESSMENT_CHOICES = {
    'dehydration_assessment': ('unknown', 'none', 'mild', 'moderate', 'severe'),
    'oral_fluid_tolerance': ('unknown', 'tolerated', 'not_tolerated'),
}
DEMO_FILENAMES = {f'member1_v21_{condition}': f'member1_v21/{condition}.json' for condition in HANDOFF_CONDITIONS}


def exact_duration_hours(text):
    if text is None:
        return None
    match = re.fullmatch(r'(\d+(?:\.\d+)?)\s*(hours?|h|days?|d)', text.strip(), re.IGNORECASE)
    if not match:
        return None
    hours = Decimal(match[1]) * (24 if match[2].casefold().startswith('d') else 1)
    return hours if hours <= 8760 else None


def symptom_code(item):
    code = item.get('code') or SYMPTOM_ALIASES.get(' '.join(item['symptom'].casefold().split()))
    return code if code in SYMPTOM_CODES else None


class SymptomV21Serializer(StrictSerializer):
    symptom = TextField(max_length=200)
    code = serializers.RegexField(r'^[a-z][a-z0-9_]{0,49}$', required=False)
    present = BooleanFlagField(required=False, default=None, allow_null=True)
    duration = TextField(max_length=100, required=False, default=None, allow_null=True)
    duration_hours = FiniteNumberField(min_value=0, max_value=8760, required=False, allow_null=True)
    duration_days = IntegerDaysField(required=False, allow_null=True)
    severity = LowerChoiceField(choices=('mild', 'moderate', 'severe', 'unknown'))
    confidence = ScoreField()

    def validate(self, data):
        inferred = SYMPTOM_ALIASES.get(' '.join(data['symptom'].casefold().split()))
        if inferred and data.get('code') and data['code'] != inferred:
            raise serializers.ValidationError({'code': 'Structured code conflicts with the supported symptom label.'})
        values = []
        for name, multiplier in (('duration_hours', 1), ('duration_days', 24)):
            if data.get(name) is not None:
                values.append(Decimal(str(data[name])) * multiplier)
        text_value = exact_duration_hours(data['duration'])
        if text_value is not None:
            values.append(text_value)
        if values and any(value != values[0] for value in values):
            raise serializers.ValidationError({'duration_hours': 'Structured hours/days conflict with each other or the exact duration text.'})
        if data['present'] is False and any(value > 0 for value in values):
            raise serializers.ValidationError({'duration': 'An explicitly absent symptom must not have a positive symptom duration.'})
        return data


class ReportedAssessmentsSerializer(StrictSerializer):
    # Dynamic declaration keeps the bounded vocabulary in one explicit tuple.
    def get_fields(self):
        fields = {name: BooleanFlagField(required=False, allow_null=True, default=None) for name in BOOLEAN_OBSERVATIONS}
        fields.update({name: serializers.ChoiceField(choices=choices, required=False, default='unknown')
                       for name, choices in ASSESSMENT_CHOICES.items()})
        fields.update({
            'reported_onset_hours': FiniteNumberField(min_value=0, max_value=8760, required=False, allow_null=True, default=None),
            'reported_weight_kg': FiniteNumberField(min_value=0.1, max_value=350, required=False, allow_null=True, default=None),
            'weight_recorded_at': TimestampField(required=False, allow_null=True, default=None),
            'ors_product_name': TextField(max_length=200, required=False, allow_null=True, default=None),
        })
        return fields

    def validate(self, data):
        if data['weight_recorded_at'] is not None and data['reported_weight_kg'] is None:
            raise serializers.ValidationError({'weight_recorded_at': 'A weight timestamp requires a reported kg value.'})
        return data


class BodyV21Serializer(StrictSerializer):
    audio_metadata = AudioSerializer()
    transcript_summary = TextField(max_length=5000)
    extracted_symptoms = SymptomV21Serializer(many=True, min_length=0, max_length=50)
    primary_diagnosis = PrimaryDiagnosisSerializer()
    differential_diagnoses = DifferentialSerializer(many=True, max_length=10)
    extracted_clinical_notes = ClinicalNotesSerializer()
    suggested_treatment_categories = serializers.ListField(child=TextField(max_length=200), max_length=20)
    red_flags = RedFlagSerializer(required=False)
    reported_assessments = ReportedAssessmentsSerializer(required=False)

    def validate(self, data):
        codes = [row['condition_code'].casefold() for row in (data['primary_diagnosis'], *data['differential_diagnoses'])]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError('Primary and differential condition codes must be unique.')
        seen = set()
        for item in data['extracted_symptoms']:
            # Include unmapped structured codes too: do not silently merge unknown identities.
            identity = item.get('code') or symptom_code(item) or ' '.join(item['symptom'].casefold().split())
            if identity in seen:
                raise serializers.ValidationError('Duplicate symptom identities require producer clarification.')
            seen.add(identity)
        return data


class Member1V21EnvelopeSerializer(Member1EnvelopeSerializer):
    schema_version = serializers.ChoiceField(choices=('2.1',))
    payload = BodyV21Serializer()


def normalize_symptom(item):
    value = item.get('duration_hours')
    if value is None and item.get('duration_days') is not None:
        value = item['duration_days'] * 24
    if value is None:
        value = exact_duration_hours(item['duration'])
    # A duration alone cannot turn unknown presence into a positive finding.
    hours = float(value) if value is not None and item['present'] is True else None
    days = int(hours / 24) if hours is not None and hours % 24 == 0 else None
    return {'code': symptom_code(item), 'present': item['present'], 'duration_days': days, 'duration_hours': hours}


def adapt_member1_v21(payload):
    contract = Member1V21EnvelopeSerializer(data=payload)
    contract.is_valid(raise_exception=True)
    data = contract.validated_data
    body = data['payload']
    symptoms, issues = [], []
    for index, item in enumerate(body['extracted_symptoms']):
        normalized = normalize_symptom(item)
        if normalized['code'] is None:
            issues.append({'field': f'payload.extracted_symptoms.{index}', 'reason': 'Symptom identity is unmapped; original source details are retained.'})
        else:
            symptoms.append(normalized)
        if item['present'] is None:
            issues.append({'field': f'payload.extracted_symptoms.{index}.present', 'reason': 'Symptom presence is unknown; it is not assumed present or absent.'})
        if item['duration'] is not None and exact_duration_hours(item['duration']) is None:
            issues.append({'field': f'payload.extracted_symptoms.{index}.duration', 'reason': 'Duration text is ambiguous or outside supported units; verify the retained source and any supplied structured duration.'})
    supplied = {row['code'] for row in symptoms}
    # Missing terms are explicit unknown facts, never inferred negative findings.
    symptoms.extend({'code': code, 'present': None, 'duration_days': None, 'duration_hours': None}
                    for code in sorted(SYMPTOM_CODES - supplied))
    assessments = body.get('reported_assessments')
    if assessments is None:
        missing = ReportedAssessmentsSerializer(data={})
        missing.is_valid(raise_exception=True)
        assessments = missing.validated_data
    assessments = dict(assessments)
    if assessments['weight_recorded_at'] is not None:
        assessments['weight_recorded_at'] = assessments['weight_recorded_at'].isoformat()
    flags = body.get('red_flags', {'assessment_status': 'not_assessed', 'items': []})
    flag_items = list(flags['items'])
    for name in ('respiratory_concern', 'neurological_concern', 'hydration_concern'):
        if assessments[name] is True:
            flag_items.append(f'Reported {name.replace("_", " ")} (unverified source)')
    primary = body['primary_diagnosis']
    code = primary['condition_code'].casefold()
    supported = code in HANDOFF_CONDITIONS
    if not supported:
        issues.append({'field': 'payload.primary_diagnosis.condition_code', 'reason': 'Primary condition is outside the six-condition handoff; no supported diagnosis is prefilled.'})
    return {
        'schema_version': '2.1', 'analysis_reference': data['analysis_reference'],
        'patient_id': data['patient_id'], 'doctor_id': data['doctor_id'], 'consultation_id': str(data['consultation_id']),
        'source': data['source'], 'is_demo': data['is_demo'], 'model_version': data['model_version'], 'review_status': 'unconfirmed',
        'symptoms': symptoms, 'condition_candidates': [{'code': code, 'confidence': primary['confidence']}] if supported else [],
        'severity': {'level': primary['severity_level'], 'red_flags': list(dict.fromkeys(flag_items))},
        'member1': {'adapter_version': 'member1-v2.1.0', 'raw_output': copy.deepcopy(payload),
                    'red_flag_assessment': flags['assessment_status'], 'mapping_issues': issues,
                    'reported_assessments': assessments, 'assessment_review_status': 'unverified'},
    }
