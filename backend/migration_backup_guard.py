"""Private Windows backup and read-only data-preservation checks for the reviewed repair."""

import argparse
import ctypes
from ctypes import wintypes
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
from zoneinfo import ZoneInfo

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'medicare_project.settings')
import django
django.setup()

from decouple import RepositoryEnv
from django.conf import settings
from django.db import connection, transaction
from django.db.migrations.executor import MigrationExecutor
from medicare_project.database import database_error_message

REVIEWED = (
    '0003_laborator_alter_user_role',
    '0004_rename_lab_email_laborator_email',
    '0005_laborator_role_alter_laborator_nic_number_and_more',
    '0006_user_lab_address_user_lab_name_user_license_id',
)
PRIVATE_ROOT = Path(os.environ['LOCALAPPDATA']) / 'MediTrack'
BACKUP_ROOT = PRIVATE_ROOT / 'Backups'
TOOLS = PRIVATE_ROOT / 'postgresql17' / 'pgsql' / 'bin'
POINTER_FILE = BACKUP_ROOT / 'latest_accounts_repair.json'


class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_ubyte))]


def dpapi(data, protect):
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_ubyte)))
    output = Blob()
    api = ctypes.WinDLL('crypt32', use_last_error=True)
    function = api.CryptProtectData if protect else api.CryptUnprotectData
    function.restype = wintypes.BOOL
    if not function(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(output)):
        raise SystemExit('Windows private-backup encryption/decryption failed.')
    try:
        return ctypes.string_at(output.data, output.size)
    finally:
        free = ctypes.WinDLL('kernel32').LocalFree
        free.argtypes = [ctypes.c_void_p]
        free.restype = ctypes.c_void_p
        free(output.data)


