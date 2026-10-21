"""Explicitly authorized exposure deployment with encrypted backup and row checks.

Run from backend: python -m exposure.deploy_live backup|apply|secure
"""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from migration_backup_guard import (
    BACKUP_ROOT, TOOLS, dpapi, safe_tool, expected_connection,
    table_fingerprint, connection, transaction, MigrationExecutor, settings,
)
from django.core.management import call_command

TARGET = ('exposure', '0001_initial')
POINTER = BACKUP_ROOT / 'latest_exposure_deployment.json'


def migration_hash():
    return hashlib.sha256((settings.BASE_DIR / 'exposure/migrations/0001_initial.py').read_bytes()).hexdigest()


def assert_plan():
    executor = MigrationExecutor(connection)
    executor.loader.check_consistent_history(connection)
    plan = [(m.app_label, m.name, backwards) for m, backwards in executor.migration_plan([TARGET])]
    if plan != [('exposure', '0001_initial', False)]:
        raise RuntimeError('Expected exactly the single new exposure migration; stopping.')


def backup():
    cfg = expected_connection()
    if not BACKUP_ROOT.is_dir():
        raise RuntimeError('Existing private backup directory is required.')
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            assert_plan()
            call_command('check_exposure_schema')
            cursor.execute('SELECT pg_export_snapshot()')
            snapshot = cursor.fetchone()[0]
            cursor.execute("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename")
            tables = []
            for schema, name in cursor.fetchall():
                cursor.execute('SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position', [schema, name])
                table = {'schema': schema, 'name': name, 'columns': [r[0] for r in cursor.fetchall()]}
                if schema == 'public' and name in ('django_migrations', 'django_content_type', 'auth_permission'):
                    table['allow_metadata_additions'] = True
                    cursor.execute('SELECT COALESCE(max(id),0) FROM public.' + connection.ops.quote_name(name))
                    table['max_id'] = cursor.fetchone()[0]
                table.update(table_fingerprint(cursor, table))
                tables.append(table)
            env = os.environ.copy()
            env.update(PGHOST=str(cfg['HOST']), PGPORT=str(cfg['PORT']), PGDATABASE=str(cfg['NAME']),
                PGUSER=str(cfg['USER']), PGPASSWORD=cfg['PASSWORD'], PGSSLMODE='require',
                PGCONNECT_TIMEOUT='10', PGOPTIONS='-c default_transaction_read_only=on')
            archive = safe_tool([str(TOOLS / 'pg_dump.exe'), '--format=custom', '--snapshot=' + snapshot,
                                 '--lock-wait-timeout=10s'], env=env)
    if not archive.startswith(b'PGDMP'):
        raise RuntimeError('Invalid archive.')
    safe_tool([str(TOOLS / 'pg_restore.exe'), '--file=NUL'], input=archive)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%SZ')
    path = BACKUP_ROOT / f'supabase-before-exposure-0001-{stamp}.dump.dpapi'
    encrypted = dpapi(archive, True)
    path.write_bytes(encrypted)
    if dpapi(path.read_bytes(), False) != archive:
        raise RuntimeError('Backup encryption verification failed.')
    manifest = {'backup_file': str(path), 'archive_sha256': hashlib.sha256(archive).hexdigest(),
        'encrypted_sha256': hashlib.sha256(encrypted).hexdigest(), 'tables': tables,
        'migration_sha256': migration_hash(), 'created_at': stamp}
    manifest_path = path.with_suffix('.manifest.json')
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    POINTER.write_text(json.dumps({'manifest_file': str(manifest_path)}), encoding='utf-8')
    print(f'Encrypted backup verified; {len(tables)} source tables fingerprinted. Archive parsed completely.', flush=True)
    print('Backup:', path, flush=True)


