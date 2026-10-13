"""Shared storage path for bundled demo samples and authenticated C1 results."""

import json
from pathlib import Path
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from .analysis_contract import Component1PayloadSerializer
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
    filenames = {'influenza': 'influenza_demo.json', 'chickenpox': 'chickenpox_demo.json'}
    if scenario not in filenames:
        raise ValidationError({'scenario': 'Choose influenza or chickenpox.'})
    path = Path(__file__).resolve().parent / 'samples' / filenames[scenario]
    with path.open(encoding='utf-8') as sample:
        payload = json.load(sample)
    payload['patient_id'] = consultation.patient_id
    payload['consultation_id'] = str(consultation.pk)
    payload['analysis_reference'] += ':' + str(consultation.pk)
    return payload


def ingest_analysis(payload, actor, *, mode):
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
        if normalized['is_demo'] != consultation.is_demo:
            raise ValidationError({'is_demo': 'Demo results require a demo consultation; real results require a non-demo consultation.'})
        existing = Analysis.objects.filter(consultation=consultation).first()
        if existing:
            if existing.payload == normalized:
                return existing, False  # A producer retry is safe, including after confirmation.
            raise AnalysisConflict()
        if Diagnosis.objects.filter(consultation=consultation).exists():
            raise AnalysisConflict()
        analysis = Analysis.objects.create(
            consultation=consultation, imported_by=actor,
            analysis_reference=normalized['analysis_reference'], payload=normalized,
        )
        return analysis, True
