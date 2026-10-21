"""Exact-product extension tests using fictional encounters and in-memory SQLite."""
from copy import deepcopy
from io import StringIO
from uuid import uuid4
from unittest.mock import patch
from django.core.management import call_command
from django.db import transaction
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from prescription_context.models import PrescriptionContextPatientcontext as Context
from .models import ConditionKnowledge, ConditionKnowledgeReview
from . import test_patient_screening as fixtures
from .ors_reference import definition, policy


@override_settings(PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=True)
class ExactOrsTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        fixtures.PatientScreeningTests.setUpTestData()

    def setUp(self):
        self.fixture = fixtures.PatientScreeningTests(methodName='test_preview_has_no_database_writes_training_or_publication')
        self.fixture.setUp()
        self.client = self.fixture.client
        self.id = policy()['scope_id']

    def import_product(self):
        call_command('seed_reference_ors', stdout=StringIO())
        return ConditionKnowledge.objects.get(pk=self.id)

    def review(self, kind):
        row = ConditionKnowledge.objects.get(pk=self.id)
        return self.client.post(f'/api/prescription/condition-knowledge/{self.id}/review/{kind}/', {
            'decision': 'reviewed', 'evidence_checked': True, 'notes': 'Fictional test doctor examined the exact source and limited executable scope.',
            'expected_content_hash': row.content_hash if kind == 'content' else row.rules_hash,
            'expected_updated_at': row.updated_at.isoformat()}, format='json')

    def case(self, reviewed=True, real=False):
        self.import_product()
        if reviewed:
            for kind in ('content', 'safety'):
                response = self.review(kind)
                self.assertEqual(response.status_code, 200, response.data)
        visit, body = self.fixture.case('viral_gastroenteritis', real=real)
        body['clinical'].update(ors_product_assessment='exact_reference_confirmed', ors_metabolic_assessment='standard',
            ors_dietary_assessment='no_restrictions', ors_obstruction_assessment='none',
            renal_assessment='standard', hepatic_assessment='standard')
        body['clinical']['symptom_durations']['diarrhoea'] = '12.0'
        return visit, body

    def row(self, visit, body):
        response = self.fixture.preview(visit, body)
        self.assertEqual(response.status_code, 200, response.data)
        return next(row for row in response.data['result']['candidates'] if row['scope_id'] == self.id), response

    def test_import_stays_pending_idempotent_and_preserves_generic_ors_and_reviews(self):
        old = ConditionKnowledge.objects.get(medicine_id='ors-low-osmolarity-powder')
        before = deepcopy(old.content), deepcopy(old.rules)
        count = ConditionKnowledgeReview.objects.count()
        row = self.import_product()
        self.assertEqual(ConditionKnowledgeReview.objects.count(), count)
        self.assertFalse(row.review_state('content')['is_current'])
        self.assertFalse(row.review_state('safety')['is_current'])
        updated = row.updated_at
        self.import_product(); row.refresh_from_db()
        self.assertEqual(row.updated_at, updated)
        old.refresh_from_db()
        self.assertEqual((old.content, old.rules), before)
        self.assertIsNone(old.content['product'])

    def test_pending_reviews_missing_facts_and_generic_product_cannot_enable_a_regimen(self):
        visit, body = self.case(reviewed=False)
        row, _ = self.row(visit, body)
        self.assertEqual(row['status'], 'unavailable')
        self.assertIn('knowledge_review', [c['category'] for c in row['checks'] if c['blocks_availability']])
        for kind in ('content', 'safety'):
            self.assertEqual(self.review(kind).status_code, 200)
        for key in ('ors_product_assessment', 'ors_metabolic_assessment', 'ors_dietary_assessment', 'ors_obstruction_assessment',
                    'renal_assessment', 'hepatic_assessment', 'excipient_assessment', 'dehydration_assessment', 'oral_fluid_tolerance'):
            changed = deepcopy(body); changed['clinical'][key] = 'unknown'
            row, _ = self.row(visit, changed)
            self.assertEqual(row['status'], 'unavailable', key)
            self.assertIsNone(row['regimen'])
        changed = deepcopy(body); changed['clinical']['ors_product_assessment'] = 'different_or_unverified'
        self.assertEqual(self.row(visit, changed)[0]['status'], 'unavailable')

    def test_exact_reviewed_standard_context_has_event_based_dilution_without_daily_or_fixed_course(self):
        visit, body = self.case()
        row, response = self.row(visit, body)
        self.assertEqual(row['status'], 'candidate_for_clinician_review', row['checks'])
        self.assertEqual(row['product']['reference_product_identifier'], 'UK PL 35104/0044')
        self.assertEqual(row['regimen']['amount_range'], [1, 2])
        self.assertEqual(row['regimen']['reconstitution_water_ml_per_sachet'], 200)
        self.assertIsNone(row['regimen']['duration_days'])
        self.assertIsNone(row['regimen']['doses_per_day'])
        generic = next(r for r in response.data['result']['candidates'] if r['medicine_id'] == 'ors-low-osmolarity-powder')
        self.assertEqual(generic['status'], 'unavailable')
        saved, _ = self.fixture.save(visit, body, response.json())
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertTrue(saved.data['current_state']['is_current'])

    def test_concerns_unsupported_age_real_scope_and_duration_remain_unavailable(self):
        visit, body = self.case()
        for name, value in (('dehydration_assessment', 'moderate'), ('oral_fluid_tolerance', 'not_tolerated'),
            ('ors_obstruction_assessment', 'suspected'), ('ors_metabolic_assessment', 'requires_review'),
            ('ors_dietary_assessment', 'requires_review'), ('condition_severity', 'severe')):
            changed = deepcopy(body); changed['clinical'][name] = value
            self.assertEqual(self.row(visit, changed)[0]['status'], 'unavailable', name)
        for concern in ('blood_in_stool', 'severe_abdominal_pain', 'fluid_restriction', 'pregnant_or_breastfeeding'):
            changed = deepcopy(body); changed['clinical']['condition_assessments'][concern] = True
            self.assertEqual(self.row(visit, changed)[0]['status'], 'unavailable', concern)
        changed = deepcopy(body); changed['clinical']['symptom_durations']['diarrhoea'] = '25.0'
        self.assertEqual(self.row(visit, changed)[0]['status'], 'unavailable')
        patient = self.fixture.patient
        patient.birthday = '2015-01-01'; patient.save()
        self.assertEqual(self.row(visit, body)[0]['status'], 'unavailable')
        patient.birthday = '1990-01-01'; patient.save()
        visit.is_demo = False; visit.save()
        self.assertEqual(self.row(visit, body)[0]['status'], 'unavailable')

    def test_unknown_history_known_allergy_and_current_medicines_do_not_clear(self):
        visit, body = self.case()
        from .ors_screening import apply_reference_ors
        response = self.fixture.preview(visit, body)
        from .complete_screening import prepare
        with transaction.atomic():
            snapshot, result, _ = prepare(visit, self.fixture.doctor, body)
        for change in ({'allergy_status': 'unknown'}, {'medicine_status': 'unknown'},
            {'allergy_status': 'confirmed', 'allergies': ['glucose']},
            {'medicine_status': 'confirmed', 'current_medicines': ['unresolved current product']}):
            s, r = deepcopy(snapshot), deepcopy(result)
            s['context'].update(change)
            apply_reference_ors(s, r)
            row = next(row for row in r['candidates'] if row['scope_id'] == self.id)
            self.assertEqual(row['status'], 'unavailable', change)
        self.assertEqual(response.status_code, 200)

    def test_rf_abstains_but_explicit_doctor_selection_can_approve_exact_available_product(self):
        visit, body = self.case()
        saved, _ = self.fixture.save(visit, body)
        self.assertEqual(saved.status_code, 201, saved.data)
        path = f'/api/prescription/consultations/{visit.pk}/medicine-proposals/'
        with patch('sklearn.ensemble.RandomForestClassifier.fit', side_effect=AssertionError('No request training')):
            proposal = self.client.post(path, {'draft_id': saved.data['id'], 'request_key': str(uuid4()), 'synthetic_demo': True}, format='json')
        self.assertEqual(proposal.status_code, 201, proposal.data)
        model = next(row for row in proposal.data['result']['ml']['predictions'] if row['medicine_id'] == policy()['medicine_id'])
        self.assertEqual(model['status'], 'abstained')
        self.assertFalse(model['suggested'])
        decision = self.client.post(f"/api/prescription/medicine-proposals/{proposal.data['id']}/decisions/", {
            'request_key': str(uuid4()), 'expected_revision': 0, 'expected_proposal_hash': proposal.data['proposal_hash'],
            'action': 'approved', 'selected_ids': [policy()['medicine_id']], 'reviewed': True,
            'reason': 'Fictional doctor independently selected the exact reviewed ORS reference.'}, format='json')
        self.assertEqual(decision.status_code, 201, decision.data)
        slip = self.client.get(f"/api/prescription/prescription-slips/{decision.data['decision']['id']}/")
        self.assertEqual(slip.status_code, 200, slip.data)
        self.assertEqual(len(slip.data['medicines']), 1)
        self.assertEqual(slip.data['medicines'][0]['regimen']['reconstitution_water_ml_per_sachet'], 200)

    def test_changed_implementation_or_review_revocation_invalidates_the_saved_assessment(self):
        visit, body = self.case()
        saved, _ = self.fixture.save(visit, body)
        self.assertEqual(saved.status_code, 201, saved.data)
        from .complete_screening import freshness
        from .models import PatientScreeningDraft
        row = PatientScreeningDraft.objects.get(pk=saved.data['id'])
        with patch('medicine_knowledge.complete_screening.implementation_binding', return_value={'hash': 'changed'}):
            self.assertFalse(freshness(row, self.fixture.doctor)['is_current'])
        user = type(self.fixture.doctor)
        user.objects.filter(pk=self.fixture.doctor.pk).update(is_approved=False)
        response = self.client.get(f'/api/prescription/six-condition-drafts/{row.pk}/')
        self.assertEqual(response.status_code, 403)