def apply():
    expected_connection()
    manifest_path = Path(json.loads(POINTER.read_text())['manifest_file'])
    manifest = json.loads(manifest_path.read_text())
    protected = Path(manifest['backup_file']).read_bytes()
    assert hashlib.sha256(protected).hexdigest() == manifest['encrypted_sha256']
    archive = dpapi(protected, False)
    assert hashlib.sha256(archive).hexdigest() == manifest['archive_sha256']
    safe_tool([str(TOOLS / 'pg_restore.exe'), '--file=NUL'], input=archive)
    assert migration_hash() == manifest['migration_sha256']
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
            cursor.execute("SET LOCAL lock_timeout = '5s'")
            cursor.execute("SET LOCAL statement_timeout = '120s'")
            cursor.execute("SELECT pg_try_advisory_xact_lock(426, 1001)")
            if not cursor.fetchone()[0]:
                raise RuntimeError('Another exposure deployment is running.')
            assert_plan()
            for table in manifest['tables']:
                if table_fingerprint(cursor, table) != {k: table[k] for k in ('count', 'digest')}:
                    raise RuntimeError('Data changed since backup; take a fresh backup before deployment.')
            call_command('migrate', 'exposure', '0001', interactive=False)
            for table in manifest['tables']:
                if table_fingerprint(cursor, table, original_rows_only=True) != {k: table[k] for k in ('count', 'digest')}:
                    raise RuntimeError('Original data changed during migration; transaction will roll back.')
            from django.apps import apps
            actual = set(connection.introspection.table_names(cursor))
            required = {m._meta.db_table for m in apps.get_app_config('exposure').get_models()}
            assert len(required) == 7 and required <= actual
            for model in apps.get_app_config('exposure').get_models():
                columns = {c.name for c in connection.introspection.get_table_description(cursor, model._meta.db_table)}
                assert {f.column for f in model._meta.local_fields} <= columns
    # Confirm the committed state using a new transaction.
    connection.close()
    executor = MigrationExecutor(connection)
    assert executor.migration_plan([TARGET]) == []
    report = {'migration': '.'.join(TARGET), 'status': 'committed',
        'verified_at_utc': datetime.now(timezone.utc).isoformat(),
        'tables_created': sorted(required), 'original_tables_verified': len(manifest['tables']),
        'original_rows_preserved': True, 'encrypted_backup': Path(manifest['backup_file']).name,
        'cleanup_executed': False, 'scheduler_installed': False}
    (settings.BASE_DIR / 'exposure/deployment_result.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'COMMITTED: seven exposure tables created; all original rows/columns across {len(manifest["tables"])} tables preserved.', flush=True)
    print('No cleanup, scheduler installation, model scoring or mobile changes performed.', flush=True)


def secure():
    expected_connection()
    target = ('exposure', '0002_restrict_direct_access')
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute("SET LOCAL lock_timeout = '5s'")
            executor = MigrationExecutor(connection)
            plan = [(m.app_label, m.name, backwards) for m, backwards in executor.migration_plan([target])]
            if plan != [('exposure', '0002_restrict_direct_access', False)]:
                raise RuntimeError('Expected only the exposure access-control migration.')
            call_command('migrate', *target, interactive=False)
            from django.apps import apps
            cursor.execute("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
            roles = [r[0] for r in cursor.fetchall()]
            for model in apps.get_app_config('exposure').get_models():
                table = 'public.' + model._meta.db_table
                cursor.execute('SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass(%s)', [table])
                assert cursor.fetchone() == (True,)
                for role in roles:
                    cursor.execute('SELECT has_table_privilege(%s,%s,%s)',
                        [role, table, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'])
                    assert cursor.fetchone() == (False,)
                    cursor.execute('SELECT pg_get_serial_sequence(%s,%s)', [table, 'id'])
                    sequence = cursor.fetchone()[0]
                    if sequence:
                        cursor.execute('SELECT has_sequence_privilege(%s,%s,%s)', [role, sequence, 'USAGE,SELECT,UPDATE'])
                        assert cursor.fetchone() == (False,)
                model.objects.exists()  # Confirm Django's database role still has access.
    report_path = settings.BASE_DIR / 'exposure/deployment_result.json'
    report = json.loads(report_path.read_text())
    report.update(access_control_migration='.'.join(target), rls_enabled_on_all_new_tables=True,
        anonymous_and_client_grants_revoked=True, backend_orm_access_verified=True,
        verified_at_utc=datetime.now(timezone.utc).isoformat())
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print('COMMITTED: all seven tables use RLS; anon/authenticated table and sequence access denied; Django ORM access verified.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=['backup', 'apply', 'secure'])
    args = parser.parse_args()
    try:
        {'backup': backup, 'apply': apply, 'secure': secure}[args.stage]()
    finally:
        connection.close()
