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
    get_disease_provinces,
    get_disease_intelligence_overview,
    seed_demo_surveillance,
    predict_lab_report_ai,
    predict_custom_lab_ai,
    get_model_evaluation_metrics,
    import_real_dataset_and_retrain,
    get_lab_portal_dashboard,
    create_lab_test_record,
    update_lab_test_status,
    upload_test_report_file,
    save_lab_test_results,
    get_lab_patients_and_doctors,
    delete_lab_test_record,
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
    path('disease-intelligence/overview/', get_disease_intelligence_overview, name='get_disease_intelligence_overview'),
    path('disease-intelligence/trends/', get_disease_trends, name='get_disease_trends'),
    path('disease-intelligence/hotspots/', get_disease_hotspots, name='get_disease_hotspots'),
    path('disease-intelligence/provinces/', get_disease_provinces, name='get_disease_provinces'),
    path('disease-intelligence/seed-demo/', seed_demo_surveillance, name='seed_demo_surveillance'),
    path('lab-reports/intelligence/', get_disease_intelligence_overview, name='lab_reports_intelligence_alias'),
    path('lab-reports/intelligence/seed/', seed_demo_surveillance, name='lab_reports_intelligence_seed_alias'),

    # Laboratory Portal Endpoints
    path('lab/dashboard/', get_lab_portal_dashboard, name='get_lab_portal_dashboard'),
    path('lab/tests/create/', create_lab_test_record, name='create_lab_test_record'),
    path('lab/tests/<int:test_id>/status/', update_lab_test_status, name='update_lab_test_status'),
    path('lab/tests/<int:test_id>/upload/', upload_test_report_file, name='upload_test_report_file'),
    path('lab/tests/<int:test_id>/results/', save_lab_test_results, name='save_lab_test_results'),
    path('lab/tests/<int:test_id>/delete/', delete_lab_test_record, name='delete_lab_test_record'),
    path('lab/patients-doctors/', get_lab_patients_and_doctors, name='get_lab_patients_and_doctors'),
]

