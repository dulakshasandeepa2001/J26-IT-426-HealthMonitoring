"""Isolated prospective pair coverage; never live clinical data or fake reviews."""
from copy import deepcopy
from unittest.mock import patch
from uuid import uuid4
from django.test import TestCase, override_settings
from . import test_patient_screening as fixtures
from .models import MedicineEntry, PatientScreeningDraft
from .selected_interactions import pair_scope, policy, implementation_binding
from . import selected_screening
from prescription_context.models import PrescriptionContextPatientcontext as Context
from prescription_context.history_identity import product_hash
from prescription_drafts.models import SafetyProfile


@override_settings(PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=True)
class SelectedInteractionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        fixtures.PatientScreeningTests.setUpTestData.__func__(cls)

    setUp = fixtures.PatientScreeningTests.setUp
    case = fixtures.PatientScreeningTests.case
    path = staticmethod(fixtures.PatientScreeningTests.path)
    preview = fixtures.PatientScreeningTests.preview
    save = fixtures.PatientScreeningTests.save

    def fixture(self):
        visit, body = self.case('influenza')
        product = MedicineEntry.objects.get(pk='paracetamol-500mg-tablet')
        context = Context.objects.get(patient=self.patient)
        history = {'allergy_status': 'confirmed', 'allergies': ['Penicillin (Rash)'], 'medicine_status': 'confirmed',
            'current_medicines': ['Paracetamol 500mg SOS'], 'reviewed': True, 'expected_updated_at': context.updated_at.isoformat(),
            'history_details': {'allergies': [{'recorded_text': 'Penicillin (Rash)', 'identity': 'penicillin', 'reaction': 'Rash', 'reaction_date': None, 'clarification_note': ''}],
                'medicines': [{'recorded_text': 'Paracetamol 500mg SOS', 'catalogue_id': product.pk, 'expected_identity_hash': product_hash(product.content),
                    'schedule': 'SOS', 'clarification_note': 'This isolated fictional specification confirms the exact tablet.'}]}}
        response = self.client.post(f'/api/prescription/consultations/{visit.pk}/patient-context/', history, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        body['expected_context_updated_at'] = response.data['updated_at']
        meta = self.client.get(self.path(visit, 'inputs')).json()
        self.assertTrue(meta['selected_pair_policy']['available'], meta)
        body['clinical']['selected_pair_review'] = {'reviewed': True, 'expected_binding': meta['selected_pair_policy']['binding'],
            'note': 'Isolated fictional doctor inspected the label and exact pair; other safety checks remain required.'}
        return visit, body

    def candidate(self, response, identity='oseltamivir-75mg-capsule'):
        self.assertEqual(response.status_code, 200, response.data)
        return next(row for row in response.data['result']['candidates'] if row['medicine_id'] == identity)

    def test_known_pair_requires_explicit_review_then_only_the_generic_gap_is_resolved(self):
        visit, body = self.fixture()
        not_reviewed = deepcopy(body); not_reviewed['clinical'].pop('selected_pair_review')
        before = self.preview(visit, not_reviewed)
        candidate = self.candidate(before)
        self.assertEqual(candidate['status'], 'unavailable')
        self.assertEqual(next(c for c in candidate['checks'] if c['category'] == 'interaction')['status'], 'cannot_validate')
        after = self.preview(visit, body)
        candidate = self.candidate(after)
        self.assertEqual(candidate['status'], 'candidate_for_clinician_review', candidate)
        self.assertEqual(candidate['regimen']['amount'], '75')
        self.assertEqual(candidate['regimen']['doses_per_day'], 2)
        self.assertEqual(candidate['regimen']['duration_days'], 5)
        para = self.candidate(after, 'paracetamol-500mg-tablet')
        self.assertEqual(para['status'], 'unavailable')
        self.assertTrue(any(c['category'] == 'duplicate_ingredient' and c['status'] == 'blocked' for c in para['checks']))
        self.assertEqual([x['medicine_id'] for x in after.data['result']['candidates'] if x['regimen']], ['oseltamivir-75mg-capsule'])
        self.assertFalse(after.data['result']['model_used'])
        self.assertTrue(after.data['result']['selected_pair_policy']['applied'])
        self.assertEqual(PatientScreeningDraft.objects.count(), 0, 'Preview must not fabricate a saved review')
        saved, _ = self.save(visit, body, after.data)
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['doctor'], self.doctor.pk)
        self.assertEqual(saved.data['snapshot']['clinical']['selected_pair_review'], body['clinical']['selected_pair_review'])
        self.assertEqual(Context.objects.get(patient=self.patient).current_medicines, ['Paracetamol 500mg SOS'])

    def test_incomplete_review_forged_actor_and_stale_bindings_are_rejected(self):
        visit, body = self.fixture()
        for patch_values, expected in [({'note': ''}, 400), ({'reviewed_by': self.other.pk}, 400), ({'expected_binding': '0' * 64}, 409)]:
            changed = deepcopy(body); changed['clinical']['selected_pair_review'].update(patch_values)
            response = self.preview(visit, changed)
            self.assertEqual(response.status_code, expected, response.data)
        self.assertEqual(PatientScreeningDraft.objects.count(), 0)

    def test_pair_review_never_overrides_guideline_unknowns_specific_cautions_or_missing_reviews(self):
        visit, body = self.fixture()
        for changes, category in [({'influenza_guideline': 'WHO_2024'}, 'guideline'), ({'onset_hours': None}, 'onset'),
            ({'onset_hours': '72'}, 'onset'), ({'renal_assessment': 'unknown'}, 'renal'), ({'laiv_timing': 'requires_review'}, 'vaccine_interaction'),
            ({'red_flags': 'present'}, 'red_flags'), ({'care_setting': 'hospital'}, 'clinical_scope')]:
            changed = deepcopy(body); changed['clinical'].update(changes)
            row = self.candidate(self.preview(visit, changed))
            self.assertEqual(row['status'], 'unavailable', row)
            self.assertTrue(any(c['category'] == category and c['blocks_availability'] for c in row['checks']))
            self.assertIsNone(row['regimen'])
        SafetyProfile.objects.filter(pk='oseltamivir-75mg-capsule').update(review_status='pending')
        row = self.candidate(self.preview(visit, body))
        self.assertEqual(row['status'], 'unavailable')
        self.assertTrue(any(c['category'] == 'knowledge_review' and c['blocks_availability'] for c in row['checks']))

    def test_unrecognized_additional_medicines_changed_products_and_real_or_child_contexts_are_not_covered(self):
        visit, body = self.fixture()
        from django.db import transaction
        with transaction.atomic():
            snapshot, _, _ = selected_screening.prepare(visit, self.doctor, body)
        products = {row.pk: row.content for row in MedicineEntry.objects.all()}
        self.assertTrue(pair_scope(snapshot, products)['available'])
        for patch_values in ({'is_demo': False}, {'patient': {**snapshot['patient'], 'age_years': 17}},
                {'context': {**snapshot['context'], 'current_medicines': ['Unknown product']}},
                {'context': {**snapshot['context'], 'current_medicines': snapshot['context']['current_medicines'] + ['Another product']}}):
            self.assertFalse(pair_scope({**snapshot, **patch_values}, products)['available'])
        changed = deepcopy(products); changed['paracetamol-500mg-tablet']['strength'] = '650 mg'
        self.assertFalse(pair_scope(snapshot, changed)['available'])
        snapshot['context']['provenance'].pop('history_identity')
        self.assertFalse(pair_scope(snapshot, products)['available'], 'Raw ingredient matching cannot establish exact product coverage')

    def test_saved_pair_implementation_is_freshness_bound(self):
        visit, body = self.fixture()
        saved, _ = self.save(visit, body)
        self.assertEqual(saved.status_code, 201, saved.data)
        row = PatientScreeningDraft.objects.get(pk=saved.data['id'])
        self.assertTrue(selected_screening.freshness(row, self.doctor)['is_current'])
        with patch('medicine_knowledge.selected_screening.implementation_binding', return_value={'version': 'changed', 'hash': '0' * 64}):
            self.assertFalse(selected_screening.freshness(row, self.doctor)['is_current'])

    def test_available_pair_flows_through_frozen_rf_independent_doctor_approval_and_sample_slip(self):
        visit, body = self.fixture()
        saved, _ = self.save(visit, body)
        self.assertEqual(saved.status_code, 201, saved.data)
        with patch('sklearn.ensemble.RandomForestClassifier.fit', side_effect=AssertionError('No training in API')):
            response = self.client.post(f'/api/prescription/consultations/{visit.pk}/medicine-proposals/',
                {'draft_id': saved.data['id'], 'request_key': str(uuid4()), 'synthetic_demo': True}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        proposal = response.json()
        prediction = next(row for row in proposal['result']['ml']['predictions'] if row['medicine_id'] == 'oseltamivir-75mg-capsule')
        self.assertEqual(prediction['rule_predictions']['interaction']['predicted'], None)
        self.assertEqual(prediction['rule_predictions']['interaction']['reason'], 'selected_pair_extension_not_in_frozen_training_scope')
        self.assertFalse(prediction['suggested'], 'New evidence cannot masquerade as trained RF safety coverage')
        self.assertNotIn('paracetamol-500mg-tablet', proposal['result']['default_ids'])
        decision = {'request_key': str(uuid4()), 'expected_revision': 0, 'expected_proposal_hash': proposal['proposal_hash'],
            'action': 'approved', 'selected_ids': ['oseltamivir-75mg-capsule'], 'reviewed': True, 'combination_reviewed': False,
            'reason': 'Independent fictional doctor selection after reviewing source-based screening and RF limits.'}
        response = self.client.post(f"/api/prescription/medicine-proposals/{proposal['id']}/decisions/", decision, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        slip = self.client.get(f"/api/prescription/prescription-slips/{response.data['decision']['id']}/")
        self.assertEqual(slip.status_code, 200, slip.data)
        self.assertEqual([row['medicine_id'] for row in slip.data['medicines']], ['oseltamivir-75mg-capsule'])
        self.assertFalse(slip.data['valid_for_dispensing']); self.assertFalse(slip.data['published'])
