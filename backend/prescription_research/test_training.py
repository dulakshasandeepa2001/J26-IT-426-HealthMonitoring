"""Focused verification of fitted ML, split hygiene, provenance and controls."""

from copy import deepcopy
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
from prescription_research import categorical_tree as tree
from prescription_research import dataset as ds
from prescription_research import training_dataset as td
from prescription_research import train as training
from prescription_research.test_dataset import offline_test_directory


class LearnedTreeTests(unittest.TestCase):
    params = {'max_depth': 2, 'min_split_samples': 2, 'min_information_gain': 1e-12}

    def test_real_fit_changes_when_training_targets_change(self):
        X = [{'x': False}, {'x': True}, {'x': None}]
        first = tree.fit_model(X, ['absent', 'present', 'unknown'], ['x'], self.params | {'max_depth': 1})
        second = tree.fit_model(X, ['present', 'absent', 'unknown'], ['x'], self.params | {'max_depth': 1})
        self.assertEqual(tree.predict(first, {'x': True})['label'], 'present')
        self.assertEqual(tree.predict(second, {'x': True})['label'], 'absent')
        self.assertEqual(tree.predict(first, {'x': None})['label'], 'unknown')
        tree.validate_model(first, ['x'])
        self.assertGreater(first['root']['information_gain'], 0)

    def test_train_only_vocabulary_and_unseen_category_abstention(self):
        model = tree.fit_model([{'x': True}, {'x': False}], ['one', 'zero'], ['x'], self.params | {'max_depth': 1})
        self.assertNotIn('null', model['vocabulary']['x'])
        prediction = tree.predict(model, {'x': None})
        self.assertIsNone(prediction['label'])
        self.assertEqual(prediction['reason'], 'unseen_training_category')
        self.assertNotEqual(tree.token(False), tree.token(None))

    def test_unseen_local_branch_abstains_instead_of_guessing(self):
        X = [{'x': 'a', 'y': True}, {'x': 'a', 'y': False}, {'x': 'b', 'y': None},
             {'x': 'b', 'y': True}, {'x': 'b', 'y': False}]
        model = tree.fit_model(X, ['one', 'zero', 'third', 'third', 'third'], ['x', 'y'], self.params)
        prediction = tree.predict(model, {'x': 'a', 'y': None})
        self.assertIsNone(prediction['label'])
        self.assertEqual(prediction['reason'], 'unseen_learned_branch')

    def test_extra_teacher_field_and_insufficient_variation_fail(self):
        with self.assertRaises(ValueError):
            tree.fit_model([{'x': True, 'teacher_score': 1}, {'x': False, 'teacher_score': 0}], ['one', 'zero'], ['x'], self.params)
        with self.assertRaises(ValueError):
            tree.fit_model([{'x': True}, {'x': False}], ['one', 'one'], ['x'], self.params | {'max_depth': 1})

    def test_metrics_include_abstentions_in_agreement_denominator(self):
        result = training.metrics([{'expected': 'relevant', 'predicted': 'relevant'},
                                   {'expected': 'undetermined', 'predicted': None}])
        self.assertEqual(result['agreement_with_provisional_labels'], 0.5)
        self.assertEqual(result['errors_including_abstentions'], 1)
        self.assertIsNone(result['per_class']['not_relevant']['recall'])
        self.assertEqual(result['confusion_matrix']['undetermined']['abstained'], 1)


class OfflineTrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.batch = td.build_batch()
        cls.report = td.validate_batch(cls.batch)

    def test_expansion_counts_and_split_hygiene(self):
        self.assertEqual(self.report['counts'], {'synthetic_contexts': 168, 'candidate_rows': 672,
                                               'template_families': 28, 'base_scenarios': 56,
                                               'condition_mapped_rows': 405, 'unique_condition_mapped_inputs': 135})
        self.assertEqual(self.report['class_balance_condition_mapped_rows'], {'relevant': 261, 'not_relevant': 63, 'undetermined': 81})
        self.assertEqual(self.report['feature_vector_split_overlap'], 0)
        self.assertEqual(self.report['family_split_overlap'], 0)
        self.assertEqual(self.report['base_scenario_split_overlap'], 0)
        self.assertEqual([self.report['by_split'][split]['unique_condition_mapped_inputs'] for split in ('train', 'validation', 'test')], [85, 25, 25])
        for split in self.report['by_split'].values():
            self.assertEqual(set(split['unique_mapped_label_balance']), set(training.LABELS))

    def test_scope_and_safety_are_independent_of_fit_population(self):
        rows = td.mapped_rows(self.batch)
        self.assertTrue(any(row['relevance_target']['value'] == 'relevant' and row['research_safety']['aggregate_status'] == 'blocked' for row in rows))
        self.assertTrue(any(row['relevance_target']['value'] == 'relevant' and row['research_safety']['aggregate_status'] == 'cannot_validate' for row in rows))
        self.assertEqual(len(td.unique_rows(rows)), 135)
        for row in rows:
            self.assertEqual(row['clinical_review_status'], 'not_reviewed')
            self.assertFalse(row['research_safety']['review_gate_evaluated'])
            self.assertEqual(set(row['model_features']), set(self.report['feature_allowlist']))

    def test_schema_and_reproduction_reject_invented_reviews_facts_and_splits(self):
        different_split = 'validation' if self.batch['scenarios'][0]['split'] != 'validation' else 'train'
        for field, value in [('clinical_review_status', 'reviewed'), ('split', different_split), ('condition', 'invented')]:
            corrupted = deepcopy(self.batch)
            corrupted['scenarios'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ds.ValidationError):
                td.validate_batch(corrupted)
        corrupted = deepcopy(self.batch)
        corrupted['candidate_rows'][0]['model_features']['teacher_score'] = 1
        with self.assertRaises(ds.ValidationError):
            td.validate_batch(corrupted)

    def test_complete_offline_train_save_load_evaluate_reproducibly(self):
        with offline_test_directory() as base:
            data_dir, run_dir = base / 'data', base / 'run'
            data_dir.mkdir()
            run_dir.mkdir()
            try:
                td.write_batch(data_dir)
                first = training.train(data_dir, run_dir)
                artifact = training.load_model(data_dir, run_dir)
                self.assertEqual(first['fit_unique_inputs'], 85)
                self.assertEqual(artifact['learner']['training_unique_inputs'], 85)
                self.assertGreater(first['model_structure']['nodes'], 1)
                self.assertEqual(training.validate_run(data_dir, run_dir), first)
                saved = {path.name: path.read_bytes() for path in run_dir.iterdir()}
                training.train(data_dir, run_dir)
                self.assertEqual(saved, {path.name: path.read_bytes() for path in run_dir.iterdir()})
                # Exactly reproduce vocabulary from train features, never held-out rows.
                unique = td.unique_rows(training.split_rows(self.batch)['train'])
                expected_vocab = {name: sorted({tree.token(row['model_features'][name]) for row in unique})
                                  for name in artifact['learner']['feature_names']}
                self.assertEqual(artifact['learner']['vocabulary'], expected_vocab)
                unsupported = next(row for row in self.batch['candidate_rows'] if row['condition'] is None)
                contrast = next(row for row in self.batch['candidate_rows'] if row['research_safety']['evaluation_status'] == 'outside_condition_scope' and row['condition'] == 'influenza')
                blocked = next(row for row in self.batch['candidate_rows'] if row['relevance_target']['value'] == 'relevant' and row['research_safety']['aggregate_status'] == 'blocked')
                missing = next(row for row in self.batch['candidate_rows'] if row['relevance_target']['value'] == 'relevant' and row['research_safety']['aggregate_status'] == 'cannot_validate')
                with patch.object(tree, 'fit_model', side_effect=AssertionError('must not retrain during inference')):
                    for row in (unsupported, contrast, blocked, missing):
                        demo = training.predict_synthetic(row['scenario_id'], row['candidate_id'], data_dir, run_dir)
                        self.assertEqual(demo['deterministic_findings'], row['research_safety'])
                        self.assertFalse(demo['prescription_selection_enabled'])
                        self.assertFalse(demo['publication_enabled'])
                        self.assertEqual(demo['clinical_review_status'], 'not_reviewed')
                        if row in (unsupported, contrast):
                            self.assertIsNone(demo['provisional_relevance_prediction']['label'])
                        else:
                            self.assertEqual(demo['provisional_relevance_prediction']['label'], 'relevant')
                with self.assertRaises(ds.ValidationError):
                    training.predict_synthetic('patient-12', 'paracetamol-500mg-tablet', data_dir, run_dir)
                model_file = run_dir / 'model.json'
                corrupted = ds.read_json(model_file)
                corrupted['clinical_review_status'] = 'reviewed'
                model_file.write_bytes(ds.json_bytes(corrupted))
                with self.assertRaisesRegex(ds.ValidationError, 'hash mismatch'):
                    training.load_model(data_dir, run_dir)
            finally:
                # Only named, owned scratch children; no recursive deletion.
                for directory in (data_dir, run_dir):
                    self.assertEqual(directory.resolve().parent, base.resolve())
                    for child in directory.iterdir():
                        self.assertEqual(child.resolve().parent, directory.resolve())
                        child.unlink()
                    directory.rmdir()

    def test_stale_source_binding_fails_before_model_use(self):
        with offline_test_directory() as base:
            data_dir, run_dir = base / 'data', base / 'run'
            data_dir.mkdir()
            run_dir.mkdir()
            try:
                td.write_batch(data_dir)
                training.train(data_dir, run_dir)
                with patch.object(training, 'current_bindings', return_value={'changed': True}):
                    with self.assertRaisesRegex(ds.ValidationError, 'stale'):
                        training.load_model(data_dir, run_dir)
                manifest = ds.read_json(run_dir / 'manifest.json')
                manifest['publication_enabled'] = True
                (run_dir / 'manifest.json').write_bytes(ds.json_bytes(manifest))
                with self.assertRaisesRegex(ds.ValidationError, 'scope flags'):
                    training.load_model(data_dir, run_dir)
            finally:
                for directory in (data_dir, run_dir):
                    self.assertEqual(directory.resolve().parent, base.resolve())
                    for child in directory.iterdir():
                        self.assertEqual(child.resolve().parent, directory.resolve())
                        child.unlink()
                    directory.rmdir()

    def test_fresh_process_fits_without_clinical_runtime_or_extra_packages(self):
        script = '''
import sys
from pathlib import Path
sys.path.insert(0, str(Path(sys.argv[1])))
class OfflineOnly:
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'django', 'sqlite3', 'psycopg', 'psycopg2', 'requests', 'urllib', 'numpy', 'sklearn'}:
            raise AssertionError('Forbidden runtime import: ' + fullname)
sys.meta_path.insert(0, OfflineOnly())
from prescription_research import categorical_tree as tree, training_dataset as td, train
batch = td.build_batch()
report = td.validate_batch(batch)
rows = td.unique_rows(train.split_rows(batch)['train'])
model = tree.fit_model([row['model_features'] for row in rows], [row['relevance_target']['value'] for row in rows],
                       report['feature_allowlist'], td.plan()['hyperparameters'])
assert model['training_unique_inputs'] == 85
print('offline fit verified')
'''
        result = subprocess.run([sys.executable, '-c', script, str(BACKEND)], capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('offline fit verified', result.stdout)


if __name__ == '__main__':
    unittest.main()
