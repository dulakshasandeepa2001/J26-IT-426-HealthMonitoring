"""Run: python -m exposure.validate_migrations (from backend).

Always uses an isolated in-memory database, regardless of backend/.env.
Simulates existing populated legacy tables without a migration history entry.
"""
import os
os.environ['DJANGO_SETTINGS_MODULE'] = 'medicare_project.test_settings'
import django
django.setup()

from django.apps import apps
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.test.utils import CaptureQueriesContext
from accounts.models import User
from prescription_context.models import PrescriptionContextConsultation as Consultation
from prescription_context.models import PrescriptionContextDiagnosisconfirmation as Diagnosis


def main():
    assert connection.settings_dict['NAME'] == ':memory:'
    executor = MigrationExecutor(connection)
    executor.migrate([('accounts', '0006_user_lab_address_user_lab_name_user_license_id')])
    legacy_models = list(apps.get_app_config('prescription_context').get_models())
    with connection.schema_editor() as editor:
        for model in legacy_models:
            editor.create_model(model)
    patient = User.objects.create_user(username='migration_fixture_patient')
    doctor = User.objects.create_user(username='migration_fixture_doctor')
    consultation = Consultation.objects.create(patient=patient, doctor=doctor, reason='preserve fixture')
    Diagnosis.objects.create(consultation=consultation, doctor=doctor, condition_code='TEST', condition_label='Fixture only')
    tracked = [User, *legacy_models]
    before = {m._meta.label: list(m.objects.order_by('pk').values()) for m in tracked}
    executor = MigrationExecutor(connection)
    with CaptureQueriesContext(connection) as captured:
        executor.migrate([('exposure', '0001_initial')], fake_initial=True)
    after = {m._meta.label: list(m.objects.order_by('pk').values()) for m in tracked}
    assert before == after, 'Existing data changed'
    for query in captured:
        sql = query['sql'].upper()
        if any(word in sql for word in ('CREATE TABLE', 'ALTER TABLE', 'DROP TABLE', 'DELETE FROM', 'UPDATE ')):
            target = sql.split('REFERENCES')[0]
            assert 'PRESCRIPTION_CONTEXT_' not in target and 'ACCOUNTS_USER' not in target, query['sql']
    from django.core.management import call_command
    call_command('check_exposure_schema')
    print('PASS: populated legacy tables survived; initial baseline was faked; only new exposure tables were created.')


if __name__ == '__main__':
    main()
