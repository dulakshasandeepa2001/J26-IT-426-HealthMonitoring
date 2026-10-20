"""Real API transitions using fictional visits in the in-memory test database."""
from copy import deepcopy
from uuid import uuid4
from unittest.mock import patch
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from medicine_knowledge import test_patient_screening as fixtures
from medicine_knowledge.models import PatientScreeningDraft
from prescription_context.models import PrescriptionContextPatientcontext as Context
from .models import MedicineProposal, DoctorDecision


@override_settings(PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=True)
class DoctorReviewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        fixtures.PatientScreeningTests.setUpTestData()

    def setUp(self):
        self.fixture = fixtures.PatientScreeningTests(methodName='test_preview_has_no_database_writes_training_or_publication')
        self.fixture.setUp()
        self.client = self.fixture.client
        self.doctor, self.patient = self.fixture.doctor, self.fixture.patient

    def proposal(self, condition='influenza'):
        visit, body = self.fixture.case(condition)
        response, _ = self.fixture.save(visit, body)
        self.assertEqual(response.status_code, 201, response.data)
        data = {'draft_id': response.data['id'], 'request_key': str(uuid4()), 'synthetic_demo': True}
        path = f'/api/prescription/consultations/{visit.pk}/medicine-proposals/'
        response = self.client.post(path, data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return visit, response.json(), (path, data)

    def decision(self, proposal, action='approved', ids=None, **changes):
        data = {'request_key': str(uuid4()), 'expected_revision': proposal['decisions'][0]['revision'] if proposal['decisions'] else 0,
            'expected_proposal_hash': proposal['proposal_hash'], 'action': action,
            'selected_ids': ids if ids is not None else ['paracetamol-500mg-tablet'],
            'reason': 'Fictional doctor independently reviewed this demo selection.', 'reviewed': True, 'combination_reviewed': False}
        data.update(changes)
        path = f"/api/prescription/medicine-proposals/{proposal['id']}/decisions/"
        return self.client.post(path, data, format='json'), (path, data)

    def test_saved_model_inference_has_no_teacher_leakage_training_or_research_writes(self):
        with patch('sklearn.ensemble.RandomForestClassifier.fit', side_effect=AssertionError('No fitting in API')):
            visit, proposal, request = self.proposal()
        ml = proposal['result']['ml']
        self.assertEqual(ml['algorithm'], 'random_forest')
        self.assertEqual(len(ml['supporting_models']), 2)
        self.assertEqual(ml['clinical_review_status'], 'not_reviewed')
        self.assertFalse(ml['medical_confidence_calibrated'])
        predictions = {row['medicine_id']: row for row in ml['predictions']}
        self.assertEqual(predictions['oseltamivir-75mg-capsule']['features']['fever_present'], True)
        from .inference import infer
        draft = PatientScreeningDraft.objects.get(pk=proposal['draft_id'])
        draft.snapshot['clinical']['verified_symptoms'] = ['fever', 'body_aches']
        partial = infer(draft)
        self.assertIsNone(partial['predictions'][0]['features']['jaw_pain_present'])
        for candidate in draft.result['candidates']:
            if candidate['medicine_id'] == 'oseltamivir-75mg-capsule':
                candidate['product']['strength'] = 'unsupported strength'
        changed = next(row for row in infer(draft)['predictions'] if row['medicine_id'] == 'oseltamivir-75mg-capsule')
        self.assertEqual(changed['reason'], 'outside_frozen_model_product_coverage')
        self.assertNotIn('allergies', predictions['oseltamivir-75mg-capsule']['features'])
        self.assertNotIn('relevance_target', str(predictions))
        for identity in proposal['result']['default_ids']:
            self.assertTrue(predictions[identity]['suggested'])
            self.assertFalse(predictions[identity]['rule_disagreements_or_abstentions'])
        self.assertEqual(predictions['baloxavir-reference']['status'], 'withheld')
        self.assertFalse(DoctorDecision.objects.exists())
        retry = self.client.post(*request, format='json')
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(MedicineProposal.objects.count(), 1)

    def test_edit_then_approve_yields_only_the_approved_selection_and_immutable_audit(self):
        visit, proposal, _ = self.proposal()
        edited, _ = self.decision(proposal, 'edited')
        self.assertEqual(edited.status_code, 201, edited.data)
        edit_id = edited.data['decision']['id']
        self.assertEqual(self.client.get(f'/api/prescription/prescription-slips/{edit_id}/').status_code, 403)
        approved, request = self.decision(edited.data['proposal'])
        self.assertEqual(approved.status_code, 201, approved.data)
        approval_id = approved.data['decision']['id']
        slip = self.client.get(f'/api/prescription/prescription-slips/{approval_id}/')
        self.assertEqual(slip.status_code, 200, slip.data)
        self.assertEqual([row['medicine_id'] for row in slip.data['medicines']], ['paracetamol-500mg-tablet'])
        self.assertEqual(slip.data['print_size'], 'A6')
        self.assertFalse(slip.data['valid_for_dispensing'])
        self.assertFalse(slip.data['published'])
        self.assertFalse(slip.data['doctor']['credentials_verified'])
        self.assertEqual(slip.data['doctor']['id'], self.doctor.pk)
        self.assertEqual(self.client.post(*request, format='json').status_code, 200)
        self.assertEqual(DoctorDecision.objects.count(), 2)
        conflict, _ = self.decision(approved.data['proposal'], 'rejected', [])
        self.assertEqual(conflict.status_code, 409)
        history = self.client.get('/api/prescription/doctor-decisions/')
        self.assertEqual(history.status_code, 200)
        self.assertEqual([row['action'] for row in history.data], ['approved', 'edited'])

    def test_rejection_has_no_prescription_and_empty_approval_is_rejected(self):
        _, proposal, _ = self.proposal()
        empty, _ = self.decision(proposal, ids=[])
        self.assertEqual(empty.status_code, 400)
        rejected, _ = self.decision(proposal, 'rejected', [])
        self.assertEqual(rejected.status_code, 201)
        self.assertEqual(self.client.get(f"/api/prescription/prescription-slips/{rejected.data['decision']['id']}/").status_code, 403)

    def test_blocked_products_custom_doses_forged_actors_and_stale_revisions_cannot_be_approved(self):
        _, proposal, _ = self.proposal()
        for changes, ids in [({}, ['baloxavir-reference']), ({'dose': '9999 mg'}, ['paracetamol-500mg-tablet']),
            ({'doctor': self.fixture.other.pk}, ['paracetamol-500mg-tablet']), ({'reviewed': False}, ['paracetamol-500mg-tablet'])]:
            response, _ = self.decision(proposal, ids=ids, **changes)
            self.assertEqual(response.status_code, 400, response.data)
        response, _ = self.decision(proposal, expected_revision=100)
        self.assertEqual(response.status_code, 409)
        response, _ = self.decision(proposal, ids=['oseltamivir-75mg-capsule', 'paracetamol-500mg-tablet'])
        self.assertEqual(response.status_code, 400, 'Multiple medicines require an explicit combination review')
        self.assertFalse(DoctorDecision.objects.exists())

    def test_history_or_new_proposal_changes_invalidate_approval_and_print_access(self):
        visit, proposal, request = self.proposal()
        approved, _ = self.decision(proposal)
        self.assertEqual(approved.status_code, 201)
        slip_path = f"/api/prescription/prescription-slips/{approved.data['decision']['id']}/"
        new_request = dict(request[1], request_key=str(uuid4()))
        self.assertEqual(self.client.post(request[0], new_request, format='json').status_code, 201)
        self.assertEqual(self.client.get(slip_path).status_code, 409)
        latest = self.client.get(request[0]).json()[0]
        context = Context.objects.get(patient=self.patient); context.save()
        changed, _ = self.decision(latest)
        self.assertEqual(changed.status_code, 409)
        self.assertEqual(DoctorDecision.objects.count(), 1)

    def test_fail_closed_for_other_doctors_disabled_flag_non_demo_and_changed_model(self):
        visit, proposal, request = self.proposal()
        other = APIClient(); other.force_login(self.fixture.other)
        self.assertEqual(other.get(request[0]).status_code, 404)
        response = other.post(f"/api/prescription/medicine-proposals/{proposal['id']}/decisions/", {
            'action': 'rejected', 'selected_ids': [], 'request_key': str(uuid4()), 'expected_revision': 0,
            'expected_proposal_hash': proposal['proposal_hash'], 'reason': 'A different doctor must not decide this.', 'reviewed': True}, format='json')
        self.assertEqual(response.status_code, 404)
        with self.settings(PRESCRIPTION_EXPERIMENTAL_ML_ENABLED=False):
            self.assertEqual(self.client.get(request[0]).status_code, 403)
        visit.is_demo = False; visit.save()
        self.assertEqual(self.client.get(request[0]).status_code, 403)
        visit.is_demo = True; visit.save()
        with patch('prescription_review.rf_inference.model_identity', side_effect=ValueError('Changed artifact')):
            response, _ = self.decision(proposal)
            self.assertEqual(response.status_code, 409)

    def test_one_alternative_per_purpose_and_ml_abstains_for_untrained_ibuprofen(self):
        _, proposal, _ = self.proposal('mumps')
        ibuprofen = next(row for row in proposal['result']['ml']['predictions'] if row['medicine_id'] == 'ibuprofen-200mg-tablet')
        self.assertEqual(ibuprofen['status'], 'abstained')
        self.assertIsNone(ibuprofen['label'])
        response, _ = self.decision(proposal, ids=['ibuprofen-200mg-tablet', 'paracetamol-500mg-tablet'], combination_reviewed=True)
        self.assertEqual(response.status_code, 400)

    def test_no_available_candidates_cannot_produce_an_approved_slip(self):
        _, proposal, _ = self.proposal('viral_gastroenteritis')
        self.assertFalse(proposal['result']['default_ids'])
        response, _ = self.decision(proposal, ids=['ors-low-osmolarity-powder'])
        self.assertEqual(response.status_code, 400)

    def test_decision_writes_require_csrf_and_revoked_access_cannot_read_a_slip(self):
        _, proposal, request = self.proposal()
        csrf = APIClient(enforce_csrf_checks=True); csrf.force_login(self.doctor)
        self.assertEqual(csrf.post(request[0], request[1], format='json').status_code, 403)
        approved, _ = self.decision(proposal)
        self.assertEqual(approved.status_code, 201)
        type(self.doctor).objects.filter(pk=self.doctor.pk).update(is_approved=False)
        self.assertEqual(self.client.get(f"/api/prescription/prescription-slips/{approved.data['decision']['id']}/").status_code, 403)

    def test_registered_name_change_cannot_leave_an_approved_slip_with_wrong_identity(self):
        _, proposal, _ = self.proposal()
        approved, _ = self.decision(proposal)
        self.assertEqual(approved.status_code, 201)
        type(self.patient).objects.filter(pk=self.patient.pk).update(first_name='Corrected fictional name')
        response = self.client.get(f"/api/prescription/prescription-slips/{approved.data['decision']['id']}/")
        self.assertEqual(response.status_code, 409)

    def test_rf_inputs_keep_unlisted_symptoms_unknown_and_do_not_mutate_snapshot(self):
        from .rf_inference import adapt_features, infer
        _, proposal, _ = self.proposal()
        draft = PatientScreeningDraft.objects.get(pk=proposal['draft_id'])
        draft.snapshot['clinical']['verified_symptoms'] = ['fever', 'body_aches']
        before = deepcopy(draft.snapshot)
        candidate = next(row for row in draft.result['candidates'] if row['medicine_id'] == 'paracetamol-500mg-tablet')
        values = adapt_features(draft.snapshot, candidate, 'dose')
        self.assertEqual(values['symptom_fever'], 'True')
        self.assertEqual(values['symptom_jaw_pain'], '__unknown__')
        self.assertEqual(values['symptom_itching'], '__unknown__')
        for forbidden in ('targets', 'teacher_score', 'teacher_checks', 'allergy_match', 'clinical_review_status', 'scenario_id'):
            self.assertNotIn(forbidden, values)
        infer(draft)
        self.assertEqual(draft.snapshot, before)
        draft.snapshot['is_demo'] = False
        with self.assertRaisesRegex(ValueError, 'synthetic'):
            infer(draft)

    def test_blocking_screening_is_never_overridden_by_permissive_rf_predictions(self):
        from .rf_inference import infer
        _, proposal, _ = self.proposal()
        draft = PatientScreeningDraft.objects.get(pk=proposal['draft_id'])
        for candidate in draft.result['candidates']:
            candidate['status'] = 'unavailable'
        with patch('prescription_review.rf_inference.predict_features', return_value={
            'predicted': 'provisional_relevance', 'status': 'experimental_prediction', 'reason': 'test_permissive', 'unseen_features': []}):
            result = infer(draft)
        self.assertTrue(all(not r['suggested'] and r['status'] == 'withheld' and not r['ml_can_override_rules'] for r in result['predictions']))

    def test_rf_disagreement_withholds_automatic_selection_but_keeps_deterministic_candidates(self):
        from .rf_inference import infer
        _, proposal, _ = self.proposal()
        draft = PatientScreeningDraft.objects.get(pk=proposal['draft_id'])
        original = deepcopy(draft.result)
        with patch('prescription_review.rf_inference.predict_features', return_value={
            'predicted': 'provisional_relevance', 'status': 'experimental_prediction', 'reason': 'test_disagreement', 'unseen_features': []}):
            result = infer(draft)
        self.assertTrue(all(not r['suggested'] for r in result['predictions']))
        self.assertEqual(draft.result, original)

    def test_frozen_rf_tampering_is_checked_even_when_model_is_cached(self):
        from pathlib import Path
        from .rf_inference import model_identity, toy_data
        model_identity()
        original = toy_data.digest
        def altered(path):
            return 'changed' if Path(path).name == 'models.joblib' else original(path)
        with patch('prescription_review.rf_inference.toy_data.digest', side_effect=altered):
            with self.assertRaisesRegex(ValueError, 'integrity'):
                model_identity()