def safe_tool(args, *, input=None, env=None):
    result = subprocess.run(args, input=input, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        message = database_error_message(RuntimeError(result.stderr.decode('utf-8', errors='replace')))
        raise SystemExit('PostgreSQL backup utility failed: ' + message)
    return result.stdout


def expected_connection():
    local = RepositoryEnv(str(settings.ENV_FILE)).data
    cfg = settings.DATABASES['default']
    if connection.vendor != 'postgresql' or local.get('DATABASE_BACKEND') != 'postgresql':
        raise SystemExit('Refusing to inspect or back up a non-PostgreSQL database.')
    for setting, variable in (('HOST', 'SUPABASE_DB_HOST'), ('PORT', 'SUPABASE_DB_PORT'), ('NAME', 'SUPABASE_DB_NAME'), ('USER', 'SUPABASE_DB_USER'), ('PASSWORD', 'SUPABASE_DB_PASSWORD')):
        if str(cfg.get(setting)) != local.get(variable):
            raise SystemExit('Effective connection differs from the intended local configuration; stopping.')
    return cfg


def plan(cursor):
    executor = MigrationExecutor(connection)
    executor.loader.check_consistent_history(connection)
    pending = executor.migration_plan([('accounts', REVIEWED[-1])])
    return [(migration.app_label, migration.name, backwards) for migration, backwards in pending]


def file_hashes():
    return {name: hashlib.sha256((settings.BASE_DIR / 'accounts' / 'migrations' / (name + '.py')).read_bytes()).hexdigest() for name in REVIEWED}


def table_fingerprint(cursor, table, original_rows_only=False):
    quote = connection.ops.quote_name
    columns = ', '.join(quote(column) for column in table['columns'])
    source = quote(table['schema']) + '.' + quote(table['name'])
    parameters = []
    where = ''
    if original_rows_only and table.get('allow_metadata_additions'):
        where = ' WHERE ' + quote('id') + ' <= %s'
        parameters = [table['max_id']]
    cursor.execute(
        "SELECT count(*), encode(sha256(convert_to(COALESCE(string_agg(h, '' ORDER BY h), ''), 'UTF8')), 'hex') "
        "FROM (SELECT encode(sha256(convert_to(row_to_json(t)::text, 'UTF8')), 'hex') AS h "
        'FROM (SELECT ' + columns + ' FROM ' + source + where + ') t) r', parameters,
    )
    count, digest = cursor.fetchone()
    return {'count': count, 'digest': digest}


def create_backup():
    cfg = expected_connection()
    if not BACKUP_ROOT.is_dir():
        raise SystemExit('The private backup directory must be created with restricted Windows permissions first.')
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            if plan(cursor) != [('accounts', name, False) for name in REVIEWED]:
                raise SystemExit('Migration plan differs from the reviewed four migrations; no changes made.')
            cursor.execute("SELECT to_regclass('public.laborator')")
            if cursor.fetchone()[0] is not None:
                raise SystemExit('The laborator table appeared since review; stopping for reassessment.')
            cursor.execute("SELECT pg_export_snapshot()")
            snapshot = cursor.fetchone()[0]
            cursor.execute("SELECT schemaname, tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename")
            tables = []
            for schema, name in cursor.fetchall():
                cursor.execute('SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position', [schema, name])
                table = {'schema': schema, 'name': name, 'columns': [row[0] for row in cursor.fetchall()]}
                cursor.execute("SELECT relkind='p' FROM pg_class WHERE oid=to_regclass(%s)", [connection.ops.quote_name(schema) + '.' + connection.ops.quote_name(name)])
                table['partitioned'] = cursor.fetchone()[0]
                if schema == 'public' and name in {'django_migrations', 'django_content_type', 'auth_permission'}:
                    table['allow_metadata_additions'] = True
                    cursor.execute('SELECT COALESCE(max(id), 0) FROM public.' + connection.ops.quote_name(name))
                    table['max_id'] = cursor.fetchone()[0]
                table.update(table_fingerprint(cursor, table))
                tables.append(table)
            env = os.environ.copy()
            env.update(PGHOST=str(cfg['HOST']), PGPORT=str(cfg['PORT']), PGDATABASE=str(cfg['NAME']), PGUSER=str(cfg['USER']), PGPASSWORD=cfg['PASSWORD'], PGSSLMODE='require', PGCONNECT_TIMEOUT='10', PGOPTIONS='-c default_transaction_read_only=on')
            archive = safe_tool([str(TOOLS / 'pg_dump.exe'), '--format=custom', '--snapshot=' + snapshot, '--lock-wait-timeout=10s'], env=env)
            if not archive.startswith(b'PGDMP'):
                raise SystemExit('The backup is not a valid PostgreSQL custom-format archive.')
    listing = safe_tool([str(TOOLS / 'pg_restore.exe'), '--list'], input=archive).decode('utf-8')
    for table in tables:
        marker = 'TABLE DATA ' + table['schema'] + ' ' + table['name'] + ' '
        if marker not in listing:
            parent_marker = 'TABLE ' + table['schema'] + ' ' + table['name'] + ' '
            if not table['partitioned'] or parent_marker not in listing:
                raise SystemExit('A source table is missing from the backup archive; no migration will be applied.')
    safe_tool([str(TOOLS / 'pg_restore.exe'), '--file=NUL'], input=archive)
    stamp = datetime.now(ZoneInfo('Asia/Colombo')).strftime('%Y%m%d-%H%M%S')
    backup_file = BACKUP_ROOT / ('supabase-before-accounts-0006-' + stamp + '.dump.dpapi')
    backup_file.write_bytes(dpapi(archive, True))
    decoded = dpapi(backup_file.read_bytes(), False)
    if decoded != archive:
        raise SystemExit('Private backup failed its encryption round-trip integrity check.')
    safe_tool([str(TOOLS / 'pg_restore.exe'), '--file=NUL'], input=decoded)
    manifest = {'backup_file': str(backup_file), 'archive_sha256': hashlib.sha256(archive).hexdigest(), 'encrypted_sha256': hashlib.sha256(backup_file.read_bytes()).hexdigest(), 'archive_bytes': len(archive), 'all_table_data_present': True, 'pg_restore_complete_parse_succeeded': True, 'windows_dpapi_round_trip_verified': True, 'tables': tables, 'migration_file_sha256': file_hashes(), 'reviewed_plan': list(REVIEWED), 'database': cfg['NAME']}
    manifest_file = backup_file.with_suffix('.manifest.json')
    manifest_file.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    POINTER_FILE.write_text(json.dumps({'manifest_file': str(manifest_file)}), encoding='utf-8')
    print('Private encrypted PostgreSQL backup created and completely parsed by pg_restore.')
    print('All source tables included:', len(tables))
    print('Windows account encryption/decryption round-trip verified.')
    print('Backup stored outside the repository:', str(backup_file))
    print('No plaintext backup or credentials were written to the repository or logs.')


def verify(after):
    expected_connection()
    manifest_file = Path(json.loads(POINTER_FILE.read_text())['manifest_file'])
    manifest = json.loads(manifest_file.read_text())
    protected = Path(manifest['backup_file']).read_bytes()
    if hashlib.sha256(protected).hexdigest() != manifest['encrypted_sha256']:
        raise SystemExit('The private backup checksum changed; stopping.')
    archive = dpapi(protected, False)
    if hashlib.sha256(archive).hexdigest() != manifest['archive_sha256']:
        raise SystemExit('The decrypted backup checksum does not match; stopping.')
    safe_tool([str(TOOLS / 'pg_restore.exe'), '--file=NUL'], input=archive)
    if file_hashes() != manifest['migration_file_sha256']:
        raise SystemExit('Reviewed migration files changed since the backup; stopping.')
    differences = []
    with transaction.atomic():
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
            expected_plan = [] if after else [('accounts', name, False) for name in REVIEWED]
            if plan(cursor) != expected_plan:
                raise SystemExit('Current migration status differs from the expected guarded plan.')
            for table in manifest['tables']:
                actual = table_fingerprint(cursor, table, original_rows_only=after)
                if actual != {key: table[key] for key in ('count', 'digest')}:
                    differences.append(table['schema'] + '.' + table['name'])
            cursor.execute("SELECT count(*) FROM public.django_migrations WHERE app='accounts' AND name='0003_alter_user_role'")
            orphan_preserved = cursor.fetchone()[0] == 1
    if differences:
        raise SystemExit('Existing data differs from the backup snapshot in: ' + ', '.join(differences))
    if not orphan_preserved:
        raise SystemExit('The orphan migration record is missing.')
    print('Recoverable encrypted backup integrity and complete pg_restore parse verified.')
    print('All existing rows and original column values unchanged across', len(manifest['tables']), 'tables (SHA-256 comparison).')
    print('Orphan 0003_alter_user_role record intact.')
    print('Migration status matches the expected ' + ('completed' if after else 'reviewed four-migration') + ' plan.')
    if after:
        print('Only new framework metadata rows are allowed in migration/content-type/permission tables.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('stage', choices=('backup', 'before', 'after'))
    args = parser.parse_args()
    try:
        create_backup() if args.stage == 'backup' else verify(args.stage == 'after')
    except Exception as error:
        raise SystemExit('Private backup/data check failed (' + type(error).__name__ + '): ' + database_error_message(error)) from None
    finally:
        connection.close()
