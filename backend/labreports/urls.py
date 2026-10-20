from django.urls import path
from .views import (
    create_lab_request,
    get_lab_requests,
    upload_lab_report,
    get_lab_reports,
    get_lab_report_detail,
    delete_lab_report,
    review_lab_report,
    get_disease_trends,
    get_disease_hotspots,
    seed_demo_surveillance,
    predict_lab_report_ai,
    predict_custom_lab_ai,
    get_model_evaluation_metrics,
    import_real_dataset_and_retrain,
)

urlpatterns = [
    # Lab Requisitions (FHIR ServiceRequest)
    path('lab-reports/requests/', get_lab_requests, name='get_lab_requests'),
    path('lab-reports/request/create/', create_lab_request, name='create_lab_request'),

    # Lab Reports & Extraction (FHIR DiagnosticReport)
    path('lab-reports/upload/', upload_lab_report, name='upload_lab_report'),
    path('lab-reports/', get_lab_reports, name='get_lab_reports'),
    path('lab-reports/<int:report_id>/', get_lab_report_detail, name='get_lab_report_detail'),
    path('lab-reports/<int:report_id>/delete/', delete_lab_report, name='delete_lab_report'),
    path('lab-reports/<int:report_id>/review/', review_lab_report, name='review_lab_report'),

    # AI Clinical Diagnostic Engine (IT-426 ML Module)
    path('lab-reports/<int:report_id>/ai-diagnosis/', predict_lab_report_ai, name='predict_lab_report_ai'),
    path('lab-reports/ai-diagnosis/predict/', predict_custom_lab_ai, name='predict_custom_lab_ai'),
    path('lab-reports/ai-diagnosis/metrics/', get_model_evaluation_metrics, name='get_model_evaluation_metrics'),
    path('lab-reports/ai-diagnosis/import-dataset/', import_real_dataset_and_retrain, name='import_real_dataset_and_retrain'),

    # Disease Intelligence & Outbreak Analytics (SO3, SO4)
    path('disease-intelligence/trends/', get_disease_trends, name='get_disease_trends'),
    path('disease-intelligence/hotspots/', get_disease_hotspots, name='get_disease_hotspots'),
    path('disease-intelligence/seed-demo/', seed_demo_surveillance, name='seed_demo_surveillance'),
]

