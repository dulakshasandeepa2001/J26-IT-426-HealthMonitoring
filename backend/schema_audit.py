"""Read-only schema/migration audit; generates SQL for review without executing it."""

import json
import os
from io import StringIO
from pathlib import Path
from decouple import RepositoryEnv

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medicare_project.settings')

import django
django.setup()

from django.apps import apps
from django.conf import settings
from django.core.management import call_command
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from medicare_project.database import database_error_message


def main():
    if connection.vendor != 'postgresql':
        raise SystemExit('Expected PostgreSQL; refusing to inspect a different database.')
    cfg = settings.DATABASES['default']
    local = RepositoryEnv(str(settings.ENV_FILE)).data
    intended = {
        'ENGINE': 'django.db.backends.postgresql',
        'HOST': local.get('SUPABASE_DB_HOST'),
        'PORT': local.get('SUPABASE_DB_PORT'),
        'NAME': local.get('SUPABASE_DB_NAME'),
        'USER': local.get('SUPABASE_DB_USER'),
    }
    report = {'intended_configuration_matches': all(str(cfg.get(k)) == v for k, v in intended.items())}
    target = ('accounts', '0006_user_lab_address_user_lab_name_user_license_id')
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            cursor.execute("SELECT current_database(), current_schema(), current_setting('search_path'), current_setting('transaction_read_only')")
            name, schema, search_path, read_only = cursor.fetchone()
            report['connection'] = {'backend': connection.vendor, 'database': name, 'schema': schema, 'search_path': search_path, 'transaction_read_only': read_only}
            cursor.execute("SELECT app, name, applied FROM django_migrations ORDER BY app, name")
            report['migration_records'] = [{'app': row[0], 'name': row[1], 'applied': row[2].isoformat()} for row in cursor.fetchall()]
            executor = MigrationExecutor(connection)
            executor.loader.check_consistent_history(connection)
            report['migration_history_consistent'] = True
            report['dependencies'] = []
            for key in executor.loader.graph.forwards_plan(target):
                migration = executor.loader.disk_migrations[key]
                report['dependencies'].append({'app': key[0], 'name': key[1], 'applied': key in executor.loader.applied_migrations, 'operations': [operation.describe() for operation in migration.operations]})
            plan = executor.migration_plan([target])
            report['pending_plan'] = [{'app': migration.app_label, 'name': migration.name, 'backwards': backwards} for migration, backwards in plan]
            report['models'] = []
            for model in apps.get_app_config('accounts').get_models(include_auto_created=True):
                table = model._meta.db_table
                cursor.execute('SELECT to_regclass(%s)::oid', [connection.ops.quote_name(table)])
                oid = cursor.fetchone()[0]
                info = {'model': model.__name__, 'table': table, 'exists': oid is not None, 'expected_columns': [], 'actual_columns': [], 'constraints': []}
                for field in model._meta.local_fields:
                    info['expected_columns'].append({'name': field.column, 'type': field.db_type(connection), 'nullable': field.null, 'unique': field.unique, 'primary_key': field.primary_key})
                if oid is not None:
                    cursor.execute("""
                        SELECT a.attname, format_type(a.atttypid, a.atttypmod),
                               NOT a.attnotnull, pg_get_expr(d.adbin, d.adrelid), a.attidentity
                        FROM pg_attribute a
                        LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
                        WHERE a.attrelid = %s AND a.attnum > 0 AND NOT a.attisdropped
                        ORDER BY a.attnum
                    """, [oid])
                    info['actual_columns'] = [{'name': row[0], 'type': row[1], 'nullable': row[2], 'default': '<redacted>' if row[0] == 'password' and row[3] is not None else row[3], 'identity': row[4]} for row in cursor.fetchall()]
                    cursor.execute('SELECT conname, contype, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = %s ORDER BY conname', [oid])
                    info['constraints'] = [{'name': row[0], 'kind': row[1], 'definition': row[2]} for row in cursor.fetchall()]
                    cursor.execute('SELECT indexname, indexdef FROM pg_indexes WHERE tablename = %s AND schemaname = current_schema() ORDER BY indexname', [table])
                    info['indexes'] = [{'name': row[0], 'definition': row[1]} for row in cursor.fetchall()]
                    cursor.execute('SELECT count(*) FROM ' + connection.ops.quote_name(table))
                    info['row_count'] = cursor.fetchone()[0]
                expected = {column['name']: column for column in info['expected_columns']}
                actual = {column['name']: column for column in info['actual_columns']}
                info['missing_columns'] = sorted(expected.keys() - actual.keys())
                info['extra_columns'] = sorted(actual.keys() - expected.keys())
                info['column_differences'] = []
                for column in expected.keys() & actual.keys():
                    normalized_type = actual[column]['type'].replace('character varying', 'varchar')
                    for attribute in ('type', 'nullable'):
                        found = normalized_type if attribute == 'type' else actual[column][attribute]
                        if expected[column][attribute] != found:
                            info['column_differences'].append({'column': column, 'attribute': attribute, 'expected': expected[column][attribute], 'actual': found})
                report['models'].append(info)
            cursor.execute("SELECT username, role, is_staff, is_superuser, is_approved, is_active FROM accounts_user WHERE role = 'admin' OR is_staff OR is_superuser ORDER BY username")
            report['admins'] = [dict(zip(('username', 'role', 'is_staff', 'is_superuser', 'is_approved', 'is_active'), row)) for row in cursor.fetchall()]
            latest_user = executor.loader.project_state([target]).apps.get_model('accounts', 'User')
            latest = {field.column: (field.db_type(connection), field.null, field.unique, field.primary_key) for field in latest_user._meta.local_fields}
            current_user = apps.get_model('accounts', 'User')
            current = {field.column: (field.db_type(connection), field.null, field.unique, field.primary_key) for field in current_user._meta.local_fields}
            report['current_user_matches_latest_migration_fields'] = current == latest
            report['admin_role_in_model_choices'] = 'admin' in dict(current_user._meta.get_field('role').choices)
            sql = {}
            for migration, backwards in plan:
                if backwards:
                    raise RuntimeError('Refusing a backwards migration plan.')
                output = StringIO()
                call_command('sqlmigrate', migration.app_label, migration.name, stdout=output, no_color=True)
                sql[migration.name] = output.getvalue()
            report['generated_sql'] = sql
    connection.close()
    output_dir = Path(__file__).resolve().parent / 'schema_audit'
    output_dir.mkdir(exist_ok=True)
    (output_dir / 'audit.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    for name, sql in report['generated_sql'].items():
        (output_dir / (name + '.sql')).write_text('-- REVIEW ONLY: this generated SQL was NOT executed.\n' + sql, encoding='utf-8')
    print(json.dumps({key: value for key, value in report.items() if key not in {'models', 'generated_sql'}}, indent=2))
    for model in report['models']:
        print(json.dumps({key: value for key, value in model.items() if key not in {'constraints', 'indexes'}}, indent=2))
    print('Generated migration SQL for review only:', ', '.join(report['generated_sql']))
    print('Audit evidence written to backend/schema_audit; no database changes were made.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        connection.close()
        raise SystemExit('Read-only schema audit failed (' + type(error).__name__ + '): ' + database_error_message(error)) from None
