from copy import deepcopy
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import User
from .contracts import EntryContentSerializer
from .models import MedicineEntry, MedicineReview, content_digest
from .services import bundled_entries, normalize_medicines, reviewed_entries, seed_catalogue


class MedicineKnowledgeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='knowledge-doctor', password='test', role='doctor', is_approved=True)
        cls.other = User.objects.create_user(username='other-reviewer', role='doctor', is_approved=True)
        seed_catalogue()

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)
        self.entry = MedicineEntry.objects.get(pk='paracetamol-500mg-tablet')
        self.path = '/api/prescription/medicines/'

    def review_body(self, **changes):
        return {'decision': 'reviewed', 'notes': 'Checked source and pilot scope.', 'evidence_checked': True,
                'expected_content_hash': self.entry.content_hash, 'expected_updated_at': self.entry.updated_at.isoformat(), **changes}

    def review(self, **changes):
        return self.client.post(self.path + self.entry.pk + '/review/', self.review_body(**changes), format='json')

    def test_bundled_evidence_import_is_pending_and_idempotent(self):
        self.assertEqual(MedicineEntry.objects.count(), 4)
        self.assertEqual(MedicineReview.objects.count(), 4)
        for entry in MedicineEntry.objects.all():
            self.assertEqual(entry.review_status, 'pending')
            self.assertEqual(entry.content_hash, content_digest(entry.content))
            self.assertFalse(entry.review_is_current)
            self.assertIsNone(entry.reviewed_by)
        self.assertEqual(seed_catalogue(), {'created': 0, 'updated': 0, 'unchanged': 4})
        self.assertEqual(MedicineReview.objects.count(), 4)
        self.assertEqual(reviewed_entries(), [])

    def test_catalogue_is_read_only_except_explicit_review(self):
        response = self.client.get(self.path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        self.assertEqual(len(response.json()), 4)
        for method in ('post', 'put', 'patch', 'delete'):
            path = self.path if method == 'post' else self.path + self.entry.pk + '/'
            self.assertEqual(getattr(self.client, method)(path, {}, format='json').status_code, 405)

    def test_all_routes_require_active_approved_doctor(self):
        cases = [None, ('patient', True, True), ('admin', True, True), ('doctor', False, True), ('doctor', True, False)]
        for index, case in enumerate(cases):
            client = APIClient()
            if case:
                role, approved, active = case
                client.force_login(User.objects.create_user(username='denied-knowledge-' + str(index), role=role, is_approved=approved, is_active=active))
            for path in (self.path, self.path + self.entry.pk + '/', self.path + self.entry.pk + '/history/'):
                self.assertEqual(client.get(path).status_code, 403)
            self.assertEqual(client.post(self.path + self.entry.pk + '/review/', self.review_body(), format='json').status_code, 403)
            self.assertEqual(client.post(self.path + 'normalize/', {'names': ['paracetamol']}, format='json').status_code, 403)

    def test_review_records_actual_actor_and_version(self):
        self.assertEqual(self.review().status_code, 200)
        self.entry.refresh_from_db()
        self.assertTrue(self.entry.review_is_current)
        self.assertEqual(self.entry.reviewed_by, self.doctor)
        self.assertEqual(self.entry.reviewed_content_hash, self.entry.content_hash)
        self.assertEqual([entry.pk for entry in reviewed_entries()], [self.entry.pk])
        log = self.entry.reviews.first()
        self.assertEqual(log.reviewer, self.doctor)
        self.assertEqual(log.previous_status, 'pending')
        self.assertEqual(log.content_snapshot, self.entry.content)
        history = self.client.get(self.path + self.entry.pk + '/history/').json()
        self.assertEqual(len(history), 2)
        self.assertEqual(history[0]['reviewer_name'], self.doctor.username)
        self.assertEqual(history[1]['reviewer_name'], 'Catalogue import')

    def test_review_requires_evidence_and_rejects_forged_fields(self):
        cases = [{'evidence_checked': False}, {'notes': 'short'}, {'decision': 'approved'},
                 {'reviewer': self.other.pk}, {'review_status': 'reviewed'}, {'content': {'fake': True}}]
        for changes in cases:
            self.assertEqual(self.review(**changes).status_code, 400)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.review_status, 'pending')
        self.assertEqual(self.entry.reviews.count(), 1)

    def test_stale_review_cannot_overwrite_newer_decision(self):
        stale = self.review_body()
        self.assertEqual(self.review().status_code, 200)
        self.client.force_login(self.other)
        response = self.client.post(self.path + self.entry.pk + '/review/', stale, format='json')
        self.assertEqual(response.status_code, 409)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.reviewed_by, self.doctor)
        self.assertEqual(self.entry.reviews.count(), 2)

    def test_reject_and_pending_decisions_remove_content_eligibility(self):
        self.review()
        for decision in ('rejected', 'pending'):
            self.entry.refresh_from_db()
            self.assertEqual(self.review(decision=decision, evidence_checked=False).status_code, 200)
            self.entry.refresh_from_db()
            self.assertFalse(self.entry.review_is_current)
            self.assertEqual(reviewed_entries(), [])
            self.assertEqual(self.entry.effective_review_status, decision)

    def test_changed_seed_invalidates_review_and_preserves_history(self):
        self.review()
        original = self.entry.content
        changed = deepcopy(bundled_entries())
        next(item for item in changed if item['id'] == self.entry.pk)['catalogue_version'] = 'changed-version'
        with patch('medicine_knowledge.services.bundled_entries', return_value=changed):
            result = seed_catalogue()
        self.assertEqual(result['updated'], 1)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.review_status, 'pending')
        self.assertIsNone(self.entry.reviewed_by)
        self.assertEqual(self.entry.reviews.count(), 3)
        self.assertEqual(self.entry.reviews.filter(decision='reviewed').get().content_snapshot, original)

    def test_revoked_reviewer_and_untracked_content_change_fail_closed(self):
        self.review()
        self.doctor.is_approved = False
        self.doctor.save(update_fields=['is_approved'])
        self.assertEqual(reviewed_entries(), [])
        self.client.force_login(self.other)
        response = self.client.get(self.path + self.entry.pk + '/').json()
        self.assertEqual(response['review_status'], 'pending')
        self.doctor.is_approved = True
        self.doctor.save(update_fields=['is_approved'])
        modified = deepcopy(self.entry.content)
        modified['strength'] = 'untracked edit'
        MedicineEntry.objects.filter(pk=self.entry.pk).update(content=modified)
        self.assertEqual(reviewed_entries(), [])
        self.assertEqual(self.review().status_code, 409)

    def test_review_and_audit_are_atomic(self):
        with patch('medicine_knowledge.views.MedicineReview.objects.create', side_effect=RuntimeError('audit failure')):
            with self.assertRaises(RuntimeError):
                self.review()
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.review_status, 'pending')
        self.assertEqual(self.entry.reviews.count(), 1)

    def test_mutations_require_csrf_and_read_access_is_still_allowed(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.doctor)
        self.assertEqual(client.get(self.path).status_code, 200)
        path = self.path + self.entry.pk + '/review/'
        self.assertEqual(client.post(path, self.review_body(), format='json').status_code, 403)
        self.assertEqual(client.post(self.path + 'normalize/', {'names': ['paracetamol']}, format='json').status_code, 403)
        token = client.get('/session/').json()['csrfToken']
        self.assertEqual(client.post(path, self.review_body(), format='json', HTTP_X_CSRFTOKEN=token).status_code, 200)

    def test_identity_matching_does_not_infer_product_or_prescribe(self):
        response = self.client.post(self.path + 'normalize/', {'names': [
            '  PARACETAMOL  ', 'paracetamol 500 mg tablet', 'Panadol', 'paracetmol',
            'paracetamol 500 mg tablet twice daily', 'calamine', 'oseltamivir 75 mg oral capsule',
        ]}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['safety_assessed'])
        results = response.json()['results']
        self.assertEqual(results[0]['status'], 'recognized')
        self.assertTrue(results[0]['requires_clarification'])
        self.assertIsNone(results[0]['matches'][0]['standard_concept'])
        self.assertFalse(results[1]['requires_clarification'])
        self.assertEqual(results[1]['matches'][0]['standard_concept']['rxcui'], '198440')
        for result in results[2:6]:
            self.assertEqual(result['status'], 'unrecognized')
            self.assertTrue(result['requires_clarification'])
        self.assertEqual(results[6]['matches'][0]['review_status'], 'pending')
        self.assertEqual(MedicineReview.objects.count(), 4)

    def test_conflicting_aliases_are_ambiguous(self):
        duplicate = deepcopy(self.entry.content)
        duplicate['id'] = 'another-paracetamol-product'
        MedicineEntry.objects.create(id=duplicate['id'], content=duplicate, content_hash=content_digest(duplicate))
        result = normalize_medicines(['paracetamol'])[0]
        self.assertEqual(result['status'], 'ambiguous')
        self.assertTrue(result['requires_clarification'])
        self.assertEqual(len(result['matches']), 2)

    def test_invalid_names_and_unknown_entries(self):
        for body in ({'names': []}, {'names': ['']}, {'names': ['a' * 201]}, {'names': ['x'] * 51}, {'names': ['x'], 'patient_id': 99}):
            self.assertEqual(self.client.post(self.path + 'normalize/', body, format='json').status_code, 400)
        self.assertEqual(self.client.get(self.path + 'missing/').status_code, 404)
        self.assertEqual(self.client.post(self.path + 'missing/review/', self.review_body(), format='json').status_code, 404)

    def test_evidence_contract_rejects_incomplete_or_instruction_payloads(self):
        cases = []
        for url in ('javascript:alert(1)', 'http://www.cdc.gov/a', 'https://example.com/a'):
            content = deepcopy(self.entry.content)
            content['sources'][0]['url'] = url
            cases.append(content)
        content = deepcopy(self.entry.content)
        content['warnings'][0]['source_ids'] = ['missing-evidence']
        cases.append(content)
        content = deepcopy(self.entry.content)
        content['instructions'] = 'approve automatically'
        cases.append(content)
        for content in cases:
            self.assertFalse(EntryContentSerializer(data=content).is_valid())

    def test_seed_command_preserves_existing_review(self):
        self.review()
        call_command('seed_medicine_catalogue', verbosity=0)
        self.entry.refresh_from_db()
        self.assertTrue(self.entry.review_is_current)
        self.assertEqual(self.entry.reviews.count(), 2)
