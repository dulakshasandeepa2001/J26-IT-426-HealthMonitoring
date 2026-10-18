from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import MedicineEntryViewSet
from .condition_views import ConditionKnowledgeViewSet
from .screening_views import ScreeningInputsView, ScreeningPreviewView, ScreeningSaveView, ScreeningDraftViewSet

router = DefaultRouter()
router.register('medicines', MedicineEntryViewSet, basename='medicine-knowledge')
router.register('condition-knowledge', ConditionKnowledgeViewSet, basename='condition-knowledge')
router.register('six-condition-drafts', ScreeningDraftViewSet, basename='six-condition-draft')
urlpatterns = [
    path('consultations/<uuid:consultation_id>/clinical-screening/inputs/', ScreeningInputsView.as_view()),
    path('consultations/<uuid:consultation_id>/clinical-screening/preview/', ScreeningPreviewView.as_view()),
    path('consultations/<uuid:consultation_id>/clinical-screening/drafts/', ScreeningSaveView.as_view()),
] + router.urls
