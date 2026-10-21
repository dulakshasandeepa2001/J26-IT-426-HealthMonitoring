"""Keep exposure data behind Django authentication on Supabase/PostgreSQL.

Supabase default privileges grant anon/authenticated access to newly created
public tables. These are backend-only tables: revoke those grants and enable
RLS with no client policies. The backend owner/bypass-RLS role retains access.
Only this feature's new tables and identity sequences are affected.
"""
from django.db import migrations


TABLES = (
    'exposure_trackingconsent', 'exposure_locationsample',
    'exposure_proximityencounter', 'exposure_diagnosismetadata',
    'exposure_riskzoneversion', 'exposure_riskzonevisit',
    'exposure_exposureanalysis',
)


def restrict_direct_access(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    quote = schema_editor.quote_name
    with schema_editor.connection.cursor() as cursor:
        cursor.execute("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")
        roles = ['PUBLIC', *[quote(row[0]) for row in cursor.fetchall()]]
        grantees = ', '.join(roles)
        for table in TABLES:
            qualified = 'public.' + quote(table)
            cursor.execute(f'ALTER TABLE {qualified} ENABLE ROW LEVEL SECURITY')
            cursor.execute(f'REVOKE ALL PRIVILEGES ON TABLE {qualified} FROM {grantees}')
            cursor.execute('SELECT pg_get_serial_sequence(%s, %s)', ['public.' + table, 'id'])
            sequence = cursor.fetchone()[0]
            if sequence:
                # This identifier comes from PostgreSQL, not a client payload.
                schema, name = sequence.split('.', 1)
                cursor.execute(f'REVOKE ALL PRIVILEGES ON SEQUENCE {quote(schema)}.{quote(name)} FROM {grantees}')


class Migration(migrations.Migration):
    dependencies = [('exposure', '0001_initial')]
    operations = [migrations.RunPython(restrict_direct_access)]
