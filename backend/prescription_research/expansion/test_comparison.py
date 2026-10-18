"""Focused learned-state, train-only selection, sealed test and safety checks."""

from copy import deepcopy
import json
import unittest
from unittest.mock import patch

from prescription_research import categorical_tree as tree, dataset as ds
from prescription_research.test_dataset import offline_test_directory
from . import comparison as cp, knowledge as kn, learners, relevance as rv


class CategoricalLearnerTests(unittest.TestCase):
    parameters = {
        'categorical_tree': {'max_depth': 1, 'min_split_samples': 2, 'min_information_gain': 1e-12},
        'categorical_naive_bayes': {'alpha': 1.0},
        'hamming_knn': {'k': 1, 'boundary_ties': 'include_all_at_kth_distance', 'class_ties': 'alphabetical'},
    }

    def test_all_three_learn_from_labels_instead_of_teacher_or_medicine_rules(self):
        X = [{'x': True}, {'x': False}, {'x': None}]
        for algorithm, parameters in self.parameters.items():
            first = learners.fit(algorithm, X, ['one', 'zero', 'third'], ['x'], parameters)
            second = learners.fit(algorithm, X, ['zero', 'one', 'third'], ['x'], parameters)
            self.assertEqual(learners.predict(first, {'x': True})['label'], 'one')
            self.assertEqual(learners.predict(second, {'x': True})['label'], 'zero')
            learners.validate(first, ['x'])
            self.assertNotEqual(tree.token(None), tree.token(False))

    def test_no_test_vocabulary_or_null_to_false_imputation(self):
        for algorithm, parameters in self.parameters.items():
            model = learners.fit(algorithm, [{'x': True}, {'x': False}], ['yes', 'no'], ['x'], parameters)
            self.assertNotIn('null', model['vocabulary']['x'])
            result = learners.predict(model, {'x': None})
            self.assertIsNone(result['label'])
            self.assertEqual(result['reason'], 'unseen_training_category')

    def test_naive_bayes_counts_and_smoothing_are_fitted(self):
        X = [{'x': True}, {'x': True}, {'x': False}, {'x': False}]
        model = learners.fit('categorical_naive_bayes', X, ['a', 'a', 'a', 'b'], ['x'], {'alpha': 1.0})
        self.assertEqual(model['state']['class_counts'], {'a': 3, 'b': 1})
        self.assertEqual(model['state']['feature_counts']['a']['x'], {'bool:false': 1, 'bool:true': 2})
        # P(a)*P(true|a)=3/4*3/5 versus P(b)*P(true|b)=1/4*1/3.
        self.assertEqual(learners.predict(model, {'x': True})['label'], 'a')
        self.assertNotIn('probability', learners.predict(model, {'x': True}))

    def test_knn_includes_all_boundary_ties_without_row_order_bias(self):
        parameters = {'k': 2, 'boundary_ties': 'include_all_at_kth_distance', 'class_ties': 'alphabetical'}
        model = learners.fit('hamming_knn', [{'x': 'a'}, {'x': 'b'}, {'x': 'c'}], ['one', 'two', 'two'], ['x'], parameters)
        result = learners.predict(model, {'x': 'a'})
        self.assertEqual(result['evidence']['neighbor_count'], 3)
        self.assertEqual(result['label'], 'two')

    def test_extra_teacher_fields_missing_classes_and_invalid_parameters_fail(self):
        for algorithm, parameters in self.parameters.items():
            with self.assertRaises(ValueError):
                learners.fit(algorithm, [{'x': True, 'teacher_score': 1}, {'x': False, 'teacher_score': 0}], ['a', 'b'], ['x'], parameters)
            with self.assertRaises(ValueError):
                learners.fit(algorithm, [{'x': True}, {'x': False}], ['a', 'a'], ['x'], parameters)
        with self.assertRaises(ValueError):
            learners.fit('categorical_naive_bayes', [{'x': True}, {'x': False}], ['a', 'b'], ['x'], {'alpha': float('nan')})
        with self.assertRaises(ValueError):
            learners.fit('hamming_knn', [{'x': True}, {'x': False}], ['a', 'b'], ['x'], {'k': True, 'boundary_ties': 'include_all_at_kth_distance', 'class_ties': 'alphabetical'})

    def test_stored_count_tampering_and_unknown_learners_fail_validation(self):
        for algorithm, parameters in self.parameters.items():
            model = learners.fit(algorithm, [{'x': True}, {'x': False}], ['yes', 'no'], ['x'], parameters)
            bad = deepcopy(model)
            bad['training_inputs'] = 999
            with self.assertRaises(ValueError):
                learners.validate(bad, ['x'])
            bad = deepcopy(model)
            bad['algorithm'] = 'invented'
            with self.assertRaises(ValueError):
                learners.validate(bad, ['x'])


class ThreeModelComparisonTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = offline_test_directory()
        cls.output = cls.directory.__enter__()
        cls.addClassCleanup(cls.directory.__exit__, None, None, None)
        cls.batch = ds.read_json(rv.DEFAULT_OUTPUT / 'batch.json')
        cls.partitions = cp.mapped_partitions(cls.batch)
        cls.report = cp.train(output=cls.output)
        cls.models = ds.read_json(cls.output / 'models.json')

    def test_actual_fit_population_and_identical_family_partitions(self):
        self.assertEqual(self.report['fit_unique_inputs'], 27)
        self.assertEqual(self.report['fit_class_balance'], {'relevant': 13, 'not_relevant': 7, 'undetermined': 7})
        self.assertEqual(set(self.models), set(learners.ALGORITHMS))
        self.assertEqual(self.report['coverage_audit'], {'total_rows': 360, 'mapped_rows': 81,
            'contrast_rows_outside_fitted_task': 243, 'unsupported_rows_outside_fitted_task': 36})
        self.assertEqual(len(cp.unique_rows(self.partitions['validation'])), 26)
        self.assertEqual(len(cp.unique_rows(self.partitions['test'])), 27)

    def test_preprocessing_is_fitted_only_on_training_features(self):
        training = cp.unique_rows(self.partitions['train'])
        vocabulary = {name: sorted({tree.token(row['model_features'][name]) for row in training}) for name in rv.FEATURES}
        for artifact in self.models.values():
            self.assertEqual(artifact['learner']['vocabulary'], vocabulary)
            self.assertEqual(artifact['learner']['feature_names'], list(rv.FEATURES))
            self.assertEqual(artifact['learner']['training_inputs'], 27)

    def test_validation_ranking_selects_model_without_test_scores(self):
        settings = cp.plan()
        def rank(name):
            data = self.report['validation_candidates'][name]
            return (data['novel_mapped_unique']['macro_f1'], data['novel_mapped_unique']['prediction_coverage'],
                    data['all_mapped_unique']['agreement_with_provisional_labels'])
        expected = max([item['id'] for item in settings['candidates']], key=rank)
        self.assertEqual(self.report['selected_model'], expected)
        self.assertFalse(self.report['selection']['test_used_for_selection'])
        self.assertFalse(self.report['selection']['refitted_on_validation'])
        self.assertEqual(self.report['test_models_evaluated'], [expected])
        self.assertTrue(all(row_id in {r['row_id'] for r in self.partitions['validation']} for row_id in self.report['selection']['validation_row_ids']))

    def test_freeze_is_written_before_only_selected_model_sees_test(self):
        actual = cp.frozen_test_evaluation
        with offline_test_directory() as output:
            def observe(artifact, rows, keys):
                selection = ds.read_json(output / 'selection.json')
                self.assertEqual(ds.read_json(output / 'selected_model.json'), artifact)
                self.assertEqual(selection['selected_model'], artifact['algorithm'])
                self.assertEqual(selection['selected_artifact_sha256'], ds.content_hash(artifact))
                self.assertEqual({row['split'] for row in rows}, {'test'})
                return actual(artifact, rows, keys)
            with patch.object(cp, 'frozen_test_evaluation', side_effect=observe) as observed:
                cp.train(output=output)
                self.assertEqual(observed.call_count, 1)

    def test_reuse_and_verification_do_not_retrain_or_repredict_test(self):
        with patch.object(learners, 'fit', side_effect=AssertionError('No refit')), patch.object(learners, 'predict', side_effect=AssertionError('No test repeat')):
            self.assertEqual(cp.train(output=self.output), self.report)
            self.assertEqual(cp.verify_run(output=self.output), self.report)

    def test_selection_refuses_test_rows_and_missing_validation_class_variation(self):
        settings = cp.plan()
        models = {name: value['learner'] for name, value in self.models.items()}
        keys = {rv.feature_key(row) for row in self.partitions['train']}
        with self.assertRaises(ValueError):
            cp.select_on_validation(models, self.partitions['test'], keys, settings)
        with self.assertRaises(ValueError):
            cp.select_on_validation(models, [r for r in self.partitions['validation'] if r['relevance_target']['value'] == 'relevant'], keys, settings)
        with self.assertRaises(ValueError):
            cp.fit_candidates(self.partitions['validation'], settings)

    def test_metrics_penalize_abstentions_and_zero_predicted_classes(self):
        records = [{'expected': 'not_relevant', 'predicted': None}, {'expected': 'relevant', 'predicted': 'relevant'},
                   {'expected': 'undetermined', 'predicted': 'relevant'}]
        value = cp.metrics(records)
        self.assertEqual(value['inputs'], 3)
        self.assertEqual(value['errors_including_abstentions'], 2)
        self.assertAlmostEqual(value['prediction_coverage'], 2 / 3)
        self.assertEqual(value['per_class']['not_relevant']['f1'], 0)
        self.assertEqual(value['per_class']['undetermined']['f1'], 0)
        self.assertAlmostEqual(value['macro_f1'], 2 / 9)
        self.assertIsNone(cp.metrics([])['macro_f1'])

    def test_overlap_novel_support_and_small_group_limits_are_visible(self):
        for name in self.models:
            value = self.report['validation_candidates'][name]
            self.assertEqual(value['all_mapped_unique']['inputs'], 26)
            self.assertEqual(value['novel_mapped_unique']['inputs'], 16)
            self.assertEqual(value['seen_in_training_unique']['inputs'], 10)
        test = self.report['selected_model_test']
        self.assertEqual((test['all_mapped_unique']['inputs'], test['novel_mapped_unique']['inputs'], test['seen_in_training_unique']['inputs']), (27, 16, 11))
        self.assertTrue(all(g['within_group_ranking'] == 'not_meaningful_single_candidate' for g in test['by_group_unique'].values()))
        self.assertTrue(any(g['discrimination_support'] == 'insufficient_target_variation' for g in test['by_group_unique'].values()))

    def test_confusion_matrices_and_saved_errors_match_actual_predictions(self):
        predictions = ds.read_json(self.output / 'predictions.json')
        rows = predictions['test']['records']
        self.assertEqual(cp.metrics(cp.unique_records(rows)), self.report['selected_model_test']['all_mapped_unique'])
        errors = ds.read_json(self.output / 'errors.json')
        self.assertEqual(len(errors), self.report['error_or_abstention_records'])
        self.assertEqual(sum(item['split'] == 'test' for item in errors), self.report['selected_model_test']['all_mapped_unique']['errors_including_abstentions'])

    def test_prediction_requires_explicit_synthetic_flag_and_known_fixture(self):
        row = self.partitions['test'][0]
        with self.assertRaises(ValueError):
            cp.predict_synthetic(row['scenario_id'], row['candidate_id'], output=self.output)
        with self.assertRaises(ValueError):
            cp.predict_synthetic('live-patient-12', row['candidate_id'], enabled=True, output=self.output)

    def test_saved_inference_does_not_fit_and_preserves_ors_identity_block(self):
        row = next(r for r in self.batch['candidate_rows'] if r['condition'] == 'viral_gastroenteritis'
                   and r['candidate_id'] == kn.ORS and r['template_family'] == 'acute_multi_symptom')
        with patch.object(learners, 'fit', side_effect=AssertionError('Never fit during inference')):
            value = cp.predict_synthetic(row['scenario_id'], row['candidate_id'], enabled=True, output=self.output)
        self.assertEqual(value['presentation_label'], 'Experimental ML')
        self.assertEqual(value['clinical_review_status'], 'not_reviewed')
        self.assertEqual(value['deterministic_safety']['aggregate_status'], 'blocked')
        self.assertFalse(value['prescription_eligible'])
        self.assertFalse(value['published'])
        self.assertFalse(value['medical_confidence_calibrated'])
        self.assertNotIn('confidence', value['provisional_prediction'])

    def test_unsupported_and_unmapped_candidates_abstain_outside_fitted_task(self):
        for status in ('unsupported_condition', 'unmapped'):
            row = next(r for r in self.batch['candidate_rows'] if r['mapping_status'] == status)
            result = cp.predict_synthetic(row['scenario_id'], row['candidate_id'], enabled=True, output=self.output)
            self.assertIsNone(result['provisional_prediction']['label'])
            self.assertEqual(result['provisional_prediction']['reason'], 'outside_fitted_condition_purpose_task')

    def test_unknown_safety_stays_unknown_even_when_model_predicts(self):
        row = next(r for r in self.batch['candidate_rows'] if r['mapping_status'] == 'mapped'
                   and r['research_safety']['aggregate_status'] == 'cannot_validate')
        result = cp.predict_synthetic(row['scenario_id'], row['candidate_id'], enabled=True, output=self.output)
        self.assertEqual(result['deterministic_safety'], row['research_safety'])
        self.assertFalse(result['prescription_eligible'])

    def test_model_metadata_never_claims_clinical_review_or_api_activation(self):
        for value in self.models.values():
            self.assertEqual(value['clinical_review_status'], 'not_reviewed')
            self.assertEqual(value['label_provenance']['label_method'], 'rule_derived')
            self.assertTrue(value['deterministic_controls_required'])
            for key in ('medical_confidence_calibrated', 'api_enabled', 'prescription_selection_enabled', 'approved', 'publication_enabled'):
                self.assertFalse(value[key])

    def test_frozen_models_and_result_bytes_reject_tampering(self):
        with offline_test_directory() as output:
            for source in self.output.iterdir():
                (output / source.name).write_bytes(source.read_bytes())
            path = output / 'selected_model.json'
            value = json.loads(path.read_text(encoding='utf-8'))
            value['clinical_review_status'] = 'reviewed'
            path.write_bytes(ds.json_bytes(value))
            with self.assertRaises(ValueError):
                cp.verify_run(output=output)

    def test_changed_code_or_dataset_cannot_silently_overwrite_completed_experiment(self):
        original = ds.file_hash
        def changed(path):
            return '0' * 64 if str(path).endswith('comparison_plan.json') else original(path)
        with patch.object(ds, 'file_hash', side_effect=changed), self.assertRaises(ValueError):
            cp.train(output=self.output)

    def test_partial_freeze_is_not_overwritten_or_retested(self):
        with offline_test_directory() as output:
            (output / 'selected_model.json').write_text('{}', encoding='utf-8')
            with self.assertRaises(ValueError):
                cp.train(output=output)


if __name__ == '__main__':
    unittest.main()
