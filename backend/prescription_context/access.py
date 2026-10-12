from accounts.models import User
from rest_framework.permissions import BasePermission


class IsApprovedDoctor(BasePermission):
    message = "An active, approved doctor account is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active
            and user.is_approved and user.role == "doctor"
        )


def assigned_patients(doctor):
    # The first consultation is assigned by staff until Component 1 is connected.
    return User.objects.filter(
        role="patient", is_active=True, is_approved=True,
        patient_consultations__doctor=doctor,
    ).distinct()
