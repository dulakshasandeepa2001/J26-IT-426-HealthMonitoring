"""Focused offline contract/provenance/safety tests; never set up Django."""

from copy import deepcopy
from contextlib import contextmanager
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch
from uuid import uuid4

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from prescription_research import dataset as ds


@contextmanager
def offline_test_directory():
    # Python 3.13 TemporaryDirectory's Windows mode=0700 ACL can exclude a
    # restricted process. Normal mkdir inherits the workspace ACL instead.
    output = ds.HERE / f'offline-test-{uuid4().hex}'
    output.mkdir()
    try:
        yield output
    finally:
        if output.resolve().parent != ds.HERE:
            raise AssertionError('Test cleanup must stay inside its research directory.')
        for child in output.iterdir():
            if child.resolve().parent != output.resolve() or not child.is_file():
                raise AssertionError('Only directly created test artifact files may be removed.')
            child.unlink()
        output.rmdir()


class SyntheticDatasetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch = ds.build_batch()
        cls.products, cls.policies, cls.criteria, cls.sources = ds.knowledge()

    def scenario(self, family, condition='influenza'):
        return deepcopy(next(item for item in self.batch['scenarios']
                             if item['template_family'] == family and item['condition'] == condition))

    def finding(self, scenario, product_id, category):
        safety = ds.safety_for_scenario(scenario, self.products, self.policies, self.criteria)[product_id]
        return next(item for item in safety['findings'] if item['category'] == category)

    def test_actual_counts_and_purpose_groups(self):
        report = ds.validate_batch(self.batch)
        self.assertEqual(report['counts'], {'synthetic_contexts': 36, 'candidate_rows': 144,
                                          'template_families': 18, 'condition_mapped_rows': 85,
                                          'contrast_or_unsupported_rows': 59})
        self.assertEqual(report['class_balance'], {'relevant': 74, 'not_relevant': 56, 'undetermined': 14})
        self.assertEqual(len(report['supported_groups']), 5)
        self.assertTrue(all(len(group['candidate_ids']) == 1 for group in report['supported_groups'].values()))
        self.assertEqual(report['by_split']['validation']['missing_label_classes'], ['undetermined'])
        self.assertFalse(report['model_trained'])
        self.assertIsNone(report['held_out_agreement'])

    def test_relevance_does_not_use_safety_facts(self):
        baseline = self.scenario('present_targets')
        fields = {
            'age_years': None, 'weight_kg': None, 'onset_hours': None,
            'allergy_history': {'status': 'reported', 'mentions': ['Paracetamol (Rash)']},
            'current_medicines': {'status': 'reported', 'mentions': ['paracetamol']},
            'assessments': {key: 'unknown' for key in baseline['patient_features']['assessments']},
        }
        changed = deepcopy(baseline)
        changed['patient_features'].update(fields)
        for product_id in self.products:
            self.assertEqual(ds.relevance_target(baseline, product_id, self.criteria),
                             ds.relevance_target(changed, product_id, self.criteria))
            self.assertEqual(ds.model_features(baseline, product_id, self.criteria),
                             ds.model_features(changed, product_id, self.criteria))
        self.assertEqual(self.finding(changed, 'paracetamol-500mg-tablet', 'allergy')['status'], 'blocked')
        self.assertEqual(self.finding(changed, 'oseltamivir-75mg-capsule', 'age')['status'], 'cannot_validate')

    def test_relevant_allergy_and_duplicate_cases_remain_blocked(self):
        for family, category in [('matching_allergy', 'allergy'), ('duplicate_current_ingredient', 'duplicate_ingredient')]:
            with self.subTest(family=family):
                scenario = self.scenario(family)
                self.assertEqual(ds.relevance_target(scenario, 'paracetamol-500mg-tablet', self.criteria)['value'], 'relevant')
                self.assertEqual(self.finding(scenario, 'paracetamol-500mg-tablet', category)['status'], 'blocked')

    def test_unknown_symptoms_are_not_absence(self):
        for family, expected in [('unknown_targets', 'undetermined'), ('absent_targets', 'not_relevant')]:
            scenario = self.scenario(family)
            self.assertEqual(ds.relevance_target(scenario, 'paracetamol-500mg-tablet', self.criteria)['value'], expected)
        mixed = self.scenario('partially_unknown_targets')
        self.assertEqual(ds.relevance_target(mixed, 'paracetamol-500mg-tablet', self.criteria)['value'], 'undetermined')
        mixed['patient_features']['symptoms']['body_aches']['present'] = True
        self.assertEqual(ds.relevance_target(mixed, 'paracetamol-500mg-tablet', self.criteria)['value'], 'relevant')

    def test_unknown_histories_and_unresolved_names_cannot_clear(self):
        for family, category in [('unresolved_allergy', 'allergy'),
                                 ('unresolved_current_medicine', 'duplicate_ingredient'),
                                 ('unresolved_current_medicine', 'interaction'),
                                 ('missing_duration_and_histories', 'allergy'),
                                 ('missing_duration_and_histories', 'interaction')]:
            with self.subTest(family=family, category=category):
                self.assertEqual(self.finding(self.scenario(family), 'paracetamol-500mg-tablet', category)['status'], 'cannot_validate')

    def test_exact_static_alias_matching_and_ambiguity(self):
        matches = ds.match_synthetic_medicines(['  PARACETAMOL  ', 'Paracetamol 500mg SOS', 'unknown-brand'], self.products)
        self.assertEqual([item['status'] for item in matches], ['recognized', 'unrecognized', 'unrecognized'])
        self.assertEqual(matches[0]['matches'][0]['ingredients'], ['acetaminophen'])
        duplicates = deepcopy(self.products)
        duplicates['paracetamol-500mg-tablet']['aliases'].append({'name': 'paracetamol', 'level': 'ingredient'})
        self.assertEqual(ds.match_synthetic_medicines(['paracetamol'], duplicates)[0]['status'], 'ambiguous')

    def test_missing_age_duration_onset_and_pediatric_formulation(self):
        cases = [('missing_age_and_weight', 'age'), ('missing_duration_and_histories', 'dose'),
                 ('missing_duration_and_histories', 'onset'), ('late_onset', 'onset'),
                 ('pediatric_other_formulation', 'dose')]
        for family, category in cases:
            with self.subTest(family=family, category=category):
                product_id = 'paracetamol-500mg-tablet' if category == 'dose' and family == 'missing_duration_and_histories' else 'oseltamivir-75mg-capsule'
                self.assertEqual(self.finding(self.scenario(family), product_id, category)['status'], 'cannot_validate')
        child = self.scenario('pediatric_other_formulation', 'chickenpox')
        self.assertEqual(self.finding(child, 'acyclovir-800mg-tablet', 'indication_scope')['status'], 'blocked')

    def test_unknown_condition_never_runs_engine(self):
        with patch.object(ds, 'run_screening', side_effect=AssertionError('must not evaluate unsupported conditions')):
            for condition in (None, 'viral_urti'):
                scenario = self.scenario('unsupported_condition', condition)
                self.assertEqual(ds.safety_for_scenario(scenario, self.products, self.policies, self.criteria), {})
                for product_id in self.products:
                    self.assertEqual(ds.relevance_target(scenario, product_id, self.criteria)['value'], 'undetermined')

    def test_no_review_or_publication_claims(self):
        for row in self.batch['candidate_rows']:
            self.assertEqual(row['clinical_review_status'], 'not_reviewed')
            self.assertEqual(row['relevance_target']['label_method'], 'rule_derived')
            self.assertFalse(row['research_safety']['review_gate_evaluated'])
            self.assertFalse(row['research_safety']['full_safety_clearance'])
            for finding in row['research_safety']['findings']:
                self.assertEqual(set(finding), {'category', 'status', 'source_ids'})
                self.assertLessEqual(set(finding['source_ids']), set(self.sources))
        for scenario in self.batch['scenarios']:
            self.assertEqual(scenario['clinical_review_status'], 'not_reviewed')

    def test_feature_projection_excludes_outcome_and_provenance(self):
        forbidden = {'relevance_target', 'label_method', 'criterion_id', 'reason', 'research_safety',
                     'teacher_score', 'reviewer_id', 'template_family', 'scenario_id', 'split', 'versions'}
        for row in self.batch['candidate_rows']:
            self.assertEqual(set(row['model_features']), set(self.criteria['feature_allowlist']))
            self.assertFalse(forbidden & set(row['model_features']))
        corrupted = deepcopy(self.batch)
        corrupted['candidate_rows'][0]['model_features']['teacher_score'] = 1.0
        with self.assertRaises(ds.ValidationError):
            ds.validate_batch(corrupted)

    def test_validator_rejects_fabricated_review_label_evidence_and_safety(self):
        mutations = [
            lambda row: row.update(clinical_review_status='reviewed'),
            lambda row: row.update(reviewer_id=42),
            lambda row: row['relevance_target'].update(label_method='clinician_assigned'),
            lambda row: row['relevance_target'].update(value='not_relevant'),
            lambda row: row.update(label_source_ids=['invented-reference']),
            lambda row: row['versions'].update(rule='stale'),
            lambda row: row['research_safety'].update(aggregate_status='blocked'),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(mutation=index):
                corrupted = deepcopy(self.batch)
                mutate(corrupted['candidate_rows'][0])
                with self.assertRaises(ds.ValidationError):
                    ds.validate_batch(corrupted)

    def test_validator_rejects_family_split_leakage_and_missing_rows(self):
        corrupted = deepcopy(self.batch)
        corrupted['scenarios'][0]['split'] = 'test'
        with self.assertRaisesRegex(ds.ValidationError, 'Family split'):
            ds.validate_batch(corrupted)
        corrupted = deepcopy(self.batch)
        corrupted['candidate_rows'].pop()
        with self.assertRaisesRegex(ds.ValidationError, 'Missing candidate'):
            ds.validate_batch(corrupted)
        corrupted = deepcopy(self.batch)
        corrupted['candidate_rows'][1] = deepcopy(corrupted['candidate_rows'][0])
        with self.assertRaisesRegex(ds.ValidationError, 'Duplicate'):
            ds.validate_batch(corrupted)

    def test_missing_values_preserved_and_imported_contexts_rejected(self):
        scenario = self.scenario('missing_age_and_weight')
        self.assertIsNone(scenario['patient_features']['age_years'])
        self.assertIsNone(scenario['patient_features']['weight_kg'])
        missing = self.scenario('missing_duration_and_histories')
        self.assertIsNone(missing['patient_features']['onset_hours'])
        corrupted = deepcopy(self.batch)
        corrupted['scenarios'][0]['patient_features']['age_years'] += 1
        with self.assertRaisesRegex(ds.ValidationError, 'frozen synthetic templates'):
            ds.validate_batch(corrupted)
        corrupted = deepcopy(self.batch)
        corrupted['scenarios'][0]['patient_features']['weight_kg'] = True
        with self.assertRaises(ds.ValidationError):
            ds.validate_batch(corrupted)

    def test_artifacts_reproducible_and_manifest_tampering_rejected(self):
        with offline_test_directory() as output:
            ds.write_batch(output)
            first = {path.name: path.read_bytes() for path in output.iterdir()}
            self.assertEqual(ds.validate_artifacts(output)['validation'], 'passed')
            ds.write_batch(output)
            self.assertEqual(first, {path.name: path.read_bytes() for path in output.iterdir()})
            manifest = ds.read_json(output / 'manifest.json')
            manifest['input_sha256']['backend/prescription_drafts/engine.py'] = '0' * 64
            (output / 'manifest.json').write_bytes(ds.json_bytes(manifest))
            with self.assertRaisesRegex(ds.ValidationError, 'Manifest'):
                ds.validate_artifacts(output)

    def test_cli_rejects_corrupted_artifact_with_nonzero_exit(self):
        with offline_test_directory() as output:
            ds.write_batch(output)
            corrupted = ds.read_json(output / 'batch.json')
            corrupted['candidate_rows'][0]['clinical_review_status'] = 'reviewed'
            (output / 'batch.json').write_bytes(ds.json_bytes(corrupted))
            result = subprocess.run([sys.executable, str(ds.HERE / 'dataset.py'), 'validate', '--output', str(output)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertIn('Validation failed', result.stderr)

    def test_fresh_offline_process_cannot_import_django_or_database_drivers(self):
        script = '''
import sys
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[1])))
class NoClinicalRuntime:
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'django', 'sqlite3', 'psycopg', 'psycopg2', 'requests', 'urllib'}:
            raise AssertionError('Forbidden runtime import: ' + fullname)
sys.meta_path.insert(0, NoClinicalRuntime())
from prescription_research.dataset import build_batch, validate_batch
assert validate_batch(build_batch())['validation'] == 'passed'
print('offline-only verified')
'''
        result = subprocess.run([sys.executable, '-c', script, str(BACKEND)], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('offline-only verified', result.stdout)


if __name__ == '__main__':
    unittest.main()
