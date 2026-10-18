from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .experimental_ml import ExperimentalMLView
from .views import (
    AdminAssignmentViewSet,
    PatientViewSet,
    ConsultationViewSet,
    ConsultationAnalysisViewSet,
    PatientContextViewSet,
    ContextRevisionViewSet,
    DiagnosisConfirmationViewSet,
    Component1ResultView,
)

router = DefaultRouter()
router.register(r'admin/assignments', AdminAssignmentViewSet, basename='admin-assignment')
router.register(r'patients', PatientViewSet, basename='prescription-patient')
router.register(r'consultations', ConsultationViewSet, basename='consultation')
router.register(r'analyses', ConsultationAnalysisViewSet, basename='consultationanalysis')
router.register(r'patient-contexts', PatientContextViewSet, basename='patientcontext')
router.register(r'revisions', ContextRevisionViewSet, basename='contextrevision')
router.register(r'diagnoses', DiagnosisConfirmationViewSet, basename='diagnosisconfirmation')

urlpatterns = [
    path('consultations/<uuid:consultation_id>/experimental-ml/', ExperimentalMLView.as_view(), name='experimental-ml'),
    path('component-1/results/', Component1ResultView.as_view(), name='component1-result'),
    path('', include(router.urls)),
]
