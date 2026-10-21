"""
URL configuration for medicare_project project.
"""
from django.contrib import admin
from django.urls import path, include
from accounts.views import (
    create_user, get_users, get_doctor, login_user, current_session, logout_user,
    get_pending_doctors, approve_doctor, reject_doctor,
    mobile_login, mobile_me, mobile_logout,
    check_doctor_availability, book_appointment, get_my_queue,
    set_doctor_availability, get_doctor_live_availability,
    get_doctor_queue, update_appointment_status, cancel_appointment,
    get_patient_appointments,
    medical_officer_login_api, medical_officer_dashboard_data, medical_officer_submit_notice
)
from taskcreate.views import create_task, health_check, get_tasks, delete_task
from model.api_views import analyze_voice_consultation_api

urlpatterns = [
    path('admin/', admin.site.urls),
    path("create-user/", create_user),
    path("get-users/", get_users),
    path("login/", login_user),
    path("session/", current_session),
    path("logout/", logout_user),
    path("get-doctor/", get_doctor),
    path("create-task/", create_task),
    path("health-check/", health_check),
    path("get-tasks/", get_tasks),
    path("delete-task/<int:task_id>/", delete_task),
    path("pending-doctors/", get_pending_doctors),
    path("approve-doctor/<int:pk>/", approve_doctor),
    path("reject-doctor/<int:pk>/", reject_doctor),
    
    # Mobile Auth Endpoints
    path("mobile/auth/login/", mobile_login),
    path("mobile/auth/me/", mobile_me),
    path("mobile/auth/logout/", mobile_logout),

    # Appointment Queue System Endpoints
    path("api/appointments/availability/", check_doctor_availability),
    path("api/appointments/book/", book_appointment),
    path("api/appointments/my-queue/", get_my_queue),
    path("api/appointments/update-status/", update_appointment_status),
    path("api/appointments/cancel/", cancel_appointment),
    path("api/patient/my-appointments/", get_patient_appointments),

    # Doctor Live Availability & Queue Management
    path("api/doctor/set-availability/", set_doctor_availability),
    path("api/doctor/get-availability/", get_doctor_live_availability),
    path("api/doctor/queue/", get_doctor_queue),

    # AI Voice Analysis Endpoint
    path('api/consultation/analyze-voice/', analyze_voice_consultation_api, name='analyze_voice_consultation'),

    # Medical Officer / Public Health Inspector (PHI) Endpoints
    path("api/medical-officer/login/", medical_officer_login_api),
    path("api/medical-officer/dashboard-data/", medical_officer_dashboard_data),
    path("api/medical-officer/submit-notice/", medical_officer_submit_notice),

    # Ransara's Prescription Intelligence Endpoints
    path("api/prescription/", include("prescription_context.urls")),
    path("api/prescription/", include("medicine_knowledge.urls")),
    path("api/prescription/", include("prescription_review.urls")),
    path("api/prescription/", include("prescription_drafts.urls")),
]

