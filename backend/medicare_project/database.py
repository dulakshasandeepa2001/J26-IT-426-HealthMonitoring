"""Explicit database configuration and credential-free connection diagnostics."""

import re
from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def build_database_config(config, base_dir):
    backend = config('DATABASE_BACKEND', default='').strip().lower()
    if backend == 'sqlite':
        # Local data remains available only when deliberately selected.
        return {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': base_dir / 'db.sqlite3',
        }
    if backend != 'postgresql':
        raise ImproperlyConfigured(
            'Set DATABASE_BACKEND=postgresql in backend/.env for Supabase. '
            'SQLite is available only by explicitly setting DATABASE_BACKEND=sqlite.'
        )

    keys = (
        'SUPABASE_DB_HOST', 'SUPABASE_DB_PORT', 'SUPABASE_DB_NAME',
        'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD',
    )
    values = {key: config(key, default='') for key in keys}
    missing = [key for key, value in values.items() if not value.strip()]
    if missing:
        raise ImproperlyConfigured(
            'Supabase PostgreSQL configuration is incomplete. Set these values '
            'locally in backend/.env: ' + ', '.join(missing) + '. '
            'Copy host, port, database name, and username from your intended '
            'Supabase project\'s Connect > Session pooler dialog. '
            'No SQLite fallback will be used.'
        )

    host = values['SUPABASE_DB_HOST'].strip()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.-]*\.pooler\.supabase\.com', host):
        raise ImproperlyConfigured(
            'SUPABASE_DB_HOST must be the Session pooler hostname copied from '
            'Supabase Connect, without a URL scheme, port, or credentials.'
        )
    if values['SUPABASE_DB_PORT'].strip() != '5432':
        raise ImproperlyConfigured(
            'SUPABASE_DB_PORT must be 5432 for the Supabase Session pooler. '
            'Copy the Session pooler configuration, rather than Transaction pooler.'
        )

    user = values['SUPABASE_DB_USER'].strip()
    project_url = config('SUPABASE_URL', default='').strip()
    try:
        project_host = urlsplit(project_url).hostname or ''
    except ValueError:
        raise ImproperlyConfigured('SUPABASE_URL is not a valid project URL. Check it locally.') from None
    if project_host.endswith('.supabase.co'):
        project_ref = project_host.removesuffix('.supabase.co')
        if not user.endswith('.' + project_ref):
            raise ImproperlyConfigured(
                'SUPABASE_DB_USER does not match the intended project in SUPABASE_URL. '
                'Copy the full username from that project\'s Connect > Session pooler dialog.'
            )

    return {
        'ENGINE': 'django.db.backends.postgresql',
        'HOST': host,
        'PORT': values['SUPABASE_DB_PORT'].strip(),
        'NAME': values['SUPABASE_DB_NAME'].strip(),
        'USER': user,
        'PASSWORD': values['SUPABASE_DB_PASSWORD'],
        'OPTIONS': {'sslmode': 'require', 'connect_timeout': 10},
    }


def database_error_message(error):
    """Describe a failure without returning connection strings or raw exceptions."""
    cause = error.__cause__ or error
    code = getattr(cause, 'pgcode', None)
    detail = str(cause).lower()
    if code in {'28P01', '28000'} or 'password authentication failed' in detail:
        return 'Database authentication failed. Check the Session pooler username and database password locally.'
    if 'tenant or user not found' in detail:
        return 'The pooler could not identify the project or user. Check the Session pooler host and username locally.'
    if code == '3D000':
        return 'The configured PostgreSQL database does not exist. Check SUPABASE_DB_NAME locally.'
    if code in {'42P01', '42703'}:
        return 'The connection succeeded, but the existing database schema is missing a required table or column. No migrations were run.'
    if code == '42501' or 'permission denied' in detail:
        return 'The database user does not have permission to read the requested data.'
    if any(text in detail for text in ('could not translate host name', 'getaddrinfo', 'name or service not known')):
        return 'The database hostname could not be resolved. Check SUPABASE_DB_HOST and network DNS.'
    if any(text in detail for text in ('timeout', 'timed out')):
        return 'The database connection timed out. Check network access and the Session pooler host and port.'
    if 'connection refused' in detail:
        return 'The database refused the connection. Check that the Supabase project is available and the Session pooler port is correct.'
    if any(text in detail for text in ('ssl', 'certificate')):
        return 'The encrypted database connection failed. Check the Supabase SSL configuration.'
    return 'The configured database is unavailable. Check its configuration and network access locally; SQLite fallback is disabled.'
