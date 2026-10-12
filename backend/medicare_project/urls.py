"""
URL configuration for medicare_project project.
"""
from django.contrib import admin
from django.urls import path
from accounts.views import (
    create_user, get_users, get_doctor, login_user,
    get_pending_doctors, approve_doctor, reject_doctor,
    mobile_login, mobile_me, mobile_logout,
    check_doctor_availability, book_appointment, get_my_queue,
    set_doctor_availability, get_doctor_live_availability
)
from taskcreate.views import create_task, health_check, get_tasks, delete_task

urlpatterns = [
    path('admin/', admin.site.urls),
    path("create-user/", create_user),
    path("get-users/", get_users),
    path("login/", login_user),
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

    # Doctor Live Availability Management (Independent of tasks/schedules)
    path("api/doctor/set-availability/", set_doctor_availability),
    path("api/doctor/get-availability/", get_doctor_live_availability),
]
