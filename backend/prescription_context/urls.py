from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ConsultationViewSet,
    ConsultationAnalysisViewSet,
    PatientContextViewSet,
    ContextRevisionViewSet,
    DiagnosisConfirmationViewSet,
)

router = DefaultRouter()
router.register(r'consultations', ConsultationViewSet, basename='consultation')
router.register(r'analyses', ConsultationAnalysisViewSet, basename='consultationanalysis')
router.register(r'patient-contexts', PatientContextViewSet, basename='patientcontext')
router.register(r'revisions', ContextRevisionViewSet, basename='contextrevision')
router.register(r'diagnoses', DiagnosisConfirmationViewSet, basename='diagnosisconfirmation')

urlpatterns = [
    path('', include(router.urls)),
]
