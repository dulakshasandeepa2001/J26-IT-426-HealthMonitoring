from rest_framework import viewsets
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
    queryset = PrescriptionContextConsultation.objects.all()
    serializer_class = ConsultationSerializer

class ConsultationAnalysisViewSet(viewsets.ModelViewSet):
    queryset = PrescriptionContextConsultationanalysis.objects.all()
    serializer_class = ConsultationAnalysisSerializer

class PatientContextViewSet(viewsets.ModelViewSet):
    queryset = PrescriptionContextPatientcontext.objects.all()
    serializer_class = PatientContextSerializer

class ContextRevisionViewSet(viewsets.ModelViewSet):
    queryset = PrescriptionContextContextrevision.objects.all()
    serializer_class = ContextRevisionSerializer

class DiagnosisConfirmationViewSet(viewsets.ModelViewSet):
    queryset = PrescriptionContextDiagnosisconfirmation.objects.all()
    serializer_class = DiagnosisConfirmationSerializer
