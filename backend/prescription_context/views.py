from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import (
    PrescriptionContextConsultation,
    PrescriptionContextConsultationanalysis,
    PrescriptionContextPatientcontext,
    PrescriptionContextContextrevision,
    PrescriptionContextDiagnosisconfirmation,
)
from .serializers import (
    ConsultationSerializer,
    ConsultationAnalysisSerializer,
    PatientContextSerializer,
    ContextRevisionSerializer,
    DiagnosisConfirmationSerializer,
)


class ConsultationViewSet(viewsets.ModelViewSet):
    serializer_class = ConsultationSerializer

    def get_queryset(self):
        qs = PrescriptionContextConsultation.objects.all().order_by("-started_at")
        doctor = self.request.query_params.get("doctor")
        patient = self.request.query_params.get("patient")
        if doctor:
            qs = qs.filter(doctor_id=doctor)
        if patient:
            qs = qs.filter(patient_id=patient)
        return qs


class ConsultationAnalysisViewSet(viewsets.ModelViewSet):
    serializer_class = ConsultationAnalysisSerializer

    def get_queryset(self):
        qs = PrescriptionContextConsultationanalysis.objects.all().order_by("-imported_at")
        consultation = self.request.query_params.get("consultation")
        if consultation:
            qs = qs.filter(consultation_id=consultation)
        return qs


class PatientContextViewSet(viewsets.ModelViewSet):
    serializer_class = PatientContextSerializer

    def get_queryset(self):
        qs = PrescriptionContextPatientcontext.objects.all()
        patient = self.request.query_params.get("patient")
        if patient:
            qs = qs.filter(patient_id=patient)
        return qs


class ContextRevisionViewSet(viewsets.ModelViewSet):
    serializer_class = ContextRevisionSerializer

    def get_queryset(self):
        qs = PrescriptionContextContextrevision.objects.all().order_by("-recorded_at")
        consultation = self.request.query_params.get("consultation")
        if consultation:
            qs = qs.filter(consultation_id=consultation)
        return qs


class DiagnosisConfirmationViewSet(viewsets.ModelViewSet):
    serializer_class = DiagnosisConfirmationSerializer

    def get_queryset(self):
        qs = PrescriptionContextDiagnosisconfirmation.objects.all().order_by("-confirmed_at")
        consultation = self.request.query_params.get("consultation")
        if consultation:
            qs = qs.filter(consultation_id=consultation)
        return qs
