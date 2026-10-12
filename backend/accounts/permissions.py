from rest_framework.permissions import BasePermission


class IsApprovedAdmin(BasePermission):
    message = "An active, approved admin account is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active
            and user.is_approved and user.role == 'admin'
        )
