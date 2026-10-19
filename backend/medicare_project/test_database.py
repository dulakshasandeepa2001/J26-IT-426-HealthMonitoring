"""Run with unittest; all database access is mocked and no migrations are run."""

from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import unittest
from unittest.mock import patch

from decouple import Config, RepositoryEnv
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.management.base import CommandError
from django.db import OperationalError

from medicare_project.database import build_database_config, database_error_message

# A dummy backend makes any accidental database access fail rather than touch data.
if not settings.configured:
    settings.configure(
        SECRET_KEY='unit-test-only',
        INSTALLED_APPS=['django.contrib.auth', 'django.contrib.contenttypes', 'accounts', 'taskcreate'],
        DATABASES={'default': {'ENGINE': 'django.db.backends.dummy'}},
        REST_FRAMEWORK={'DEFAULT_AUTHENTICATION_CLASSES': [], 'UNAUTHENTICATED_USER': None},
    )
    import django
    django.setup()

from accounts.management.commands.check_database import Command
from rest_framework.test import APIRequestFactory
from taskcreate.views import health_check


class DatabaseConfigurationTests(unittest.TestCase):
    def config(self, **overrides):
        values = {
            'DATABASE_BACKEND': 'postgresql',
            'SUPABASE_DB_HOST': 'unit-test.pooler.supabase.com',
            'SUPABASE_DB_PORT': '5432',
            'SUPABASE_DB_NAME': 'unit_test_database',
            'SUPABASE_DB_USER': 'postgres.unit-test-project',
            'SUPABASE_DB_PASSWORD': 'unit-test-password',
            'SUPABASE_URL': 'https://unit-test-project.supabase.co',
        }
        values.update(overrides)
        return lambda key, default='': values.get(key, default)

    def test_postgresql_is_selected_without_dns_probe(self):
        with patch('socket.gethostbyname', side_effect=AssertionError('DNS selection is forbidden')):
            database = build_database_config(self.config(), Path('/unit-test'))
        self.assertEqual(database['ENGINE'], 'django.db.backends.postgresql')
        self.assertEqual(database['OPTIONS'], {'sslmode': 'require', 'connect_timeout': 10})
        self.assertEqual(database['CONN_MAX_AGE'], 60)
        self.assertIs(database['CONN_HEALTH_CHECKS'], True)

    def test_missing_pooler_details_fail_instead_of_selecting_sqlite(self):
        with self.assertRaises(ImproperlyConfigured) as error:
            build_database_config(self.config(SUPABASE_DB_HOST='', SUPABASE_DB_USER=''), Path('/unit-test'))
        self.assertIn('SUPABASE_DB_HOST', str(error.exception))
        self.assertIn('SUPABASE_DB_USER', str(error.exception))
        self.assertNotIn('unit-test-password', str(error.exception))

    def test_database_selection_is_required(self):
        for backend in ('', 'unknown'):
            with self.subTest(backend=backend), self.assertRaises(ImproperlyConfigured):
                build_database_config(self.config(DATABASE_BACKEND=backend), Path('/unit-test'))

    def test_sqlite_requires_explicit_selection(self):
        database = build_database_config(self.config(DATABASE_BACKEND='sqlite'), Path('/unit-test'))
        self.assertEqual(database['ENGINE'], 'django.db.backends.sqlite3')

    def test_wrong_project_user_is_rejected(self):
        with self.assertRaisesRegex(ImproperlyConfigured, 'intended project'):
            build_database_config(self.config(SUPABASE_DB_USER='postgres.another-project'), Path('/unit-test'))

    def test_transaction_pooler_port_is_rejected(self):
        with self.assertRaisesRegex(ImproperlyConfigured, 'Session pooler'):
            build_database_config(self.config(SUPABASE_DB_PORT='6543'), Path('/unit-test'))

    def test_connection_url_is_not_accepted_as_hostname(self):
        with self.assertRaises(ImproperlyConfigured) as error:
            build_database_config(self.config(SUPABASE_DB_HOST='postgresql://unit-test-password@unit-test.pooler.supabase.com'), Path('/unit-test'))
        self.assertNotIn('unit-test-password', str(error.exception))

    def test_process_environment_overrides_explicit_local_env(self):
        with TemporaryDirectory() as folder:
            env_file = Path(folder) / '.env'
            env_file.write_text('DATABASE_BACKEND=postgresql\nSUPABASE_DB_PASSWORD=unit-test-password\n', encoding='utf-8')
            with patch.dict(os.environ, {'DATABASE_BACKEND': 'sqlite'}, clear=True):
                config = Config(RepositoryEnv(str(env_file)))
                self.assertEqual(config('DATABASE_BACKEND'), 'sqlite')
                self.assertEqual(config('SUPABASE_DB_PASSWORD'), 'unit-test-password')


