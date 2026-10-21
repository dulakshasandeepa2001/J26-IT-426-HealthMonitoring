"""Independent synthetic assertions for new target semantics and guarded output."""
from copy import deepcopy
from pathlib import Path
import shutil
import tempfile
import unittest

from prescription_research.random_forest_200 import data as io
from . import dataset as ds, experiment as ex


class RuleForestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.products, cls.policies, cls.profiles = ds.knowledge()
        cls.rows, cls.initial, cls.audit = ds.fixtures()
        from sklearn.ensemble import RandomForestClassifier
        cls.allergy_model = ex.fit([r for r in cls.rows if r['split'] == 'train'], 'allergy',
            RandomForestClassifier(n_estimators=16, random_state=426, n_jobs=1))

    def row(self, modes=(), candidate='paracetamol-500mg-tablet', condition='influenza', age=25):
        policy = next(p for p in self.policies if p['candidate_id'] == candidate and p['condition'] == condition)
        return ds.make_row({'id': 'isolated', 'split': 'train', 'ages': [age], 'changes': list(modes)},
            0, policy, self.products[candidate], ds.effective_rule(policy, self.profiles[candidate]), self.profiles, self.products)

    def test_exact_allergy_and_cross_hypersensitivity_block(self):
        for modes in (['allergy_match'], ['allergy_alias'], ['allergy_mixed']):
            self.assertEqual(self.row(modes)['targets']['allergy'], 'blocked')
        row = self.row(['allergy_alias'], 'acyclovir-800mg-tablet', 'chickenpox')
        self.assertIn('valacyclovir', row['patient_features']['allergies'][0])
        self.assertEqual(row['targets']['allergy'], 'blocked')

    def test_allergy_unknown_is_not_none_or_clearance(self):
        self.assertEqual(self.row(['allergy_unknown'])['targets']['allergy'], 'cannot_validate')
        self.assertEqual(self.row(['allergy_unresolved'])['targets']['allergy'], 'cannot_validate')
        self.assertEqual(self.row()['targets']['allergy'], 'no_selected_issue')

    def test_duplicates_and_unresolved_medicines_are_distinct(self):
        self.assertEqual(self.row(['duplicate'])['targets']['duplicate_ingredient'], 'blocked')
        self.assertEqual(self.row(['medicine_unresolved'])['targets']['duplicate_ingredient'], 'cannot_validate')
        self.assertEqual(self.row()['targets']['duplicate_ingredient'], 'no_selected_issue')

    def test_warfarin_caution_never_becomes_an_invented_contraindication(self):
        row = self.row(['warfarin'])
        findings = [c for c in row['teacher_checks'] if c['category'] == 'interaction']
        self.assertTrue(any(c['status'] == 'warning' for c in findings))
        self.assertFalse(any(c['status'] == 'blocked' for c in findings))
        # Current product is outside the exact catalogue: that gap remains.
        self.assertEqual(row['targets']['interaction'], 'cannot_validate')

    def test_laiv_unknown_and_timing_review_are_preserved(self):
        candidate = 'oseltamivir-75mg-capsule'
        self.assertEqual(self.row(['laiv_unknown'], candidate)['targets']['interaction'], 'cannot_validate')
        self.assertEqual(self.row(['laiv_review'], candidate)['targets']['interaction'], 'review_required')
        self.assertEqual(self.row([], candidate)['targets']['interaction'], 'no_selected_issue')

    def test_dose_comparison_reuses_exact_rule_and_proposal(self):
        for mode in ('dose_low', 'dose_high', 'dose_route', 'dose_schedule', 'dose_frequency', 'dose_duration'):
            with self.subTest(mode=mode): self.assertEqual(self.row([mode])['targets']['dose'], 'mismatch')
        self.assertEqual(self.row()['targets']['dose'], 'matches_selected_rule')
        self.assertEqual(self.row(['dose_missing'])['targets']['dose'], 'cannot_validate')

    def test_dose_never_invents_missing_weight_age_or_renal_assessment(self):
        candidate = 'oseltamivir-75mg-capsule'
        for mode in ('age_unknown', 'pediatric_weight_unknown', 'renal_unknown', 'pediatric_small'):
            row = self.row([mode], candidate)
            self.assertIsNone(row['proposed_regimen'])
            self.assertEqual(row['targets']['dose'], 'cannot_validate')
        large = self.row(['pediatric_large'], candidate)
        self.assertEqual(large['proposed_regimen']['amount'], '75')

    def test_scheduled_gram_equivalence_and_volume_ambiguity(self):
        candidate = 'oseltamivir-75mg-capsule'
        self.assertEqual(self.row(['dose_grams'], candidate)['targets']['dose'], 'matches_selected_rule')
        self.assertEqual(self.row(['dose_volume'], candidate)['targets']['dose'], 'cannot_validate')

    def test_who_choice_is_not_switched_to_cdc(self):
        row = self.row(['who'], 'oseltamivir-75mg-capsule')
        self.assertEqual(row['patient_features']['influenza_guideline'], 'WHO_2024')
        self.assertEqual(row['targets']['purpose_applicability'], 'guideline_against')
        facts = deepcopy(row['patient_features'])
        facts['condition_severity'] = 'severe'
        policy = next(p for p in self.policies if p['handler'] == 'oseltamivir')
        self.assertEqual(ds.purpose_target(facts, policy), 'cannot_validate')

    def test_purpose_and_safety_are_separate_targets(self):
        row = self.row(['allergy_match'])
        self.assertEqual(row['targets']['purpose_applicability'], 'provisional_relevance')
        self.assertEqual(row['targets']['allergy'], 'blocked')
        self.assertEqual(self.row(['targets_absent'])['targets']['purpose_applicability'], 'not_relevant')
        self.assertEqual(self.row(['targets_unknown'])['targets']['purpose_applicability'], 'cannot_validate')

    def test_source_200_is_audited_without_promoting_facts(self):
        rows, audit = ds.audit_source_200()
        self.assertEqual((audit['cases'], len(rows)), (200, 636))
        self.assertEqual((audit['clinical_facts_promoted'], audit['invented_proposed_regimens']), (0, 0))
        self.assertTrue(all(not r['used_for_training'] and r['dose'] == r['allergy'] == r['interaction'] == 'cannot_validate' and r['best_medicine'] is None for r in rows))

    def test_family_leakage_and_fabricated_review_are_rejected(self):
        row = deepcopy(self.initial[0])
        row.update(scenario_id='DIFFERENT', split='test')
        with self.assertRaisesRegex(ValueError, 'family crosses'): ds.validate([self.initial[0], row])
        row = deepcopy(self.initial[0])
        row['clinical_review_status'] = 'reviewed'
        with self.assertRaisesRegex(ValueError, 'provenance'): ds.validate([row])

    def test_conflicting_labels_on_equal_model_inputs_fail(self):
        row = self.row()
        changed = deepcopy(row)
        changed['targets']['allergy'] = 'blocked'
        with self.assertRaisesRegex(ValueError, 'Conflicting labels'): ex.unique([row, changed], 'allergy')

    def test_preprocessing_is_train_only(self):
        row = deepcopy(self.initial[0])
        row['split'] = 'validation'
        with self.assertRaisesRegex(ValueError, 'training families'): ex.fit([row], 'allergy', self.allergy_model['pipeline']['forest'])

    def test_model_inputs_do_not_read_teacher_or_review_outputs(self):
        row = self.row(['allergy_match'])
        expected = ex.predict(self.allergy_model, [row])
        row.update(targets={}, teacher_checks=[], clinical_review_status='forged', teacher_score=100, proposed_regimen={'amount': 999})
        self.assertEqual(ex.predict(self.allergy_model, [row]), expected)
        self.assertEqual(set(ds.features(row, 'allergy')), {'candidate_id', 'allergy_status', 'allergy_mentions'})

    def test_unseen_identity_abstains(self):
        row = self.row()
        row['patient_features']['allergies'] = ['NEVER SEEN IDENTITY']
        self.assertIsNone(ex.predict(self.allergy_model, [row])[0]['predicted'])

    def test_learned_permissive_predictions_never_override_a_block(self):
        row = self.row(['allergy_match'])
        values = {task: {'predicted': target} for task, target in row['targets'].items()}
        values['allergy'] = {'predicted': 'no_selected_issue'}
        result = ex.guarded_comparison(row, values)
        self.assertIsNone(result['fictional_reference_regimen'])
        self.assertFalse(result['ml_can_override_rules'] or result['prescription_eligible'] or result['approved'])
        self.assertIn('allergy', result['model_disagreements_or_abstentions'])

    def test_no_reference_with_unknown_or_unsupported_purpose(self):
        row = self.row(['who'], 'oseltamivir-75mg-capsule')
        result = ex.guarded_comparison(row, {task: {'predicted': value} for task, value in row['targets'].items()})
        self.assertIsNone(result['fictional_reference_regimen'])
        self.assertEqual(result['ranking'], 'not_supported; one candidate in this condition-role group')

    def test_frozen_models_verify_and_tampering_is_detected(self):
        report = ex.verify()
        self.assertFalse(report['application_model_replaced'] or report['clinical_validation'])
        with tempfile.TemporaryDirectory(dir=ds.HERE) as directory:
            output = Path(directory) / 'isolated'
            shutil.copytree(ds.OUTPUT, output)
            with (output / 'models.joblib').open('ab') as handle: handle.write(b'tamper-test')
            with self.assertRaisesRegex(ValueError, 'Artifact integrity failed: models.joblib'): ex.verify(output)

    def test_explicit_synthetic_opt_in_is_required(self):
        with self.assertRaisesRegex(ValueError, 'enable-synthetic-demo'): ex.inspect_synthetic(ds.OUTPUT, 'any')


if __name__ == '__main__': unittest.main()
