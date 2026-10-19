"""No live database access: failures are injected before view authorization."""
from unittest.mock import patch

from django.conf import settings
from django.db import OperationalError
from django.test import SimpleTestCase
from django.test.client import RequestFactory

from .database_availability import DatabaseAvailabilityMiddleware


class DatabaseAvailabilityTests(SimpleTestCase):
    def test_only_database_failures_on_supported_application_paths_are_handled(self):
        middleware = DatabaseAvailabilityMiddleware(lambda request: None)
        for path in ('/session/', '/api/prescription/patients/'):
            request = RequestFactory().get(path)
            with self.assertLogs('medicare_project.database_availability', level='WARNING') as logs:
                response = middleware.process_exception(request, OperationalError('private database credentials'))
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response['Retry-After'], '3')
            self.assertEqual(response['Cache-Control'], 'no-store')
            self.assertNotIn('private', response.content.decode() + str(logs.output))
            self.assertIsNone(middleware.process_exception(request, ValueError('Programming error')))
        self.assertIsNone(middleware.process_exception(RequestFactory().get('/unrelated/'), OperationalError()))

    def test_session_database_failure_returns_503_before_screening_can_start(self):
        self.client.cookies[settings.SESSION_COOKIE_NAME] = 'unavailable-session-key'
        with patch('django.contrib.sessions.backends.db.SessionStore.load', side_effect=OperationalError('private connection details')):
            for path in ('/session/', '/api/prescription/patients/'):
                with self.subTest(path=path), self.assertLogs('medicare_project.database_availability', level='WARNING'):
                    response = self.client.get(path)
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()['code'], 'database_temporarily_unavailable')
                self.assertNotIn('private', response.content.decode())
                self.assertNotIn('user', response.json())
                self.assertNotIn('result', response.json())