class DatabaseDiagnosticsTests(unittest.TestCase):
    def test_error_messages_never_include_raw_credentials(self):
        for detail in (
            'password authentication failed for unit-test-password',
            'could not translate host name unit-test-password',
            'timeout involving unit-test-password',
            'arbitrary failure postgresql://user:unit-test-password@host/database',
        ):
            with self.subTest(detail=detail):
                self.assertNotIn('unit-test-password', database_error_message(OperationalError(detail)))

    def test_health_reports_real_database_backend_on_success(self):
        with patch('taskcreate.views.connection') as connection:
            connection.vendor = 'postgresql'
            cursor = connection.cursor.return_value.__enter__.return_value
            cursor.fetchone.return_value = (1,)
            response = health_check(APIRequestFactory().get('/health-check/'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['database'], {'backend': 'postgresql', 'status': 'connected'})
        cursor.execute.assert_called_once_with('SELECT 1')

    def test_health_reports_failure_and_redacts_exception(self):
        with patch('taskcreate.views.connection') as connection, self.assertLogs('taskcreate.views', level='ERROR') as logs:
            connection.vendor = 'postgresql'
            connection.cursor.side_effect = OperationalError('password authentication failed: unit-test-password')
            response = health_check(APIRequestFactory().get('/health-check/'))
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['database']['status'], 'unavailable')
        self.assertNotIn('unit-test-password', str(response.data) + str(logs.output))

    def test_explicit_sqlite_health_does_not_claim_supabase(self):
        with patch('taskcreate.views.connection') as connection:
            connection.vendor = 'sqlite'
            response = health_check(APIRequestFactory().get('/health-check/'))
        self.assertEqual(response.data['database']['backend'], 'sqlite')

    def test_admin_verification_uses_read_only_transaction_and_no_password_field(self):
        output = StringIO()
        with patch('accounts.management.commands.check_database.connection') as connection, patch('accounts.management.commands.check_database.transaction.atomic') as atomic, patch('accounts.management.commands.check_database.User.objects.filter') as users:
            connection.vendor = 'postgresql'
            cursor = connection.cursor.return_value.__enter__.return_value
            cursor.fetchone.side_effect = [(1,), ('unit_test_database', 'on')]
            users.return_value.values.return_value = [{
                'username': 'unit-test-admin', 'role': 'admin', 'is_approved': True,
                'is_active': True, 'is_staff': True, 'is_superuser': True,
            }]
            Command(stdout=output).handle()
        self.assertEqual(cursor.execute.call_args_list[0].args, ('SET TRANSACTION READ ONLY',))
        self.assertEqual(cursor.execute.call_args_list[1].args, ('SELECT 1',))
        self.assertNotIn('password', users.return_value.values.call_args.args)
        self.assertIn('role=\'admin\'; approved=True', output.getvalue())
        self.assertIn('MediTrack admin role/approval requirements met: True', output.getvalue())
        connection.close.assert_called_once()
        atomic.assert_called_once()

    def test_connection_failure_is_clear_and_does_not_query_admins(self):
        output = StringIO()
        with patch('accounts.management.commands.check_database.connection') as connection, patch('accounts.management.commands.check_database.transaction.atomic'), patch('accounts.management.commands.check_database.User.objects.filter') as users:
            connection.vendor = 'postgresql'
            connection.cursor.side_effect = OperationalError('password authentication failed: unit-test-password')
            with self.assertRaises(CommandError) as error:
                Command(stdout=output).handle()
        self.assertNotIn('unit-test-password', str(error.exception))
        users.assert_not_called()
        connection.close.assert_called_once()


if __name__ == '__main__':
    unittest.main()
