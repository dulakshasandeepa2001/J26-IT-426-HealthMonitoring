"""Browser-test bridge to the real Django APIs in disposable in-memory SQLite.

All identities, review decisions and clinical contexts here are test fixtures.
No network, configured clinical database, research export or training is used.
"""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'backend'))
os.environ['DJANGO_SETTINGS_MODULE'] = 'medicare_project.test_settings'
import django
django.setup()
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.test.utils import setup_databases, setup_test_environment, teardown_databases
from django.test import override_settings
from accounts.models import User
from medicine_knowledge.test_patient_screening import PatientScreeningTests
from medicine_knowledge.models import PatientScreeningDraft
from prescription_context.models import PrescriptionContextPatientcontext as Context


def emit(value):
    print(json.dumps(value, cls=DjangoJSONEncoder), flush=True)


assert settings.DATABASES['default']['ENGINE'] == 'django.db.backends.sqlite3'
assert settings.DATABASES['default']['NAME'] == ':memory:'
setup_test_environment()
database = setup_databases(verbosity=0, interactive=False)
guard = override_settings(ALLOWED_HOSTS=['testserver', 'localhost', '127.0.0.1'], PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=True)
guard.enable()
try:
    PatientScreeningTests.setUpTestData()
    fixture = PatientScreeningTests(methodName='test_preview_has_no_database_writes_training_or_publication')
    fixture.setUp()
    cases = []
    for condition in ('influenza', 'chickenpox', 'measles', 'mumps', 'viral_conjunctivitis', 'viral_gastroenteritis'):
        fixture.patient = User.objects.create_user(username='browser_fixture_' + condition, role='patient', is_approved=True, birthday='1990-01-01')
        visit, request = fixture.case(condition)
        cases.append({'condition': condition, 'patient': fixture.patient.pk, 'visit': str(visit.pk), 'clinical': request['clinical']})
    # Keep one genuine legacy API draft to verify combined Records rendering.
    from prescription_drafts.contracts import ClinicalDetailsSerializer
    from uuid import uuid4
    old_clinical = {key: value for key, value in cases[0]['clinical'].items() if key in ClinicalDetailsSerializer().fields}
    old_clinical['verified_symptoms'] = ['fever', 'body_aches']
    old_clinical['symptom_durations'] = {'fever': '12.0', 'body_aches': '12.0'}
    old_clinical['reviewed'] = False
    inputs = fixture.client.get(f"/api/prescription/consultations/{cases[0]['visit']}/clinical-screening/inputs/").json()
    old_body = {'diagnosis_id': inputs['confirmed_diagnoses'][0]['id'], 'expected_context_updated_at': inputs['expected_context_updated_at'], 'clinical': old_clinical}
    old_preview = fixture.client.post(f"/api/prescription/drafts/regimens/{cases[0]['visit']}/", old_body, format='json')
    assert old_preview.status_code == 200, old_preview.data
    old_clinical['reviewed'] = True
    old_saved = fixture.client.post(f"/api/prescription/drafts/generate/{cases[0]['visit']}/", dict(old_body, request_key=str(uuid4()), expected_latest_revision=0,
        selection_mode='automatic', expected_plan_hash=old_preview.data['plan_hash'], proposals=[]), format='json')
    assert old_saved.status_code == 201, old_saved.data
    emit({'ready': True, 'cases': cases, 'legacy_id': old_saved.data['id']})
    for line in sys.stdin:
        try:
            message = json.loads(line)
            if message.get('action') == 'import_exact_ors':
                from django.core.management import call_command
                from io import StringIO
                call_command('seed_reference_ors', stdout=StringIO())
                emit({'imported': True})  # Pending; browser must perform genuine isolated reviews.
                continue
            if message.get('action') == 'count':
                emit({'count': PatientScreeningDraft.objects.count()})
                continue
            if message.get('action') == 'fictional_doctor_profile':
                fixture.doctor.first_name = 'Fictional'
                fixture.doctor.last_name = 'Reviewer'
                fixture.doctor.degrees = 'Fictional research qualification'
                fixture.doctor.university = 'Fictional Research University'
                fixture.doctor.save(update_fields=['first_name', 'last_name', 'degrees', 'university'])
                emit({'configured': True})
                continue
            if message.get('action') == 'change_context':
                row = Context.objects.get(patient_id=message['patient'])
                row.save()  # Real updated_at change, same verified visit history.
                emit({'changed': True})
                continue
            if message.get('action') == 'pending_safety_review':
                from prescription_drafts.models import SafetyProfile
                SafetyProfile.objects.filter(pk=message['medicine']).update(review_status='pending')
                emit({'pending': True})
                continue
            if message.get('action') == 'outdated_scope':
                from medicine_knowledge.models import ConditionKnowledge, content_digest
                row = ConditionKnowledge.objects.get(pk=message['scope'])
                row.rules['clinical_implementation_bindings'] = {'fixture': 'previous implementation'}
                row.rules_hash = content_digest(row.rules)
                row.save()  # Disposable in-memory fixture only; preserve review history.
                emit({'outdated': True})
                continue
            if message.get('action') == 'reported_severe':
                from prescription_context.models import PrescriptionContextConsultationanalysis as Analysis
                row = Analysis.objects.get(consultation_id=message['visit'])
                row.payload['severity']['level'] = 'severe'
                row.save()
                emit({'changed': True})
                continue
            if message.get('action') == 'revoke':
                User.objects.filter(pk=fixture.doctor.pk).update(is_approved=False)
                emit({'revoked': True})
                continue
            method = message['method'].lower()
            call = getattr(fixture.client, method)
            response = call(message['path'], **({'data': message.get('body', {}), 'format': 'json'} if method != 'get' else {}))
            emit({'status': response.status_code, 'data': json.loads(response.content) if response.content else None})
        except Exception as error:
            emit({'bridge_error': str(error)})
finally:
    guard.disable()
    teardown_databases(database, verbosity=0)
