"""Run the read-only database check using Django's actual configuration."""

import os
import sys

from django.core.exceptions import ImproperlyConfigured
from django.core.management import execute_from_command_line


if __name__ == '__main__':
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medicare_project.settings')
    try:
        execute_from_command_line([sys.argv[0], 'check_database', *sys.argv[1:]])
    except ImproperlyConfigured as error:
        raise SystemExit(f'Database configuration error: {error}') from None
