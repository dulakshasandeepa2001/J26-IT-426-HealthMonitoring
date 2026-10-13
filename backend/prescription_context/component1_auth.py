"""Server-to-server authentication, disabled until credentials are configured."""

from django.conf import settings
from django.utils.crypto import constant_time_compare
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from accounts.models import User


class Component1Authentication(BaseAuthentication):
    def authenticate(self, request):
        provided = request.headers.get('X-Component1-Key', '')
        if not provided:
            return None
        expected = settings.COMPONENT1_API_KEY
        if len(expected) < 32 or not constant_time_compare(provided, expected):
            raise AuthenticationFailed('Invalid Component 1 credentials.')
        user = User.objects.filter(
            pk=settings.COMPONENT1_SERVICE_USER_ID, role='admin',
            is_active=True, is_approved=True,
        ).first()
        if user is None:
            raise AuthenticationFailed('Component 1 service identity is not configured.')
        return user, 'component_1'

    def authenticate_header(self, request):
        return 'Component1'
