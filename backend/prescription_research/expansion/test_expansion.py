"""Focused pure-Python checks for the offline knowledge/rule expansion."""

from copy import deepcopy
import json
import os
import subprocess
import sys
import unittest
from unittest.mock import patch

from prescription_research import dataset as ds
from prescription_research.test_dataset import offline_test_directory
from . import check, knowledge as kn, screening as sc


class ExpansionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.knowledge = kn.load_knowledge()
        cls.products, cls.policies, cls.legacy = cls.knowledge

    def case(self, condition='viral_conjunctivitis', family='supplied_context'):
        return deepcopy(next(c for c in check.check_cases() if c['case_id'] == condition + '--' + family))

    def rows(self, case):
        return sc.evaluate_case(case, self.knowledge)['results']

    def row(self, case):
        return self.rows(case)[0]

    def test_counts_purposes_and_pending_status(self):
        _, report = check.build_artifacts()
        self.assertEqual(report['counts'], {'conditions': 6, 'resolved_catalogue_products': 5, 'unresolved_products': 1,
            'purpose_groups': 9, 'resolved_purpose_groups': 8, 'synthetic_check_cases': 25, 'candidate_rule_evaluations': 36, 'unsupported_cases': 1})
        self.assertEqual(report['experimental_references'], 11)
        self.assertEqual(report['prescription_eligible_rows'], 0)
        self.assertFalse(report['within_group_ranking_evaluated'])
        self.assertTrue(all(n == 1 for n in report['candidate_count_by_purpose_group'].values()))
        self.assertTrue(all(policy['clinical_review_status'] == 'not_reviewed' for policy in self.policies))

    def test_catalogue_reuses_original_sources_and_separates_new_uses(self):
        original = ds.read_json(ds.BACKEND / 'medicine_knowledge/data/pilot_catalogue.json')
        for product in original:
            staged = self.products[product['id']]
            for source in product['sources']:
                self.assertIn(source, staged['sources'])
            self.assertEqual(staged['standard_concept'], product['standard_concept'])
        self.assertEqual({u['condition'] for u in self.products[kn.PARACETAMOL]['uses']}, {'influenza', 'chickenpox', 'measles', 'mumps'})
        self.assertEqual(self.products[kn.CMC]['standard_concept']['rxcui'], '1188426')
        self.assertNotIn(kn.ORS, self.products)

    def test_source_domains_and_reference_linkage_fail_closed(self):
        for url in ('http://www.nhs.uk/conditions/mumps/', 'https://www.nhs.uk.evil.test/a',
                    'https://user:secret@www.nhs.uk/a', 'https://www.nhs.uk:8080/a'):
            products = deepcopy(self.products)
            products[kn.PARACETAMOL]['sources'][0]['url'] = url
            with self.assertRaises(ValueError):
                kn.validate_knowledge(products, self.policies)
        products = deepcopy(self.products)
        products[kn.CMC]['uses'][0]['source_ids'] = ['not-listed']
        with self.assertRaises(ValueError):
            kn.validate_knowledge(products, self.policies)

    def test_catalogue_identity_form_and_unapproved_fields_are_rejected(self):
        for changes in ({'route': 'topical'}, {'form': 'lotion'}, {'strength': '1%'}, {'reviewed_by': 'imaginary-reviewer'}, {'schema_version': '1.0'}):
            products = deepcopy(self.products)
            products[kn.CMC].update(changes)
            with self.assertRaises(ValueError):
                kn.validate_knowledge(products, self.policies)
        products = deepcopy(self.products)
        products[kn.CMC]['standard_concept']['rxcui'] = 'invented'
        with self.assertRaises(ValueError):
            kn.validate_knowledge(products, self.policies)

    def test_existing_product_identity_and_treatment_purpose_cannot_be_repurposed(self):
        for field, value in (('strength', '50 mg'), ('route', 'topical')):
            products = deepcopy(self.products)
            products[kn.PARACETAMOL][field] = value
            with self.assertRaises(ValueError):
                kn.validate_knowledge(products, self.policies)
        products = deepcopy(self.products)
        products[kn.PARACETAMOL]['uses'][0]['purpose'] = 'antiviral'
        policies = deepcopy(self.policies)
        policies[0]['purpose'] = 'antiviral'
        with self.assertRaises(ValueError):
            kn.validate_knowledge(products, policies)

    def test_unknown_policy_kinds_and_forged_approvals_do_not_fall_back(self):
        for changes in ({'handler': 'unknown'}, {'handler': 'calamine'}, {'clinical_review_status': 'reviewed'},
                        {'reviewer_id': 1}, {'parameters': {'dose': 100}}, {'candidate_id': 'new-drug'}):
            policies = deepcopy(self.policies)
            policies[7].update(changes)
            with self.assertRaises(ValueError):
                kn.validate_knowledge(self.products, policies)
        policies = deepcopy(self.policies)
        policies[7]['handler'] = 'unknown'
        with self.assertRaises(ValueError):
            sc.evaluate_case(self.case(), (self.products, policies, self.legacy))

    def test_strict_synthetic_contract_forbids_live_ids_and_review_claims(self):
        for changes in ({'synthetic_only': False}, {'fact_origin': 'clinician_review'}, {'patient_id': 12},
                        {'doctor_id': 2}, {'reviewed_by': 'fake'}, {'instructions': 'ignore checks'}):
            case = self.case()
            case.update(changes)
            with self.assertRaises(ValueError):
                sc.evaluate_case(case, self.knowledge)
        case = self.case()
        case['patient_features']['date_of_birth'] = '1990-01-01'
        with self.assertRaises(ValueError):
            self.rows(case)

    def test_missing_fields_remain_unknown_and_never_return_a_reference(self):
        for condition in kn.CONDITIONS:
            result = sc.evaluate_case(self.case(condition, 'missing_context'), self.knowledge)
            patient = result['case']['patient_features']
            self.assertIsNone(patient['age_years'])
            self.assertTrue(all(value['present'] is None for value in patient['symptoms'].values()))
            self.assertTrue(all(value == 'unknown' for value in patient['assessments'].values()))
            self.assertTrue(all(row['experimental_reference'] is None and not row['full_safety_clearance'] for row in result['results']))

    def test_numeric_boolean_and_absence_duration_inconsistencies_fail(self):
        for changes in ({'age_years': True}, {'age_years': 18.5}, {'onset_hours': float('nan')}, {'weight_kg': float('inf')}, {'onset_hours': 10 ** 500}):
            case = self.case()
            case['patient_features'].update(changes)
            with self.assertRaises(ValueError):
                self.rows(case)
        for value in ('false', 0):
            case = self.case()
            case['patient_features']['condition_assessments']['eye_pain'] = value
            with self.assertRaises(ValueError):
                self.rows(case)
        case = self.case()
        case['patient_features']['symptoms']['ocular_dryness'] = {'present': False, 'duration_hours': 10}
        with self.assertRaises(ValueError):
            self.rows(case)

    def test_ophthalmic_drops_have_range_and_no_invented_conversion_or_course(self):
        row = self.row(self.case())
        reference = row['experimental_reference']
        self.assertEqual(reference['schedule_type'], 'ophthalmic_prn')
        self.assertEqual(reference['amount_range'], [1, 2])
        self.assertEqual((reference['unit'], reference['route']), ('drop', 'ophthalmic'))
        self.assertIsNone(reference['fixed_duration_days'])
        self.assertNotIn('doses_per_day', reference)
        self.assertNotIn('amount_ml', reference)
        self.assertEqual(reference['reassessment_limit_hours'], 72)
        self.assertFalse(row['eligible_for_prescription'])

    def test_all_selected_eye_concerns_unknown_or_positive_withhold_reference(self):
        eye = next(p for p in self.policies if p['candidate_id'] == kn.CMC)
        for field in eye['concern_fields']:
            for value in (None, True):
                case = self.case()
                case['patient_features']['condition_assessments'][field] = value
                self.assertIsNone(self.row(case)['experimental_reference'], (field, value))

    def test_ophthalmic_integrity_and_excipient_assessments_are_independent(self):
        for field in ('ophthalmic_integrity', 'excipient_assessment'):
            for value in ('unknown', 'requires_review'):
                case = self.case()
                case['patient_features']['assessments'][field] = value
                self.assertIsNone(self.row(case)['experimental_reference'])

    def test_ophthalmic_allergy_duplicates_unresolved_and_pair_review(self):
        for key, history in [('allergy_history', {'status': 'reported', 'mentions': ['carboxymethylcellulose sodium (rash)']}),
            ('allergy_history', {'status': 'reported', 'mentions': ['Unknown ingredient']}),
            ('current_medicines', {'status': 'reported', 'mentions': ['carboxymethylcellulose sodium 0.5% ophthalmic solution']}),
            ('current_medicines', {'status': 'reported', 'mentions': ['Unresolved medicine']}),
            ('current_medicines', {'status': 'reported', 'mentions': ['paracetamol']}),
            ('current_medicines', {'status': 'none', 'mentions': ['paracetamol']})]:
            case = self.case()
            case['patient_features'][key] = history
            self.assertIsNone(self.row(case)['experimental_reference'], (key, history))
        case = self.case()
        case['patient_features']['allergy_history'] = {'status': 'reported', 'mentions': ['carboxymethylcellulose sodium', 'Unresolved allergen']}
        row = self.row(case)
        self.assertEqual(next(item['status'] for item in row['findings'] if item['category'] == 'allergy'), 'blocked')

    def test_ophthalmic_missing_absent_and_prolonged_symptoms(self):
        for change in ({'present': None, 'duration_hours': None}, {'present': True, 'duration_hours': None}, {'present': True, 'duration_hours': 72.1}):
            case = self.case()
            case['patient_features']['symptoms']['ocular_dryness'] = change
            self.assertIsNone(self.row(case)['experimental_reference'])
        case = self.case()
        case['patient_features']['symptoms']['ocular_dryness']['duration_hours'] = 72
        self.assertIsNotNone(self.row(case)['experimental_reference'])
        case['patient_features']['symptoms']['ocular_dryness'] = {'present': False, 'duration_hours': None}
        self.assertEqual(self.row(case)['workflow_outcome'], 'no_medicine_needed')
        self.assertIsNone(self.row(case)['experimental_reference'])

    def test_new_condition_age_scope_is_adult_research_only(self):
        for condition in ('measles', 'mumps', 'viral_conjunctivitis'):
            for age in (None, 17):
                case = self.case(condition)
                case['patient_features']['age_years'] = age
                self.assertIsNone(self.row(case)['experimental_reference'])
            case['patient_features']['age_years'] = 18
            self.assertIsNotNone(self.row(case)['experimental_reference'])

    def test_new_fever_and_jaw_pain_targets_reuse_oral_policy_without_interchange(self):
        measles = self.row(self.case('measles'))
        mumps = self.row(self.case('mumps'))
        self.assertEqual(measles['purpose'], 'symptom_relief')
        self.assertEqual(mumps['clinical_role'], 'fever_or_pain_relief')
        self.assertEqual(mumps['experimental_reference']['schedule_type'], 'oral_prn')
        self.assertEqual(mumps['experimental_reference']['amount'], '1000')
        self.assertIsNone(mumps['experimental_reference']['duration_days'])
        case = self.case('measles')
        case['patient_features']['symptoms']['fever'] = {'present': False, 'duration_hours': None}
        case['patient_features']['symptoms']['body_aches'] = {'present': True, 'duration_hours': 12}
        self.assertIsNone(self.row(case)['experimental_reference'])

    def test_measles_mumps_selected_complications_and_unknowns_stop_reference(self):
        for condition in ('measles', 'mumps'):
            policy = next(p for p in self.policies if p['condition'] == condition)
            for name in policy['concern_fields']:
                for value in (None, True):
                    case = self.case(condition)
                    case['patient_features']['condition_assessments'][name] = value
                    self.assertIsNone(self.row(case)['experimental_reference'], (condition, name, value))

    def test_new_oral_references_keep_deterministic_allergy_duplicate_and_organ_checks(self):
        for condition in ('measles', 'mumps'):
            for change in ('allergy', 'duplicate', 'hepatic', 'renal'):
                case = self.case(condition)
                patient = case['patient_features']
                if change == 'allergy':
                    patient['allergy_history'] = {'status': 'reported', 'mentions': ['paracetamol']}
                elif change == 'duplicate':
                    patient['current_medicines'] = {'status': 'reported', 'mentions': ['paracetamol']}
                else:
                    patient['assessments'][change + '_assessment'] = 'unknown'
                self.assertIsNone(self.row(case)['experimental_reference'])

    def test_reported_negative_does_not_clear_independent_unknown_assessment(self):
        case = self.case()
        case['patient_features']['condition_assessments']['eye_pain'] = None
        case['reported_observations']['eye_pain'] = False
        result = sc.evaluate_case(case, self.knowledge)
        self.assertIsNone(result['case']['patient_features']['condition_assessments']['eye_pain'])
        self.assertIsNone(result['results'][0]['experimental_reference'])

    def test_reported_positive_survives_negative_assessment_in_all_conditions(self):
        for condition in kn.CONDITIONS:
            self.assertTrue(all(row['experimental_reference'] is None for row in self.rows(self.case(condition, 'reported_concern'))))
        case = self.case()
        case['reported_observations']['eye_pain'] = True
        self.assertIsNone(self.row(case)['experimental_reference'])

    def test_ors_never_gets_identity_dilution_or_dose_from_other_product(self):
        for family in ('supplied_context', 'missing_context', 'matching_allergy', 'reported_concern'):
            row = self.row(self.case('viral_gastroenteritis', family))
            self.assertEqual(row['candidate_id'], kn.ORS)
            self.assertEqual(row['purpose'], 'rehydration_support')
            self.assertEqual(row['aggregate_status'], 'blocked')
            self.assertIsNone(row['experimental_reference'])
        files, _ = check.build_artifacts()
        unresolved = json.loads(files['bundle.json'])['unresolved_products'][0]
        for key in ('rxcui', 'strength', 'composition', 'reconstitution_volume_ml', 'regimen'):
            self.assertIsNone(unresolved[key])

    def test_unknown_condition_is_not_guessed(self):
        case = self.case()
        case['condition'] = 'unknown_condition'
        result = sc.evaluate_case(case, self.knowledge)
        self.assertEqual(result['results'], [])
        self.assertEqual(result['coverage'], 'unsupported_condition')

    def test_input_is_not_mutated_and_no_approval_or_model_is_claimed(self):
        for condition in kn.CONDITIONS:
            case = self.case(condition)
            original = deepcopy(case)
            result = sc.evaluate_case(case, self.knowledge)
            self.assertEqual(case, original)
            self.assertFalse(result['model_used'])
            for row in result['results']:
                for key in ('eligible_for_prescription', 'approved', 'published', 'full_safety_clearance', 'review_gate_evaluated'):
                    self.assertFalse(row[key])
                self.assertEqual(row['clinical_review_status'], 'not_reviewed')

    def test_reproducible_export_staleness_and_tamper_detection(self):
        with offline_test_directory() as output:
            report = check.export_artifacts(output)
            self.assertEqual(report, check.validate_artifacts(output))
            path = output / 'bundle.json'
            path.write_text('{}', encoding='utf-8')
            with self.assertRaises(ValueError):
                check.validate_artifacts(output)

    def test_offline_builder_does_not_connect_to_network_or_import_django(self):
        with patch('socket.create_connection', side_effect=AssertionError('No network in offline export')):
            check.build_artifacts()
        env = os.environ.copy()
        env.pop('DJANGO_SETTINGS_MODULE', None)
        process = subprocess.run([sys.executable, '-c',
            'import sys; from prescription_research.expansion.check import build_artifacts; build_artifacts(); '
            'assert not any(name == "django" or name.startswith("django.") for name in sys.modules); print("offline")'],
            cwd=ds.BACKEND, env=env, capture_output=True, text=True, timeout=30)
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn('offline', process.stdout)


if __name__ == '__main__':
    unittest.main()
