"""Check the configured database and existing admin accounts without writing data."""

from django.core.management.base import BaseCommand, CommandError
from django.db import DatabaseError, connection, transaction
from django.db.models import Q

from accounts.models import User
from medicare_project.database import database_error_message


class Command(BaseCommand):
    help = 'Read-only database connection and existing admin account verification.'
    requires_system_checks = []
    requires_migrations_checks = False

    def handle(self, *args, **options):
        self.stdout.write(f'Configured database backend: {connection.vendor}')
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    if connection.vendor == 'postgresql':
                        cursor.execute('SET TRANSACTION READ ONLY')
                    cursor.execute('SELECT 1')
                    if cursor.fetchone()[0] != 1:
                        raise CommandError('The database connection check returned an unexpected result.')
                    self.stdout.write('Database connection verified: SELECT 1 succeeded.')
                    if connection.vendor == 'postgresql':
                        cursor.execute("SELECT current_database(), current_setting('transaction_read_only')")
                        name, read_only = cursor.fetchone()
                        self.stdout.write(f'Connected database: {name}; transaction read-only: {read_only}.')

                admins = list(User.objects.filter(
                    Q(role__iexact='admin') | Q(is_superuser=True) | Q(is_staff=True)
                ).values('username', 'role', 'is_approved', 'is_active', 'is_staff', 'is_superuser'))
                if not admins:
                    self.stdout.write('No existing admin or staff account was found in the configured database.')
                for admin in admins:
                    self.stdout.write(
                        f"Admin account: {admin['username']}; role={admin['role']!r}; "
                        f"approved={admin['is_approved']}; active={admin['is_active']}; "
                        f"staff={admin['is_staff']}; superuser={admin['is_superuser']}."
                    )
                    portal = admin['role'] == 'admin' and admin['is_approved']
                    django_admin = admin['is_active'] and admin['is_staff']
                    self.stdout.write(
                        f'MediTrack admin role/approval requirements met: {portal}; '
                        f'Django admin active/staff requirements met: {django_admin}.'
                    )
                self.stdout.write('Passwords were not read or tested. No accounts, records, or migrations were changed.')
        except DatabaseError as error:
            raise CommandError(database_error_message(error)) from None
        finally:
            connection.close()
