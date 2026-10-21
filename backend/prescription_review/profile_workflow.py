"""Profile fictional review requests in disposable SQLite, never the live DB.

From backend: python -m prescription_review.profile_workflow
"""
import json
import os
from time import perf_counter
from uuid import uuid4


def main():
    os.environ['DJANGO_SETTINGS_MODULE'] = 'medicare_project.test_settings'
    import django
    django.setup()
    from django.conf import settings
    from django.db import connection
    from django.test.utils import setup_databases, teardown_databases, setup_test_environment, CaptureQueriesContext
    from django.test import override_settings
    from medicine_knowledge import test_patient_screening as fixtures
    assert settings.DATABASES['default']['ENGINE'] == 'django.db.backends.sqlite3'
    assert settings.DATABASES['default']['NAME'] == ':memory:'
    setup_test_environment()
    database = setup_databases(verbosity=0, interactive=False)
    results = {}
    try:
        with override_settings(ALLOWED_HOSTS=['testserver'], PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=True):
            fixtures.PatientScreeningTests.setUpTestData()
            fixture = fixtures.PatientScreeningTests(methodName='test_preview_has_no_database_writes_training_or_publication')
            fixture.setUp()
            visit, body = fixture.case('influenza')
            saved, _ = fixture.save(visit, body)
            assert saved.status_code == 201, saved.status_code

            def measure(name, call):
                started = perf_counter()
                with CaptureQueriesContext(connection) as queries:
                    response = call()
                assert response.status_code in (200, 201), (name, response.status_code)
                results[name] = {'queries': len(queries), 'elapsed_ms': round(1000 * (perf_counter() - started), 2)}
                return response.json()

            path = f'/api/prescription/consultations/{visit.pk}/medicine-proposals/'
            for run in ('cold', 'warm'):
                proposal = measure('proposal_' + run, lambda: fixture.client.post(path,
                    {'draft_id': saved.data['id'], 'request_key': str(uuid4()), 'synthetic_demo': True}, format='json'))
            for action in ('edited', 'approved'):
                response = measure(action, lambda: fixture.client.post(f"/api/prescription/medicine-proposals/{proposal['id']}/decisions/", {
                    'request_key': str(uuid4()), 'expected_revision': proposal['decisions'][0]['revision'] if proposal['decisions'] else 0,
                    'expected_proposal_hash': proposal['proposal_hash'], 'action': action,
                    'selected_ids': ['oseltamivir-75mg-capsule'], 'reason': 'Isolated fictional performance fixture decision.',
                    'reviewed': True, 'combination_reviewed': False}, format='json'))
                proposal = response['proposal']
            measure('slip', lambda: fixture.client.get(f"/api/prescription/prescription-slips/{response['decision']['id']}/"))
            measure('proposal_list', lambda: fixture.client.get(path))
            measure('workspace_latest', lambda: fixture.client.get(path + '?draft_id=' + saved.data['id']))
            print(json.dumps({'scope': 'isolated SQLite; wall times do not measure cloud latency', 'results': results}, indent=2))
    finally:
        teardown_databases(database, verbosity=0)


if __name__ == '__main__':
    main()
