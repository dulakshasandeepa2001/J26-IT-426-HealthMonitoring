from django.urls import path
from .views import ConsentView, LocationsView, AnalysisView, ZonesView, DiagnosisMetadataView

urlpatterns = [
    path('consent/', ConsentView.as_view()),
    path('locations/', LocationsView.as_view()),
    path('analyses/', AnalysisView.as_view()),
    path('zones/', ZonesView.as_view()),
    path('diagnoses/<int:diagnosis_id>/metadata/', DiagnosisMetadataView.as_view()),
]
