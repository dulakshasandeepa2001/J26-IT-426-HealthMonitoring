"""Read-only preflight for baselining the formerly unmigrated legacy app."""
from django.apps import apps
from django.core.management.base import BaseCommand, CommandError
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


class Command(BaseCommand):
    help = 'Read-only legacy schema and exposure migration-plan check. Prints no patient data.'

    def handle(self, *args, **options):
        problems = []
        with connection.cursor() as cursor:
            tables = set(connection.introspection.table_names(cursor))
            for model in apps.get_app_config('prescription_context').get_models():
                table = model._meta.db_table
                if table not in tables:
                    problems.append(f'{table}: table missing')
                    continue
                columns = {column.name: column for column in connection.introspection.get_table_description(cursor, table)}
                constraints = connection.introspection.get_constraints(cursor, table)
                for field in model._meta.local_fields:
                    column = columns.get(field.column)
                    if column is None:
                        problems.append(f'{table}.{field.column}: column missing')
                        continue
                    if not field.primary_key and column.null_ok != field.null:
                        problems.append(f'{table}.{field.column}: nullability mismatch')
                    if field.unique and not any((c.get('unique') or c.get('primary_key')) and c['columns'] == [field.column] for c in constraints.values()):
                        problems.append(f'{table}.{field.column}: unique/primary constraint missing')
                    if field.is_relation:
                        target = (field.related_model._meta.db_table, field.target_field.column)
                        if not any(c.get('foreign_key') == target and c['columns'] == [field.column] for c in constraints.values()):
                            problems.append(f'{table}.{field.column}: foreign key mismatch')
        if problems:
            raise CommandError('Legacy baseline check failed; do not fake migrations:\n' + '\n'.join(problems))
        executor = MigrationExecutor(connection)
        executor.loader.check_consistent_history(connection)
        for migration, backwards in executor.migration_plan([('exposure', '0001_initial')]):
            self.stdout.write(f'{migration.app_label}.{migration.name} backwards={backwards}')
        self.stdout.write('Basic structure matches. Review column types/defaults and SQL before --fake-initial; this command made no changes.')
