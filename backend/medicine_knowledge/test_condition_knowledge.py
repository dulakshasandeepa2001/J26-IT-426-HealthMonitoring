from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from prescription_drafts.models import SafetyProfile, SafetyReview
from prescription_drafts.profiles import engine_digest, seed_profiles
from .condition_knowledge import definitions, seed_condition_knowledge
from .models import ConditionKnowledge, ConditionKnowledgeReview, MedicineEntry, MedicineReview, content_digest
from .services import seed_catalogue


class ConditionKnowledgeTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='scope-doctor', role='doctor', is_approved=True)
        cls.other = User.objects.create_user(username='scope-other', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='scope-patient', role='patient', is_approved=True)
        seed_catalogue()
        seed_profiles()
        seed_condition_knowledge()

    def setUp(self):
        self.client = APIClient()
        self.client.force_login(self.doctor)

    def review(self, identity='measles-fever', kind='content', **changes):
        row = ConditionKnowledge.objects.get(pk=identity)
        body = {'decision': 'reviewed', 'notes': 'Checked the linked evidence and condition scope.', 'evidence_checked': True,
                'expected_content_hash': row.content_hash if kind == 'content' else row.rules_hash, 'expected_updated_at': row.updated_at.isoformat()}
        body.update(changes)
        return self.client.post(f'/api/prescription/condition-knowledge/{identity}/review/{kind}/', body, format='json')

    def test_four_scope_definitions_keep_product_identity_purpose_sources_and_ors_nulls(self):
        response = self.client.get('/api/prescription/condition-knowledge/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Cache-Control'], 'no-store')
        rows = response.json()
        self.assertEqual(len(rows), 4)
        self.assertEqual({row['condition'] for row in rows}, {'measles', 'mumps', 'viral_conjunctivitis', 'viral_gastroenteritis'})
        self.assertEqual(ConditionKnowledgeReview.objects.count(), 0)
        for row in rows:
            self.assertFalse(row['content_review']['is_current'])
            self.assertFalse(row['safety_review']['is_current'])
            self.assertFalse(row['live_screening_enabled'])
            self.assertIsNone(row['content_review']['reviewer_name'])
            product = row['content']['product']
            if product:
                self.assertEqual([u['condition'] for u in product['uses']], [row['condition']])
                self.assertTrue(product['sources'])
                self.assertTrue(product['standard_concept']['rxcui'].isdigit())
            else:
                self.assertEqual(row['content']['purpose'], 'rehydration_support')
                self.assertIsNone(row['content']['unresolved_product']['rxcui'])
                self.assertIsNone(row['content']['unresolved_product']['regimen'])

    def test_current_reviews_persist_across_sessions_and_are_not_repeated(self):
        first = self.review()
        self.assertEqual(first.status_code, 200, first.data)
        self.assertTrue(first.data['content_review']['is_current'])
        self.assertFalse(first.data['safety_review']['is_current'])
        self.assertEqual(self.review(kind='safety').status_code, 200)
        self.client.force_login(self.other)
        self.assertTrue(self.review().data['content_review']['is_current'])
        self.assertEqual(ConditionKnowledgeReview.objects.count(), 2)
        row = self.client.get('/api/prescription/condition-knowledge/measles-fever/').json()
        self.assertTrue(row['content_review']['is_current'])
        self.assertTrue(row['safety_review']['is_current'])
        self.assertEqual(row['content_review']['reviewer_name'], self.doctor.username)
        self.assertFalse(row['live_screening_enabled'])

    def test_explicit_amendment_or_rejection_keeps_real_audit_history(self):
        self.review()
        self.review(notes='A further explicit evidence review was recorded.')
        rejected = self.review(decision='rejected', notes='This scope needs a correction before use.')
        self.assertFalse(rejected.data['content_review']['is_current'])
        self.assertEqual(rejected.data['content_review']['status'], 'rejected')
        history = self.client.get('/api/prescription/condition-knowledge/measles-fever/history/').json()
        self.assertEqual(len(history), 3)
        self.assertTrue(all(row['reviewer_name'] == self.doctor.username for row in history))

    def test_unchanged_seed_preserves_pilot_and_addition_reviews_and_engine_binding(self):
        entry = MedicineEntry.objects.get(pk='paracetamol-500mg-tablet')
        for url, obj in ((f'/api/prescription/medicines/{entry.pk}/review/', entry),
                         (f'/api/prescription/safety-profiles/{entry.pk}/review/', SafetyProfile.objects.get(pk=entry.pk))):
            result = self.client.post(url, {'decision': 'reviewed', 'notes': 'Inspected original pilot evidence and scope.', 'evidence_checked': True,
                'expected_content_hash': obj.content_hash, 'expected_updated_at': obj.updated_at.isoformat()}, format='json')
            self.assertEqual(result.status_code, 200, result.data)
        self.review()
        before = (list(MedicineEntry.objects.values()), list(SafetyProfile.objects.values()), MedicineReview.objects.count(), SafetyReview.objects.count(), engine_digest())
        self.assertEqual(seed_condition_knowledge(), {'created': 0, 'updated': 0, 'unchanged': 4})
        after = (list(MedicineEntry.objects.values()), list(SafetyProfile.objects.values()), MedicineReview.objects.count(), SafetyReview.objects.count(), engine_digest())
        self.assertEqual(before, after)
        self.assertTrue(MedicineEntry.objects.get(pk=entry.pk).review_is_current)
        self.assertTrue(SafetyProfile.objects.get(pk=entry.pk).review_is_current)
        self.assertTrue(ConditionKnowledge.objects.get(pk='measles-fever').review_state('content')['is_current'])

    def test_changed_content_invalidates_only_that_scope_without_deleting_audits(self):
        self.review(); self.review(kind='safety')
        self.review('mumps-fever-pain')
        changed = definitions()
        changed[0]['content']['product']['uses'][0]['summary'] += ' Updated test snapshot.'
        changed[0]['content_hash'] = content_digest(changed[0]['content'])
        with patch('medicine_knowledge.condition_knowledge.definitions', return_value=changed):
            counts = seed_condition_knowledge()
        self.assertEqual(counts['updated'], 1)
        row = ConditionKnowledge.objects.get(pk='measles-fever')
        self.assertFalse(row.review_state('content')['is_current'])
        self.assertFalse(row.review_state('safety')['is_current'])
        self.assertEqual(row.reviews.count(), 2)
        self.assertTrue(ConditionKnowledge.objects.get(pk='mumps-fever-pain').review_state('content')['is_current'])
        self.assertEqual(self.review().status_code, 409)

    def test_rule_code_change_requires_safety_review_only(self):
        self.review(); self.review(kind='safety')
        row = ConditionKnowledge.objects.get(pk='measles-fever')
        with patch('medicine_knowledge.condition_knowledge.rule_bindings', return_value={'changed': 'implementation'}):
            self.assertTrue(row.review_state('content')['is_current'])
            self.assertFalse(row.review_state('safety')['is_current'])

    def test_revoked_reviewer_makes_saved_scope_reviews_pending(self):
        self.review(); self.review(kind='safety')
        self.doctor.is_approved = False
        self.doctor.save(update_fields=['is_approved'])
        self.client.force_login(self.other)
        row = self.client.get('/api/prescription/condition-knowledge/measles-fever/').json()
        self.assertFalse(row['content_review']['is_current'])
        self.assertFalse(row['safety_review']['is_current'])
        self.assertIn('no longer', row['content_review']['reason'])

    def test_ors_identity_cannot_be_cleared_by_safety_review(self):
        self.assertEqual(self.review('gastroenteritis-rehydration').status_code, 200)
        result = self.review('gastroenteritis-rehydration', kind='safety')
        self.assertEqual(result.status_code, 400)
        pending = self.review('gastroenteritis-rehydration', kind='safety', decision='pending', evidence_checked=False)
        self.assertEqual(pending.status_code, 200, pending.data)
        self.assertFalse(pending.data['safety_review']['is_current'])
        self.assertFalse(pending.data['live_screening_enabled'])

    def test_stale_missing_evidence_short_notes_and_forged_fields_rejected(self):
        for changes, status in (({'expected_content_hash': '0' * 64}, 409), ({'evidence_checked': False}, 400),
            ({'notes': 'short'}, 400), ({'reviewer': self.other.pk}, 400), ({'live_screening_enabled': True}, 400)):
            with self.subTest(changes=changes):
                self.assertEqual(self.review(**changes).status_code, status)
        self.assertEqual(ConditionKnowledgeReview.objects.count(), 0)

    def test_changed_frozen_bundle_fails_without_fabricating_review(self):
        with patch('medicine_knowledge.condition_views.definitions', side_effect=ValueError('hash drift')):
            self.assertEqual(self.review().status_code, 503)
        self.assertEqual(ConditionKnowledgeReview.objects.count(), 0)

    def test_access_csrf_and_no_edit_delete_routes(self):
        self.assertEqual(APIClient().get('/api/prescription/condition-knowledge/').status_code, 403)
        self.client.force_login(self.patient)
        self.assertEqual(self.client.get('/api/prescription/condition-knowledge/').status_code, 403)
        strict = APIClient(enforce_csrf_checks=True)
        strict.force_login(self.doctor)
        self.assertEqual(strict.post('/api/prescription/condition-knowledge/measles-fever/review/content/', {}, format='json').status_code, 403)
        self.client.force_login(self.doctor)
        for method in ('post', 'put', 'patch', 'delete'):
            path = '/api/prescription/condition-knowledge/' if method == 'post' else '/api/prescription/condition-knowledge/measles-fever/'
            self.assertEqual(getattr(self.client, method)(path, {}, format='json').status_code, 405)
