"""Safe responses when the database fails before screening reaches its view."""
import logging

from django.db import OperationalError
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class DatabaseAvailabilityMiddleware(MiddlewareMixin):
    def process_exception(self, request, exception):
        if not isinstance(exception, OperationalError):
            return None
        if request.path not in ('/session/', '/login/', '/logout/') and not request.path.startswith('/api/prescription/'):
            return None
        # Authentication/session loading may fail before the view's transaction
        # handler. Do not return cached authorization or any partial result.
        logger.warning('Database unavailable during an authenticated application request.')
        response = JsonResponse({
            'detail': 'The database connection is temporarily unavailable. Your entered details are retained. Try again shortly.',
            'code': 'database_temporarily_unavailable',
        }, status=503)
        response['Retry-After'] = '3'
        response['Cache-Control'] = 'no-store'
        return response
