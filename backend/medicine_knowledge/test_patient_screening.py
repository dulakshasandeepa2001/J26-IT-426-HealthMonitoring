"""End-to-end six-condition patient support, entirely in the in-memory test DB."""
from copy import deepcopy
from io import StringIO
from uuid import uuid4
from unittest.mock import patch
from django.core.management import call_command
from django.db import OperationalError, connection
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient
from accounts.models import User
from prescription_context.models import PrescriptionContextConsultation as Consultation, PrescriptionContextPatientcontext as Context, PrescriptionContextConsultationanalysis as Analysis
from prescription_context.member1_v21 import HANDOFF_CONDITIONS, BOOLEAN_OBSERVATIONS
from prescription_drafts.models import PrescriptionDraft, SafetyProfile
from prescription_drafts.profiles import seed_profiles, engine_digest
from .models import MedicineEntry, ConditionKnowledge, ConditionKnowledgeReview, PatientScreeningDraft
from .services import seed_catalogue


class PatientScreeningTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.doctor = User.objects.create_user(username='screen-doctor', role='doctor', is_approved=True)
        cls.other = User.objects.create_user(username='screen-other', role='doctor', is_approved=True)
        cls.patient = User.objects.create_user(username='screen-patient', role='patient', is_approved=True, birthday='1990-01-01')
        seed_catalogue(); seed_profiles()
        call_command('seed_six_condition_knowledge', stdout=StringIO())
        # Actual review endpoints under a test-only doctor session; no live review is written.
        client = APIClient(); client.force_login(cls.doctor)
        for obj, path in [(row, f'/api/prescription/medicines/{row.pk}/review/') for row in MedicineEntry.objects.all()] + [(row, f'/api/prescription/safety-profiles/{row.pk}/review/') for row in SafetyProfile.objects.all()]:
            result = client.post(path, {'decision': 'reviewed', 'notes': 'Inspected the referenced source and exact product/rule scope.', 'evidence_checked': True,
                'expected_content_hash': obj.content_hash, 'expected_updated_at': obj.updated_at.isoformat()}, format='json')
            assert result.status_code == 200, result.data
        for row in ConditionKnowledge.objects.all():
            for kind in ('content', 'safety'):
                if kind == 'safety' and not row.rules['patient_screening_supported']:
                    continue
                row.refresh_from_db()
                result = client.post(f'/api/prescription/condition-knowledge/{row.pk}/review/{kind}/', {'decision': 'reviewed',
                    'notes': 'Inspected the source, patient-screening adapter and exact condition-specific scope.', 'evidence_checked': True,
                    'expected_content_hash': row.content_hash if kind == 'content' else row.rules_hash, 'expected_updated_at': row.updated_at.isoformat()}, format='json')
                assert result.status_code == 200, result.data

    def setUp(self):
        self.client = APIClient(); self.client.force_login(self.doctor)

    @staticmethod
    def path(visit, action):
        return f'/api/prescription/consultations/{visit.pk}/clinical-screening/{action}/'

    def case(self, condition='mumps', real=False):
        visit = Consultation.objects.create(doctor=self.doctor, patient=self.patient, is_demo=not real, reason='Isolated test')
        if real:
            from prescription_context.analysis_ingestion import demo_payload
            service = User.objects.create_user(username='test-service-' + str(uuid4()), role='admin', is_approved=True)
            wire = demo_payload(visit, 'member1_v21_' + condition)
            wire.update(source='component_1', is_demo=False, model_version='isolated-producer-v21')
            with override_settings(COMPONENT1_API_KEY='isolated-receiver-key-over-32-characters', COMPONENT1_SERVICE_USER_ID=service.pk):
                analysis = APIClient().post('/api/prescription/component-1/results/', wire, format='json', HTTP_X_COMPONENT1_KEY='isolated-receiver-key-over-32-characters')
        else:
            analysis = self.client.post(f'/api/prescription/consultations/{visit.pk}/demo-analysis/', {'scenario': 'member1_v21_' + condition}, format='json')
        self.assertEqual(analysis.status_code, 201, analysis.data)
        diagnosis = self.client.post('/api/prescription/diagnoses/', {'consultation': str(visit.pk), 'condition_code': condition,
            'condition_label': condition, 'analysis_reference': analysis.data['analysis_reference']}, format='json')
        self.assertEqual(diagnosis.status_code, 201, diagnosis.data)
        context = Context.objects.filter(patient=self.patient).first()
        history = self.client.post(f'/api/prescription/consultations/{visit.pk}/patient-context/', {'allergy_status': 'none', 'allergies': [],
            'medicine_status': 'none', 'current_medicines': [], 'reviewed': True, 'expected_updated_at': context.updated_at.isoformat() if context else None}, format='json')
        self.assertEqual(history.status_code, 200, history.data)
        meta = self.client.get(self.path(visit, 'inputs')).json()
        clinical = meta['clinical_template']
        clinical.update(reviewed=True, care_setting='outpatient', condition_severity='mild', influenza_guideline='CDC_2026',
            red_flags='none', renal_assessment='standard', hepatic_assessment='standard', special_population='standard',
            varicella_risk='risk_group_confirmed', laiv_timing='no_conflict', onset_hours='12.0', weight_kg=None,
            symptoms_reviewed=True, verified_symptoms=['fever', 'body_aches', 'itching', 'jaw_pain', 'ocular_dryness', 'ocular_irritation', 'diarrhoea'],
            symptom_durations={name: '12.0' for name in ['fever', 'body_aches', 'itching', 'jaw_pain', 'ocular_dryness', 'ocular_irritation', 'diarrhoea']},
            condition_assessments={key: False for key in BOOLEAN_OBSERVATIONS}, topical_assessment='standard',
            ophthalmic_integrity='acceptable', excipient_assessment='acceptable', dehydration_assessment='none', oral_fluid_tolerance='tolerated',
            nsaid_assessment='standard', gi_bleeding_assessment='none', cardiovascular_assessment='standard')
        return visit, {'diagnosis_id': diagnosis.data['id'], 'expected_context_updated_at': meta['expected_context_updated_at'],
                       'expected_analysis_hash': meta['expected_analysis_hash'], 'clinical': clinical}

    def preview(self, visit, body):
        return self.client.post(self.path(visit, 'preview'), body, format='json')

    def save(self, visit, body, plan=None, **changes):
        plan = plan or self.preview(visit, body).json()
        request = dict(body, request_key=str(uuid4()), expected_latest_revision=plan['expected_latest_revision'], expected_plan_hash=plan['plan_hash'])
        request.update(changes)
        return self.client.post(self.path(visit, 'drafts'), request, format='json'), request

    def test_all_six_conditions_have_real_authorized_preview_and_immutable_draft_path(self):
        counts = {'influenza': 5, 'chickenpox': 4, 'measles': 2, 'mumps': 2, 'viral_conjunctivitis': 2, 'viral_gastroenteritis': 4}
        for condition in HANDOFF_CONDITIONS:
            with self.subTest(condition=condition):
                visit, body = self.case(condition)
                response = self.preview(visit, body)
                self.assertEqual(response.status_code, 200, response.data)
                result = response.data['result']
                self.assertEqual(len(result['candidates']), counts[condition])
                self.assertFalse(result['model_used']); self.assertFalse(result['approved']); self.assertFalse(result['published'])
                self.assertFalse(result['prescription_eligible'])
                if condition == 'viral_gastroenteritis':
                    self.assertTrue(all(row['regimen'] is None for row in result['candidates']))
                    ors = next(row for row in result['candidates'] if row['medicine_id'] == 'ors-low-osmolarity-powder')
                    self.assertTrue(any(c['category'] == 'product_identity' and c['status'] == 'blocked' for c in ors['checks']))
                else:
                    self.assertTrue(any(row['status'] == 'candidate_for_clinician_review' for row in result['candidates']), result)
                saved, _ = self.save(visit, body, response.data)
                self.assertEqual(saved.status_code, 201, saved.data)
                self.assertTrue(saved.data['current_state']['is_current'])
        self.assertEqual(PatientScreeningDraft.objects.count(), 6)
        self.assertEqual(PrescriptionDraft.objects.count(), 0)

    def test_current_medicine_proposals_never_clear_duplicate_or_interaction_findings(self):
        visit, body = self.case('influenza')
        from prescription_context.history_identity import options
        product = next(row for row in options()['products'] if row['id'] == 'paracetamol-500mg-tablet')
        context = Context.objects.get(patient=self.patient)
        history = {'allergy_status': 'confirmed', 'allergies': ['Penicillin (Rash)'],
            'medicine_status': 'confirmed', 'current_medicines': ['Paracetamol 500mg SOS'],
            'reviewed': True, 'expected_updated_at': context.updated_at.isoformat(),
            'history_details': {'allergies': [{'recorded_text': 'Penicillin (Rash)', 'identity': 'penicillin',
                'reaction': 'Rash', 'reaction_date': None, 'clarification_note': ''}],
                'medicines': [{'recorded_text': 'Paracetamol 500mg SOS', 'catalogue_id': product['id'],
                    'expected_identity_hash': product['identity_hash'], 'schedule': 'SOS',
                    'clarification_note': 'Isolated fictional fixture specifies this exact tablet.'}]}}
        previous = None
        for action in ('undecided', 'continue', 'change', 'stop'):
            history['medicine_plans'] = [{'recorded_text': 'Paracetamol 500mg SOS', 'action': action,
                'note': 'Fictional management proposal; no treatment change applied.'}]
            response = self.client.post(f'/api/prescription/consultations/{visit.pk}/patient-context/', history, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            history['expected_updated_at'] = response.data['updated_at']
            body['expected_context_updated_at'] = response.data['updated_at']
            preview = self.preview(visit, body)
            self.assertEqual(preview.status_code, 200, preview.data)
            outcomes = {row['medicine_id']: [(check['category'], check['status'], check['blocks_availability'], check['message'])
                for check in row['checks']] for row in preview.data['result']['candidates']}
            if previous is not None:
                self.assertEqual(outcomes, previous, 'A management note cannot alter deterministic findings')
            previous = outcomes
            paracetamol = next(row for row in preview.data['result']['candidates'] if row['medicine_id'] == product['id'])
            self.assertEqual(paracetamol['status'], 'unavailable')
            self.assertTrue(any(check['category'] == 'duplicate_ingredient' and check['status'] == 'blocked' for check in paracetamol['checks']))
            self.assertFalse(preview.data['result']['model_used'])
        context.refresh_from_db()
        self.assertEqual(context.current_medicines, ['Paracetamol 500mg SOS'])
        self.assertEqual(PatientScreeningDraft.objects.count(), 0)

    def test_preview_database_lock_timeout_is_retryable_without_partial_candidates(self):
        visit, body = self.case('influenza')
        cause = Exception('Private database details must not reach the browser')
        cause.pgcode = '55P03'
        error = OperationalError('Internal database lock details')
        error.__cause__ = cause
        with patch('medicine_knowledge.screening_views.preview', side_effect=error):
            response = self.preview(visit, body)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response['Retry-After'], '3')
        self.assertIn('temporarily busy', str(response.data))
        self.assertNotIn('Private', str(response.data))
        self.assertNotIn('result', response.data)
        self.assertEqual(PatientScreeningDraft.objects.count(), 0)
        self.assertEqual(self.preview(visit, body).status_code, 200)

    def test_database_disconnect_returns_safe_retry_message(self):
        visit, body = self.case()
        with patch('medicine_knowledge.screening_views.preview', side_effect=OperationalError('Private connection details')):
            response = self.preview(visit, body)
        self.assertEqual(response.status_code, 503)
        self.assertIn('connection is temporarily unavailable', str(response.data))
        self.assertNotIn('Private', str(response.data))
        self.assertEqual(PatientScreeningDraft.objects.count(), 0)

    def test_database_failure_after_save_rolls_back_and_same_request_can_retry(self):
        from .selected_screening import save as actual_save
        visit, body = self.case()
        plan = self.preview(visit, body).data
        cause = Exception('Statement timeout')
        cause.pgcode = '57014'
        error = OperationalError('Internal timeout details')
        error.__cause__ = cause

        def interrupted_save(*args):
            actual_save(*args)
            raise error

        with patch('medicine_knowledge.screening_views.save', side_effect=interrupted_save):
            response, request = self.save(visit, body, plan)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(PatientScreeningDraft.objects.count(), 0)
        response = self.client.post(self.path(visit, 'drafts'), request, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(PatientScreeningDraft.objects.count(), 1)

    def test_mumps_and_eye_alternatives_are_grouped_without_automatic_combination_or_ranking(self):
        for condition in ('mumps', 'viral_conjunctivitis'):
            visit, body = self.case(condition)
            result = self.preview(visit, body).json()['result']
            group = result['purpose_groups'][0]
            self.assertEqual(len(group['candidate_ids']), 2)
            self.assertEqual(group['selection'], 'clinician_choice_required')
            self.assertNotIn('rank', str(result.keys()))

    def test_authenticated_real_member1_handoff_uses_private_clinical_path_not_research_dataset(self):
        visit, body = self.case('mumps', real=True)
        result = self.preview(visit, body)
        self.assertEqual(result.status_code, 200, result.data)
        saved, _ = self.save(visit, body, result.data)
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertFalse(saved.data['snapshot']['is_demo'])
        self.assertFalse(saved.data['result']['model_used'])
        self.assertFalse(saved.data['result']['published'])

    def resolve_history(self, visit, body, *, allergy='penicillin', medicine=False):
        options = self.client.get('/api/prescription/consultations/' + str(visit.pk) + '/history-identities/').json()
        product = next(row for row in options['products'] if row['id'] == 'paracetamol-500mg-tablet')
        raw_allergy = 'Penicillin (Rash)' if allergy == 'penicillin' else 'Paracetamol (Rash)'
        details = {'allergies': [{'recorded_text': raw_allergy, 'identity': allergy, 'reaction': 'Rash', 'reaction_date': None, 'clarification_note': ''}],
            'medicines': [{'recorded_text': 'Paracetamol 500mg SOS', 'catalogue_id': product['id'], 'expected_identity_hash': product['identity_hash'], 'schedule': 'SOS', 'clarification_note': 'Patient confirmed exact tablet and strength.'}] if medicine else []}
        request = {'allergy_status': 'confirmed', 'allergies': [raw_allergy], 'medicine_status': 'confirmed' if medicine else 'none',
            'current_medicines': ['Paracetamol 500mg SOS'] if medicine else [], 'reviewed': True,
            'expected_updated_at': body['expected_context_updated_at'], 'history_details': details}
        response = self.client.post('/api/prescription/consultations/' + str(visit.pk) + '/patient-context/', request, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        body['expected_context_updated_at'] = response.data['updated_at']
        return request

    def test_structured_penicillin_identity_allows_limited_candidates_without_deleting_allergy(self):
        visit, body = self.case('influenza')
        self.resolve_history(visit, body)
        result = self.preview(visit, body)
        self.assertEqual(result.status_code, 200, result.data)
        available = {row['medicine_id'] for row in result.data['result']['candidates'] if row['status'] == 'candidate_for_clinician_review'}
        self.assertIn('paracetamol-500mg-tablet', available)
        self.assertIn('oseltamivir-75mg-capsule', available)
        self.assertEqual(Context.objects.get(patient=self.patient).allergies, ['Penicillin (Rash)'])
        saved, _ = self.save(visit, body, result.data)
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertIn('history_identity', saved.data['snapshot']['context']['provenance'])

    def test_structured_identity_preserves_allergy_duplicate_and_interaction_obstacles(self):
        visit, body = self.case('influenza')
        self.resolve_history(visit, body, allergy='paracetamol', medicine=True)
        result = self.preview(visit, body).json()['result']
        paracetamol = next(row for row in result['candidates'] if row['medicine_id'] == 'paracetamol-500mg-tablet')
        self.assertEqual(paracetamol['status'], 'unavailable')
        checks = {row['category']: row['status'] for row in paracetamol['checks']}
        self.assertEqual(checks['allergy'], 'blocked')
        self.assertEqual(checks['duplicate_ingredient'], 'blocked')
        self.assertNotEqual(checks['interaction'], 'passed')
        oseltamivir = next(row for row in result['candidates'] if row['medicine_id'] == 'oseltamivir-75mg-capsule')
        self.assertEqual(next(row for row in oseltamivir['checks'] if row['category'] == 'allergy')['status'], 'passed')
        self.assertEqual(oseltamivir['status'], 'unavailable', 'Identity recognition is not comprehensive interaction clearance')

    def test_visit_history_verification_and_severe_source_findings_cannot_be_bypassed(self):
        visit, body = self.case()
        context = Context.objects.get(patient=self.patient)
        context.provenance['last_reviewed_consultation'] = str(uuid4()); context.save()
        body['expected_context_updated_at'] = context.updated_at.isoformat()
        self.assertEqual(self.preview(visit, body).status_code, 400)
        context.provenance['last_reviewed_consultation'] = str(visit.pk); context.save()
        body['expected_context_updated_at'] = context.updated_at.isoformat()
        analysis = Analysis.objects.get(consultation=visit)
        analysis.payload['severity']['red_flags'] = ['Reported clinical concern']
        analysis.save(update_fields=['payload'])
        body['expected_analysis_hash'] = self.client.get(self.path(visit, 'inputs')).json()['expected_analysis_hash']
        rows = self.preview(visit, body).json()['result']['candidates']
        self.assertTrue(all(row['regimen'] is None for row in rows))

    def test_new_product_regimens_keep_label_units_limits_and_no_invented_rxnorm(self):
        visit, body = self.case('mumps')
        ibuprofen = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'].startswith('ibuprofen'))
        self.assertEqual(ibuprofen['regimen']['amount'], '200')
        self.assertEqual(ibuprofen['regimen']['max_daily_amount_mg'], 1200)
        visit, body = self.case('viral_conjunctivitis')
        hypromellose = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'].startswith('hypromellose'))
        self.assertEqual(hypromellose['regimen']['unit'], 'drop')
        self.assertIsNone(hypromellose['regimen']['duration_days'])
        self.assertIsNone(hypromellose['product']['standard_concept'])

    def test_inputs_do_not_promote_json_observations_to_verified_facts(self):
        visit, _ = self.case('mumps')
        result = self.client.get(self.path(visit, 'inputs')).json()
        self.assertFalse(result['clinical_template']['reviewed'])
        self.assertIsNone(result['clinical_template']['onset_hours'])
        self.assertTrue(all(v is None for v in result['clinical_template']['condition_assessments'].values()))
        self.assertFalse(result['source_observations_verified'])

    def test_registered_age_missing_and_child_scope_never_use_json_or_request_age(self):
        visit, body = self.case('mumps')
        for birthday in (None, '2020-01-01', '2099-01-01'):
            self.patient.birthday = birthday; self.patient.save(update_fields=['birthday'])
            result = self.preview(visit, body).json()['result']
            self.assertTrue(all(row['regimen'] is None for row in result['candidates']))
        forged = deepcopy(body); forged['clinical']['age_years'] = 42
        self.assertEqual(self.preview(visit, forged).status_code, 400)

    def test_unknown_independent_assessment_blocks_even_if_source_says_no(self):
        visit, body = self.case('viral_conjunctivitis')
        body['clinical']['condition_assessments']['eye_pain'] = None
        rows = self.preview(visit, body).json()['result']['candidates']
        self.assertTrue(all(row['regimen'] is None for row in rows))
        self.assertTrue(any(c['category'] == 'condition_scope:eye_pain' for c in rows[0]['checks']))

    def test_source_positive_concern_cannot_be_cleared_by_a_negative_checkbox(self):
        visit, body = self.case('mumps')
        analysis = Analysis.objects.get(consultation=visit)
        analysis.payload['member1']['reported_assessments']['testicular_pain_or_swelling'] = True
        analysis.save(update_fields=['payload'])
        body['expected_analysis_hash'] = self.client.get(self.path(visit, 'inputs')).json()['expected_analysis_hash']
        rows = self.preview(visit, body).json()['result']['candidates']
        self.assertTrue(all(row['regimen'] is None for row in rows))

    def test_unknown_or_duplicate_current_medicines_and_allergies_stay_blocking(self):
        visit, body = self.case('mumps')
        for field, status, values in (('current_medicines', 'confirmed', ['Unresolved medicine']), ('current_medicines', 'confirmed', ['ibuprofen']), ('allergies', 'confirmed', ['ibuprofen (Rash)']), ('allergies', 'unknown', [])):
            context = Context.objects.get(patient=self.patient)
            context.allergy_status = 'none'; context.allergies = []; context.medicine_status = 'none'; context.current_medicines = []
            setattr(context, field, values); setattr(context, 'allergy_status' if field == 'allergies' else 'medicine_status', status); context.save()
            body['expected_context_updated_at'] = context.updated_at.isoformat()
            rows = self.preview(visit, body).json()['result']['candidates']
            ibuprofen = next(r for r in rows if r['medicine_id'].startswith('ibuprofen'))
            self.assertIsNone(ibuprofen['regimen'])

    def test_unreviewed_scope_is_excluded_without_changing_the_underlying_pilot_review(self):
        visit, body = self.case('mumps')
        scope = ConditionKnowledge.objects.get(pk='mumps-ibuprofen')
        scope.reviews.filter(kind='safety').delete()  # Only isolated fixture state.
        result = self.preview(visit, body).json()['result']
        row = next(r for r in result['candidates'] if r['medicine_id'].startswith('ibuprofen'))
        self.assertIsNone(row['regimen'])
        self.assertTrue(MedicineEntry.objects.get(pk='paracetamol-500mg-tablet').review_is_current)

    def test_influenza_guideline_difference_is_explicit_and_never_resolved_by_ml(self):
        visit, body = self.case('influenza')
        for guideline in ('unselected', 'WHO_2024'):
            body['clinical']['influenza_guideline'] = guideline
            row = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'].startswith('oseltamivir'))
            self.assertIsNone(row['regimen'])
            self.assertTrue(any(c['category'] == 'guideline' for c in row['checks']))

    def test_hours_round_trip_separately_and_missing_onset_is_never_inferred(self):
        visit, body = self.case('influenza')
        body['clinical'].update(verified_symptoms=['fever', 'body_aches'],
            symptom_durations={'fever': '48', 'body_aches': '72'}, onset_hours='18.5')
        plan = self.preview(visit, body)
        self.assertEqual(plan.status_code, 200, plan.data)
        used = plan.data['result']['input_trace']['clinical']
        self.assertEqual(used['onset_hours'], '18.5')
        self.assertEqual(used['symptom_durations'], {'fever': '48.0', 'body_aches': '72.0'})
        saved, _ = self.save(visit, body, plan.data)
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['snapshot']['clinical'], used)
        body['clinical']['onset_hours'] = None
        row = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'].startswith('oseltamivir'))
        onset = next(c for c in row['checks'] if c['category'] == 'onset')
        self.assertEqual(onset['status'], 'cannot_validate')
        self.assertIsNone(onset['trace']['inputs']['clinical.onset_hours'])
        self.assertIsNone(row['regimen'])

    def test_who_choice_never_runs_cdc_regimen_onset_or_vaccine_checks(self):
        from .screening_engine import reference_regimen as real_reference
        visit, body = self.case('influenza')
        body['clinical'].update(influenza_guideline='WHO_2024', onset_hours=None, laiv_timing='unknown')

        def guarded_reference(profile, *args):
            self.assertNotEqual(profile['kind'], 'oseltamivir', 'WHO must not run the CDC/label regimen pathway')
            return real_reference(profile, *args)

        with patch('medicine_knowledge.screening_engine.reference_regimen', side_effect=guarded_reference):
            result = self.preview(visit, body).json()['result']
        row = next(r for r in result['candidates'] if r['medicine_id'].startswith('oseltamivir'))
        self.assertEqual(next(c for c in row['checks'] if c['category'] == 'guideline')['status'], 'blocked')
        self.assertFalse({'onset', 'vaccine_interaction', 'dose'} & {c['category'] for c in row['checks']})
        self.assertTrue(any(s['id'] == 'who-flu-2024' for s in row['sources']))
        saved, _ = self.save(visit, body)
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['snapshot']['clinical']['influenza_guideline'], 'WHO_2024')
        self.assertIsNone(saved.data['snapshot']['clinical']['onset_hours'])
        self.assertFalse(saved.data['result']['model_used'])

    def test_unknown_or_severe_who_scope_is_coverage_gap_not_non_severe_recommendation(self):
        visit, body = self.case('influenza')
        body['clinical']['influenza_guideline'] = 'WHO_2024'
        for severity in ('unknown', 'severe'):
            body['clinical']['condition_severity'] = severity
            row = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'].startswith('oseltamivir'))
            self.assertIsNone(row['regimen'])
            self.assertTrue(any(c['category'] == 'guideline_coverage' and c['status'] == 'cannot_validate' for c in row['checks']))
            self.assertFalse(any(c['category'] == 'guideline' and c['status'] == 'blocked' for c in row['checks']))

    def test_duplicate_trace_identifies_acetaminophen_and_retains_current_product(self):
        visit, body = self.case('influenza')
        self.resolve_history(visit, body, medicine=True)
        row = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'].startswith('paracetamol'))
        duplicate = next(c for c in row['checks'] if c['category'] == 'duplicate_ingredient')
        self.assertEqual(duplicate['status'], 'blocked')
        self.assertIn('acetaminophen', duplicate['message'])
        self.assertIn('Paracetamol 500mg SOS', duplicate['message'])
        matches = duplicate['trace']['inputs']['normalized_current_medicines']
        self.assertEqual(matches[0]['matches'][0]['ingredients'], ['acetaminophen'])
        self.assertEqual(matches[0]['resolution_method'], 'doctor_confirmed')
        self.assertTrue(duplicate['blocks_availability'])
        interaction = next(c for c in row['checks'] if c['category'] == 'interaction')
        self.assertEqual(interaction['status'], 'warning')
        self.assertTrue(interaction['blocks_availability'], 'Existing interaction-review warnings remain blocking')
        self.assertEqual(Context.objects.get(patient=self.patient).current_medicines, ['Paracetamol 500mg SOS'])

    def test_stale_engine_review_is_not_resolved_as_current_content_review(self):
        visit, body = self.case('influenza')
        SafetyProfile.objects.update(reviewed_engine_hash='0' * 64)  # In-memory fixture only.
        rows = self.preview(visit, body).json()['result']['candidates']
        self.assertTrue(all(r['status'] == 'unavailable' for r in rows))
        for row in rows[:2]:
            reviews = row['review_trace']
            self.assertTrue(reviews['content']['is_current'])
            self.assertEqual(reviews['safety']['stored_status'], 'reviewed')
            self.assertFalse(reviews['safety']['is_current'])
            self.assertNotEqual(reviews['safety']['reviewed_engine_hash'], reviews['safety']['current_engine_hash'])
            self.assertTrue(any('stale' in reason for reason in reviews['safety']['reasons']))
        self.assertTrue(MedicineEntry.objects.get(pk='paracetamol-500mg-tablet').review_is_current)

    def test_reference_safety_review_never_enables_an_incomplete_candidate(self):
        visit, body = self.case('influenza')
        scope = ConditionKnowledge.objects.get(pk='flu-baloxavir')
        review = self.client.post(f'/api/prescription/condition-knowledge/{scope.pk}/review/safety/', {
            'decision': 'reviewed', 'review_scope': 'reference_only', 'notes': 'Reviewed the reference evidence and missing product and executable rules.',
            'evidence_checked': True, 'expected_content_hash': scope.rules_hash, 'expected_updated_at': scope.updated_at.isoformat()}, format='json')
        self.assertEqual(review.status_code, 200, review.data)
        self.assertTrue(review.data['safety_review']['reference_review_is_current'])
        self.assertFalse(review.data['safety_review']['is_current'])
        row = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'] == 'baloxavir-reference')
        self.assertEqual(row['status'], 'unavailable')
        self.assertIsNone(row['regimen'])
        self.assertTrue(any(c['category'] == 'product_rule_coverage' and c['blocks_availability'] for c in row['checks']))

    def test_server_reference_precedes_dose_validation_no_manual_proposal_cycle(self):
        visit, body = self.case('influenza')
        rows = self.preview(visit, body).json()['result']['candidates']
        for row in rows[:2]:
            self.assertEqual(row['status'], 'candidate_for_clinician_review')
            self.assertIsNotNone(row['regimen'])
            self.assertEqual(next(c for c in row['checks'] if c['category'] == 'dose')['status'], 'passed')
        body['clinical']['renal_assessment'] = 'unknown'
        row = next(r for r in self.preview(visit, body).json()['result']['candidates'] if r['medicine_id'].startswith('paracetamol'))
        doses = [c for c in row['checks'] if c['category'] == 'dose']
        self.assertEqual(len(doses), 1)
        self.assertIn('renal', doses[0]['message'])
        self.assertNotIn('enter a clinician proposal', doses[0]['message'])
        self.assertIsNone(row['regimen'])

    def test_bad_or_missing_inputs_cannot_be_made_safe_by_casting_or_extra_fields(self):
        visit, body = self.case()
        for field, value in (('patient_id', 99), ('proposals', []), ('approved', True)):
            forged = deepcopy(body); forged[field] = value
            self.assertEqual(self.preview(visit, forged).status_code, 400)
        for field, value in (('reviewed', 'true'), ('reviewed', False), ('onset_hours', 'NaN'), ('verified_symptoms', ['made_up']), ('condition_assessments', {'eye_pain': 'false'})):
            forged = deepcopy(body); forged['clinical'][field] = value
            self.assertEqual(self.preview(visit, forged).status_code, 400)

    def test_source_and_context_hash_conflicts_require_new_preview(self):
        visit, body = self.case()
        for changes in ({'expected_analysis_hash': '0' * 64}, {'expected_context_updated_at': '2020-01-01T00:00:00Z'}):
            self.assertEqual(self.preview(visit, dict(body, **changes)).status_code, 409)

    def test_saving_is_idempotent_immutable_and_stale_plan_or_revision_is_rejected(self):
        visit, body = self.case()
        plan = self.preview(visit, body).json()
        saved, request = self.save(visit, body, plan)
        self.assertEqual(saved.status_code, 201, saved.data)
        retry = self.client.post(self.path(visit, 'drafts'), request, format='json')
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(retry.data['id'], saved.data['id'])
        self.assertEqual(self.save(visit, body, plan)[0].status_code, 409)
        self.assertEqual(self.save(visit, body, expected_plan_hash='0' * 64)[0].status_code, 409)
        changed = deepcopy(request); changed['clinical']['onset_hours'] = '18'
        self.assertEqual(self.client.post(self.path(visit, 'drafts'), changed, format='json').status_code, 409)
        self.patient.birthday = '1985-01-01'; self.patient.save(update_fields=['birthday'])
        current = self.client.get('/api/prescription/six-condition-drafts/').json()[0]
        self.assertFalse(current['current_state']['is_current'])

    def test_preview_has_no_database_writes_training_or_publication(self):
        visit, body = self.case()
        with patch('prescription_research.expansion.comparison.train', side_effect=AssertionError('never train')), CaptureQueriesContext(connection) as queries:
            self.assertEqual(self.preview(visit, body).status_code, 200)
        self.assertFalse([q['sql'] for q in queries if q['sql'].lstrip().upper().startswith(('INSERT ', 'UPDATE ', 'DELETE '))])
        self.assertEqual(PatientScreeningDraft.objects.count(), 0)

    def test_scope_permissions_csrf_records_and_history_are_private(self):
        visit, body = self.case()
        saved, _ = self.save(visit, body)
        strict = APIClient(enforce_csrf_checks=True); strict.force_login(self.doctor)
        self.assertEqual(strict.post(self.path(visit, 'preview'), body, format='json').status_code, 403)
        self.client.force_login(self.other)
        self.assertEqual(self.preview(visit, body).status_code, 404)
        self.assertEqual(self.client.get('/api/prescription/six-condition-drafts/').json(), [])
        self.assertEqual(self.client.get('/api/prescription/six-condition-drafts/' + saved.data['id'] + '/').status_code, 404)
        self.client.force_login(self.patient)
        self.assertEqual(self.client.get(self.path(visit, 'inputs')).status_code, 403)

    def test_addition_seed_is_idempotent_and_preserves_legacy_reviews_and_frozen_model(self):
        before = (list(MedicineEntry.objects.order_by('pk').values()), list(SafetyProfile.objects.order_by('pk').values()), engine_digest(), ConditionKnowledgeReview.objects.count())
        call_command('seed_six_condition_knowledge', stdout=StringIO())
        after = (list(MedicineEntry.objects.order_by('pk').values()), list(SafetyProfile.objects.order_by('pk').values()), engine_digest(), ConditionKnowledgeReview.objects.count())
        self.assertEqual(before, after)
        self.assertEqual(ConditionKnowledge.objects.count(), 14)
        self.assertEqual(len({row.medicine_id for row in ConditionKnowledge.objects.all()} | set(MedicineEntry.objects.values_list('pk', flat=True))), 16)
