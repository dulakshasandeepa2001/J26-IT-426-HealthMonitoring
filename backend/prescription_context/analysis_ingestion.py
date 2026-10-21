"""Shared storage path for bundled demo samples and authenticated C1 results."""

import json
from pathlib import Path
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from .analysis_contract import Component1PayloadSerializer
from .member1_adapter import adapt_member1_output
from .member1_v21 import adapt_member1_v21, DEMO_FILENAMES
from .models import (
    PrescriptionContextConsultation as Consultation,
    PrescriptionContextConsultationanalysis as Analysis,
    PrescriptionContextDiagnosisconfirmation as Diagnosis,
)


class AnalysisConflict(APIException):
    status_code = 409
    default_detail = 'An analysis or confirmed diagnosis is already saved for this visit. Start a new consultation for another analysis.'


def demo_payload(consultation, scenario):
    # Fixed choices only: a caller cannot provide a filesystem path.
    filenames = {'influenza': 'influenza_demo.json', 'chickenpox': 'chickenpox_demo.json',
                 'member1_influenza': 'member1_influenza_demo.json', **DEMO_FILENAMES}
    if scenario not in filenames:
        raise ValidationError({'scenario': 'Choose one of the supported bundled scenarios.'})
    path = Path(__file__).resolve().parent / 'samples' / filenames[scenario]
    with path.open(encoding='utf-8') as sample:
        payload = json.load(sample)
    payload['patient_id'] = consultation.patient_id
    payload['consultation_id'] = str(consultation.pk)
    payload['analysis_reference'] += ':' + str(consultation.pk)
    if scenario == 'member1_influenza':
        # Provenance is explicit; a pasted unversioned example never becomes real output.
        payload.update(schema_version='2.0', source='component_1_sample', is_demo=True,
                       model_version='synthetic-demo-member1-v1', review_status='unconfirmed',
                       doctor_id=consultation.doctor_id)
    elif scenario in DEMO_FILENAMES:
        payload['doctor_id'] = consultation.doctor_id
    return payload


def ingest_analysis(payload, actor, *, mode):
    if isinstance(payload, dict) and payload.get('schema_version') == '2.1':
        normalized = adapt_member1_v21(payload)
    elif isinstance(payload, dict) and payload.get('schema_version') == '2.0':
        normalized = adapt_member1_output(payload)
    else:
        contract = Component1PayloadSerializer(data=payload)
        contract.is_valid(raise_exception=True)
        normalized = contract.validated_data
    with transaction.atomic():
        consultation = get_object_or_404(
            Consultation.objects.select_for_update().select_related('patient', 'doctor'),
            pk=normalized['consultation_id'],
        )
        if mode == 'demo':
            if not (actor.is_active and actor.is_approved and actor.role == 'doctor' and consultation.doctor_id == actor.pk):
                raise PermissionDenied('Only the assigned doctor may load a demo result.')
            if not normalized['is_demo']:
                raise ValidationError({'is_demo': 'The doctor demo endpoint accepts demo results only.'})
        elif mode == 'component_1':
            if not (actor.pk == settings.COMPONENT1_SERVICE_USER_ID and actor.is_active and actor.is_approved and actor.role == 'admin'):
                raise PermissionDenied('An authorized Component 1 service identity is required.')
        else:
            raise PermissionDenied('Unknown analysis ingestion mode.')
        patient, doctor = consultation.patient, consultation.doctor
        if not (patient.role == 'patient' and patient.is_active and patient.is_approved and doctor.role == 'doctor' and doctor.is_active and doctor.is_approved):
            raise ValidationError({'consultation_id': 'This visit must link an active approved patient and doctor.'})
        if normalized['patient_id'] != consultation.patient_id:
            raise ValidationError({'patient_id': 'Patient ID does not match the consultation.'})
        if normalized.get('doctor_id', consultation.doctor_id) != consultation.doctor_id:
            raise ValidationError({'doctor_id': 'Doctor ID does not match the consultation.'})
        if normalized['is_demo'] != consultation.is_demo:
            raise ValidationError({'is_demo': 'Demo results require a demo consultation; real results require a non-demo consultation.'})
        existing = Analysis.objects.filter(consultation=consultation).first()
        if existing:
            comparable = existing.payload
            # Older v2.1 imports retained an obsolete two-condition warning.
            # Preserve the immutable stored analysis, but accept an otherwise
            # identical producer retry after removing only that exact warning.
            if (payload.get('schema_version') == '2.1' and 'member1' in comparable):
                from copy import deepcopy
                comparable = deepcopy(comparable)
                issues = comparable['member1'].get('mapping_issues', [])
                obsolete = {'field': 'payload.primary_diagnosis.condition_code', 'reason': 'Analysis handoff is supported; medicine rules and the trained prescription model for this condition are not enabled.'}
                comparable['member1']['mapping_issues'] = [issue for issue in issues if issue != obsolete]
            if comparable == normalized:
                return existing, False  # A producer retry is safe, including after confirmation.
            raise AnalysisConflict()
        if Diagnosis.objects.filter(consultation=consultation).exists():
            raise AnalysisConflict()
        analysis = Analysis.objects.create(
            consultation=consultation, imported_by=actor,
            analysis_reference=normalized['analysis_reference'], payload=normalized,
        )
        return analysis, True
