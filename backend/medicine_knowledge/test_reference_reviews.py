"""Reference acknowledgements persist without satisfying executable gates."""
from io import StringIO
from unittest.mock import patch
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient
from accounts.models import User
from prescription_drafts.models import SafetyProfile
from prescription_drafts.profiles import seed_profiles
from .models import ConditionKnowledge, ConditionKnowledgeReview, content_digest
from .services import seed_catalogue


class ReferenceReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='reference-review-doctor', role='doctor', is_approved=True)
        seed_catalogue(); seed_profiles()
        call_command('seed_six_condition_knowledge', stdout=StringIO())

    def setUp(self):
        self.client = APIClient(); self.client.force_login(self.doctor)

    def review(self, identity='flu-baloxavir', **changes):
        row = ConditionKnowledge.objects.get(pk=identity)
        body = {'decision': 'reviewed', 'notes': 'Inspected reference sources and the missing executable product policy.',
            'evidence_checked': True, 'review_scope': 'reference_only',
            'expected_content_hash': row.rules_hash, 'expected_updated_at': row.updated_at.isoformat()}
        body.update(changes)
        return self.client.post(f'/api/prescription/condition-knowledge/{identity}/review/safety/', body, format='json')

    def test_reference_review_persists_across_new_login_without_executable_approval(self):
        for identity in ('flu-baloxavir', 'flu-peramivir', 'flu-zanamivir', 'gastroenteritis-rehydration'):
            saved = self.review(identity)
            self.assertEqual(saved.status_code, 200, saved.data)
            state = saved.data['safety_review']
            self.assertTrue(state['reference_review_is_current'])
            self.assertFalse(state['is_current'])
            self.assertEqual(state['review_scope'], 'reference_only')
            self.assertFalse(saved.data['live_screening_enabled'])
        count = ConditionKnowledgeReview.objects.count()
        timestamp = state['reviewed_at']
        self.client.logout()
        fresh = APIClient(); fresh.force_login(self.doctor)
        loaded = fresh.get('/api/prescription/condition-knowledge/gastroenteritis-rehydration/').json()
        self.assertEqual(loaded['safety_review']['reviewed_at'], timestamp)
        self.assertTrue(loaded['safety_review']['reference_review_is_current'])
        self.assertFalse(loaded['safety_review']['is_current'])
        self.assertEqual(ConditionKnowledgeReview.objects.count(), count)
        last = ConditionKnowledgeReview.objects.filter(entry_id='gastroenteritis-rehydration').first()
        self.assertEqual(last.reviewer_id, self.doctor.pk)
        self.assertFalse(last.snapshot['executable_approval'])
        self.client = fresh
        self.assertEqual(self.review('gastroenteritis-rehydration').status_code, 200)
        self.assertEqual(ConditionKnowledgeReview.objects.count(), count, 'Reuse does not create another attestation')
        self.assertEqual(SafetyProfile.objects.count(), 4, 'No missing executable product was invented')

    def test_reference_review_can_acknowledge_stored_gaps_after_runtime_binding_change(self):
        row = ConditionKnowledge.objects.get(pk='flu-baloxavir')
        row.rules['clinical_implementation_bindings'] = {'previous': 'implementation'}
        row.rules_hash = content_digest(row.rules); row.save()
        self.assertEqual(self.review().status_code, 200)
        row = ConditionKnowledge.objects.get(pk=row.pk)
        with patch('medicine_knowledge.additional_candidates.clinical_bindings', return_value={'next': 'implementation'}):
            self.assertTrue(row.review_state('safety')['reference_review_is_current'])
            self.assertFalse(row.review_state('safety')['is_current'])
        row.rules['policy']['scope'] += ' Changed reference scope.'
        row.rules_hash = content_digest(row.rules); row.save()
        self.assertFalse(row.review_state('safety')['reference_review_is_current'])

    def test_evidence_integrity_authorization_and_review_scope_cannot_be_forged(self):
        self.assertEqual(self.review(evidence_checked=False).status_code, 400)
        self.assertEqual(self.review(executable_approval=True).status_code, 400)
        self.assertEqual(self.review(expected_content_hash='0' * 64).status_code, 409)
        self.assertEqual(self.review(review_scope='executable').status_code, 400)
        self.assertEqual(self.review('mumps-ibuprofen').status_code, 400)
        row = ConditionKnowledge.objects.get(pk='flu-baloxavir')
        row.rules['policy']['scope'] += ' Tampered without updating digest.'
        row.save()
        self.assertEqual(self.review().status_code, 409)
        self.assertEqual(ConditionKnowledgeReview.objects.count(), 0)
        self.client.logout()
        self.assertEqual(self.review().status_code, 403)

    def test_explicit_scope_refresh_preserves_content_review_and_never_approves_rules(self):
        row = ConditionKnowledge.objects.get(pk='mumps-ibuprofen')
        content = self.client.post(f'/api/prescription/condition-knowledge/{row.pk}/review/content/', {
            'decision': 'reviewed', 'notes': 'Inspected the exact product identity and source mapping.', 'evidence_checked': True,
            'expected_content_hash': row.content_hash, 'expected_updated_at': row.updated_at.isoformat()}, format='json')
        self.assertEqual(content.status_code, 200, content.data)
        row.refresh_from_db()
        row.rules['clinical_implementation_bindings'] = {'previous': 'implementation'}
        row.rules_hash = content_digest(row.rules); row.save()
        self.assertEqual(self.review(row.pk, review_scope='executable').status_code, 409)
        count = ConditionKnowledgeReview.objects.count()
        body = {'expected_content_hash': row.content_hash, 'expected_rules_hash': row.rules_hash, 'expected_updated_at': row.updated_at.isoformat()}
        refreshed = self.client.post(f'/api/prescription/condition-knowledge/{row.pk}/refresh-version/', body, format='json')
        self.assertEqual(refreshed.status_code, 200, refreshed.data)
        self.assertTrue(refreshed.data['content_review']['is_current'])
        self.assertFalse(refreshed.data['safety_review']['is_current'])
        self.assertEqual(ConditionKnowledgeReview.objects.count(), count)
        self.assertEqual(self.review(row.pk, review_scope='executable').status_code, 200)

    def test_scope_version_refresh_rejects_stale_and_unverified_updates(self):
        row = ConditionKnowledge.objects.get(pk='mumps-ibuprofen')
        path = f'/api/prescription/condition-knowledge/{row.pk}/refresh-version/'
        body = {'expected_content_hash': row.content_hash, 'expected_rules_hash': row.rules_hash, 'expected_updated_at': row.updated_at.isoformat()}
        with patch('medicine_knowledge.condition_views.definitions', side_effect=ValueError('source drift')):
            self.assertEqual(self.client.post(path, body, format='json').status_code, 503)
        self.assertEqual(self.client.post(path, dict(body, expected_rules_hash='0' * 64), format='json').status_code, 409)
        row.refresh_from_db()
        self.assertEqual(row.rules_hash, body['expected_rules_hash'])
        self.assertEqual(ConditionKnowledgeReview.objects.count(), 0)
