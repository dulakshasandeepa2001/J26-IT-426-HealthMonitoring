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
router.register(r'consultations', ConsultationViewSet)
router.register(r'analyses', ConsultationAnalysisViewSet)
router.register(r'patient-contexts', PatientContextViewSet)
router.register(r'revisions', ContextRevisionViewSet)
router.register(r'diagnoses', DiagnosisConfirmationViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
