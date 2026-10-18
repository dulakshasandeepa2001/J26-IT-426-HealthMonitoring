"""Three-model offline experiment on frozen synthetic purpose-relevance labels.

No Django, live-patient input, package installation, API training or publication.
Validation selects the model. Only that frozen choice is evaluated on test.
"""

import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import platform

from prescription_research import categorical_tree as tree, dataset as ds
from . import knowledge as kn, learners, relevance as rv

HERE = Path(__file__).resolve().parent
PLAN_PATH = HERE / 'comparison_plan.json'
DEFAULT_OUTPUT = ds.ROOT / 'docs/research/six_condition_model_comparison_v1'
VERSION = 'six-condition-three-model-comparison-2026-10-16-v1'
LABELS = ('not_relevant', 'relevant', 'undetermined')
SOURCE_PATHS = rv.INPUT_PATHS + (
    'backend/prescription_research/categorical_tree.py',
    'backend/prescription_research/expansion/learners.py',
    'backend/prescription_research/expansion/comparison.py',
    'backend/prescription_research/expansion/comparison_plan.json',
)


def plan():
    value = ds.read_json(PLAN_PATH)
    ds.require(set(value) == {'experiment_version', 'dataset_version', 'presentation_label', 'clinical_review_status',
        'label_method', 'fit_population', 'preprocessing', 'candidates', 'hyperparameter_search', 'selection', 'prediction_policy', 'interpretation'}, 'Unknown experiment metadata/approval fields.')
    ds.require(value['experiment_version'] == VERSION and value['dataset_version'] == rv.VERSION
        and value['presentation_label'] == 'Experimental ML' and value['clinical_review_status'] == 'not_reviewed'
        and value['label_method'] == 'rule_derived', 'Experiment task/provenance mismatch.')
    ds.require(value['fit_population'] == 'unique_condition_mapped_training_inputs_only', 'Unexpected fit population.')
    ds.require([c['id'] for c in value['candidates']] == list(learners.ALGORITHMS)
        and all(set(c) == {'id', 'parameters'} for c in value['candidates']), 'Expected exactly three declared configurations.')
    ds.require(value['selection'] == {
        'primary': 'validation_novel_mapped_unique_macro_f1', 'secondary': 'validation_novel_mapped_unique_prediction_coverage',
        'tertiary': 'validation_all_mapped_unique_agreement', 'remaining_tie': 'declared_candidate_order',
        'missing_class_policy': 'require_all_three_provisional_classes_in_primary_validation_subset',
        'refit_on_validation': False, 'test_policy': 'evaluate_only_the_validation_selected_frozen_model; do_not_compare_test_models'},
        'Selection policy changed; a new experiment version is required.')
    return value


def load_data(data_dir):
    report = rv.validate_artifacts(data_dir)
    batch = ds.read_json(Path(data_dir) / 'batch.json')
    return batch, report


def unique_rows(rows):
    seen = {}
    for row in rows:
        key = rv.feature_key(row)
        if key in seen:
            ds.require(row['relevance_target'] == seen[key]['relevance_target'], 'Conflicting labels on identical inputs.')
        else:
            seen[key] = row
    return list(seen.values())


def mapped_partitions(batch):
    return {split: [row for row in batch['candidate_rows'] if row['split'] == split and row['mapping_status'] == 'mapped']
            for split in ('train', 'validation', 'test')}


def fit_candidates(training_rows, settings):
    ds.require(training_rows and {row['split'] for row in training_rows} == {'train'}
        and {row['mapping_status'] for row in training_rows} == {'mapped'}, 'Only declared mapped training families may enter fitting.')
    rows = unique_rows(training_rows)
    X, y = [r['model_features'] for r in rows], [r['relevance_target']['value'] for r in rows]
    ds.require(set(y) == set(LABELS), 'Insufficient training class variation; do not force three-class metrics.')
    models = {}
    for candidate in settings['candidates']:
        model = learners.fit(candidate['id'], X, y, rv.FEATURES, candidate['parameters'])
        learners.validate(model, rv.FEATURES)
        models[candidate['id']] = model
    return models, rows


def metrics(records):
    confusion = {label: {predicted: 0 for predicted in (*LABELS, 'abstained')} for label in LABELS}
    for record in records:
        ds.require(record['expected'] in LABELS and record['predicted'] in (*LABELS, None), 'Unknown metric class.')
        confusion[record['expected']][record['predicted'] or 'abstained'] += 1
    classes = {}
    for label in LABELS:
        tp = confusion[label][label]
        support, predicted = sum(confusion[label].values()), sum(confusion[actual][label] for actual in LABELS)
        classes[label] = {'support': support, 'predicted_count': predicted,
            'precision': tp / predicted if predicted else None, 'recall': tp / support if support else None,
            # A supported class with zero predictions has F1=0, not an omitted class.
            'f1': 2 * tp / (support + predicted) if support else None}
    supported = [label for label in LABELS if classes[label]['support']]
    correct = sum(confusion[label][label] for label in LABELS)
    abstentions = sum(confusion[label]['abstained'] for label in LABELS)
    return {'inputs': len(records), 'class_balance': dict(sorted(Counter(r['expected'] for r in records).items())),
        'correct': correct, 'errors_including_abstentions': len(records) - correct, 'abstentions': abstentions,
        'agreement_with_provisional_labels': correct / len(records) if records else None,
        'prediction_coverage': (len(records) - abstentions) / len(records) if records else None,
        'macro_f1': sum(classes[label]['f1'] for label in supported) / len(supported) if supported else None,
        'macro_f1_supported_labels': supported, 'per_class': classes, 'confusion_matrix': confusion,
        'measurement': 'agreement_with_rule_derived_labels_only'}


def prediction_records(model, rows):
    records = []
    for row in rows:
        prediction = learners.predict(model, row['model_features'])
        records.append({key: row[key] for key in ('row_id', 'scenario_id', 'template_family', 'condition', 'candidate_id', 'group_key')} | {
            'feature_sha256': rv.feature_key(row), 'expected': row['relevance_target']['value'], 'predicted': prediction['label'],
            'prediction_status': prediction['status'], 'reason': prediction['reason'], 'evidence': prediction['evidence']})
    return records


def unique_records(records):
    return list({record['feature_sha256']: record for record in reversed(records)}.values())


def partition_report(records, training_keys):
    unique = unique_records(records)
    novel = [r for r in unique if r['feature_sha256'] not in training_keys]
    seen = [r for r in unique if r['feature_sha256'] in training_keys]
    groups = {}
    for group in sorted({r['group_key'] for r in unique}):
        local = [r for r in unique if r['group_key'] == group]
        groups[group] = metrics(local) | {'candidate_ids': sorted({r['candidate_id'] for r in local}),
            'target_classes': sorted({r['expected'] for r in local}),
            'discrimination_support': 'insufficient_target_variation' if len({r['expected'] for r in local}) < 2 else 'small_provisional_sample',
            'within_group_ranking': 'not_meaningful_single_candidate'}
    return {'all_mapped_rows': metrics(records), 'all_mapped_unique': metrics(unique),
        'novel_mapped_unique': metrics(novel), 'seen_in_training_unique': metrics(seen),
        'by_condition_unique': {condition: metrics([r for r in unique if r['condition'] == condition]) for condition in kn.CONDITIONS},
        'by_group_unique': groups}


def select_on_validation(models, validation_rows, training_keys, settings):
    ds.require(validation_rows and {row['split'] for row in validation_rows} == {'validation'}, 'Selection must receive validation rows only.')
    reports, predictions = {}, {}
    for candidate in settings['candidates']:
        identity = candidate['id']
        predictions[identity] = prediction_records(models[identity], validation_rows)
        reports[identity] = partition_report(predictions[identity], training_keys)
        primary = reports[identity]['novel_mapped_unique']
        ds.require(set(primary['class_balance']) == set(LABELS), 'Primary validation subset lacks class variation; selection cannot be justified.')
    def order(identity):
        primary = reports[identity]['novel_mapped_unique']
        return primary['macro_f1'], primary['prediction_coverage'], reports[identity]['all_mapped_unique']['agreement_with_provisional_labels']
    # max retains declared candidate order on an exact tie, without test data.
    selected = max([c['id'] for c in settings['candidates']], key=order)
    return selected, reports, predictions


def artifact(model, batch, data_dir):
    return {'artifact_version': '1.0', 'experiment_version': VERSION, 'presentation_label': 'Experimental ML',
        'algorithm': model['algorithm'], 'learner': model, 'dataset_version': rv.VERSION,
        'dataset_manifest_sha256': ds.file_hash(Path(data_dir) / 'manifest.json'),
        'label_provenance': {'label_method': 'rule_derived', 'criteria_version': rv.configuration()[0]['version'],
            'source': 'researcher_defined_source_informed_criteria', 'independent_clinical_validation': False},
        'clinical_review_status': 'not_reviewed', 'supported_conditions': list(kn.CONDITIONS),
        'candidate_definitions': deepcopy(batch['candidate_definitions']), 'medical_confidence_calibrated': False,
        'deterministic_controls_required': True, 'synthetic_only': True, 'api_enabled': False,
        'prescription_selection_enabled': False, 'approved': False, 'publication_enabled': False}


def frozen_test_evaluation(selected_artifact, test_rows, training_keys):
    ds.require(test_rows and {row['split'] for row in test_rows} == {'test'}, 'Final evaluation must receive test only.')
    records = prediction_records(selected_artifact['learner'], test_rows)
    return partition_report(records, training_keys), records


def markdown_report(report):
    def fmt(value):
        return 'not measured' if value is None else f'{value:.4f}'
    lines = ['# Six-condition three-model comparison', '',
        '**Experimental ML: provisional rule-derived labels, clinical review not_reviewed.**', '',
        f'Fitted on {report["fit_unique_inputs"]} unique mapped training inputs from the unchanged inspection batch. No extra packages.', '',
        '## Validation selection', '',
        'Primary: macro F1 on 16 unique validation inputs absent from training; secondary coverage; tertiary all-mapped validation agreement. No test-based selection.', '',
        '| Model | Novel validation macro F1 | Novel agreement | Novel coverage | All unique validation agreement |',
        '| --- | ---: | ---: | ---: | ---: |']
    for name, values in report['validation_candidates'].items():
        primary = values['novel_mapped_unique']
        lines.append(f'| {name} | {fmt(primary["macro_f1"])} | {fmt(primary["agreement_with_provisional_labels"])} | {fmt(primary["prediction_coverage"])} | {fmt(values["all_mapped_unique"]["agreement_with_provisional_labels"])} |')
    test = report['selected_model_test']
    lines.extend(['', f'**Validation-selected model: `{report["selected_model"]}`.** No refit on validation.', '',
        '## Frozen selected model: held-out test', '',
        '| Subset | Inputs | Agreement with provisional labels | Macro F1 | Errors including abstentions | Abstentions |',
        '| --- | ---: | ---: | ---: | ---: | ---: |'])
    for key in ('all_mapped_rows', 'all_mapped_unique', 'novel_mapped_unique', 'seen_in_training_unique'):
        value = test[key]
        lines.append(f'| {key} | {value["inputs"]} | {fmt(value["agreement_with_provisional_labels"])} | {fmt(value["macro_f1"])} | {value["errors_including_abstentions"]} | {value["abstentions"]} |')
    lines.extend(['', 'Only the selected model was tested. These values measure imitation of the generating rules, not clinical accuracy or superiority.', '',
        '## Baseline and coverage', '',
        f'Training-majority class: `{report["training_majority_class"]}`. Selected-test novel agreement for that baseline: {fmt(report["training_majority_test"]["novel_mapped_unique"]["agreement_with_provisional_labels"])}.',
        f'Coverage audit: `{json.dumps(report["coverage_audit"], sort_keys=True)}`. Contrast/unsupported rows were not fitted or used as easy negative metric cases.', '',
        'Per-class precision/recall/F1, confusion matrices, condition/purpose support, learned paths/neighbor support and every error/abstention are in the JSON artifacts.', '',
        '## Limits', '', *['- ' + value for value in report['limitations']], '',
        'See backend/prescription_context/STEP8D.md for commands, algorithms and synthetic-only inference.', ''])
    return '\n'.join(lines).encode('utf-8')


def summary(report):
    return {'experiment_version': VERSION, 'selected_model': report['selected_model'], 'fit_unique_inputs': report['fit_unique_inputs'],
        'validation_novel_macro_f1': {name: data['novel_mapped_unique']['macro_f1'] for name, data in report['validation_candidates'].items()},
        'test_unique_agreement': report['selected_model_test']['all_mapped_unique']['agreement_with_provisional_labels'],
        'test_novel_agreement': report['selected_model_test']['novel_mapped_unique']['agreement_with_provisional_labels'],
        'test_novel_macro_f1': report['selected_model_test']['novel_mapped_unique']['macro_f1'],
        'clinical_review_status': 'not_reviewed', 'independent_clinical_validation': False}


def train(data_dir=rv.DEFAULT_OUTPUT, output=DEFAULT_OUTPUT):
    data_dir, output = Path(data_dir), Path(output)
    if (output / 'manifest.json').exists():
        return verify_run(data_dir, output)  # Reuse a completed frozen run; do not retest/retrain.
    ds.require(not output.exists() or not any(output.iterdir()), 'Incomplete experiment directory; use a separate output directory rather than overwriting a freeze.')
    settings = plan()
    batch, data_report = load_data(data_dir)
    partitions = mapped_partitions(batch)
    models, training_rows = fit_candidates(partitions['train'], settings)
    training_keys = {rv.feature_key(row) for row in training_rows}
    selected, validation_reports, validation_predictions = select_on_validation(models, partitions['validation'], training_keys, settings)
    training_predictions = {name: prediction_records(model, partitions['train']) for name, model in models.items()}
    all_models = {name: artifact(model, batch, data_dir) for name, model in models.items()}
    selected_artifact = all_models[selected]
    selection = {'experiment_version': VERSION, 'selected_model': selected, 'criterion': settings['selection'],
        'selected_artifact_sha256': ds.content_hash(selected_artifact), 'test_used_for_selection': False,
        'refitted_on_validation': False, 'fit_row_ids': [row['row_id'] for row in training_rows],
        'validation_row_ids': [row['row_id'] for row in unique_rows(partitions['validation'])],
        'validation_results': {name: {'primary_macro_f1': values['novel_mapped_unique']['macro_f1'],
            'primary_coverage': values['novel_mapped_unique']['prediction_coverage'],
            'all_unique_agreement': values['all_mapped_unique']['agreement_with_provisional_labels']} for name, values in validation_reports.items()}}
    output.mkdir(parents=True, exist_ok=True)
    # The selected model and selection record exist before any test prediction.
    frozen_files = {'models.json': ds.json_bytes(all_models), 'selected_model.json': ds.json_bytes(selected_artifact),
                    'selection.json': ds.json_bytes(selection), 'plan.json': PLAN_PATH.read_bytes()}
    for name, content in frozen_files.items():
        (output / name).write_bytes(content)
    frozen = ds.read_json(output / 'selected_model.json')
    ds.require(ds.content_hash(frozen) == selection['selected_artifact_sha256'], 'Frozen selected model mismatch.')
    test_report, test_predictions = frozen_test_evaluation(frozen, partitions['test'], training_keys)
    majority = max(LABELS, key=lambda label: sum(row['relevance_target']['value'] == label for row in training_rows))
    majority_records = [dict(record, predicted=majority) for record in test_predictions]
    predictions = {'training': training_predictions, 'validation': validation_predictions,
                   'test': {'model': selected, 'records': test_predictions}}
    errors = []
    for split, group in (('train', training_predictions), ('validation', validation_predictions), ('test', {selected: test_predictions})):
        for name, records in group.items():
            errors.extend(dict(record, split=split, model=name) for record in unique_records(records) if record['expected'] != record['predicted'])
    report = {'experiment_version': VERSION, 'presentation_label': 'Experimental ML', 'model_trained': True,
        'clinical_review_status': 'not_reviewed', 'label_method': 'rule_derived', 'baseline_type': 'experimental_rule_imitation',
        'dataset_counts': data_report['counts'], 'dataset_splits': data_report['by_split'], 'fit_unique_inputs': len(training_rows),
        'fit_class_balance': dict(sorted(Counter(row['relevance_target']['value'] for row in training_rows).items())),
        'feature_allowlist': list(rv.FEATURES), 'preprocessing_fit_population': 'training_only',
        'training_candidates': {name: partition_report(records, training_keys) for name, records in training_predictions.items()},
        'validation_candidates': validation_reports, 'selected_model': selected, 'selection': selection,
        'selected_model_test': test_report, 'test_models_evaluated': [selected],
        'training_majority_class': majority, 'training_majority_test': partition_report(majority_records, training_keys),
        'coverage_audit': {'total_rows': len(batch['candidate_rows']), 'mapped_rows': sum(len(rows) for rows in partitions.values()),
            'contrast_rows_outside_fitted_task': data_report['counts']['contrast_rows'],
            'unsupported_rows_outside_fitted_task': data_report['counts']['unsupported_condition_rows']},
        'error_or_abstention_records': len(errors), 'constant_target_groups': data_report['constant_target_groups'],
        'family_split_overlap': False, 'exact_input_overlap': data_report['split_overlap_inputs'],
        'medical_confidence_calibrated': False, 'independent_clinical_validation': False,
        'api_enabled': False, 'prescription_eligible_predictions': 0, 'publication_enabled': False,
        'runtime': {'python': platform.python_version(), 'implementation': platform.python_implementation(), 'third_party_ml_packages_required': []},
        'limitations': data_report['limitations'] + [
            'Twenty-seven unique mapped training inputs and sixteen novel validation/test inputs are too small for a clinical generalization claim.',
            'Validation chooses among three fixed configurations; validation results are selection data, not an independent final estimate.',
            'Only the frozen validation-selected model is tested; no test-based model or parameter selection or validation refitting.',
            'The stdlib learners are explicit experimental implementations, not scikit-learn estimators or a production benchmark.',
            'Categorical token vocabularies are learned from training only. Unseen categories/branches abstain; supported-class abstentions count as errors/FN.',
            'Uncalibrated internal Bayes scores and neighbor votes are not medical confidence and are not exposed as such.',
            'No learned prediction clears deterministic blocks or unknowns, changes review status, or authorizes a prescription.']}
    files = frozen_files | {'evaluation.json': ds.json_bytes(report), 'evaluation.md': markdown_report(report),
        'predictions.json': ds.json_bytes(predictions), 'errors.json': ds.json_bytes(errors)}
    manifest = {'experiment_version': VERSION, 'source_hashes': {name: ds.file_hash(ds.ROOT / name) for name in SOURCE_PATHS},
        'data_manifest_sha256': ds.file_hash(data_dir / 'manifest.json'),
        'dataset_output_hashes': ds.read_json(data_dir / 'manifest.json')['outputs'],
        'artifact_hashes': {name: hashlib.sha256(content).hexdigest() for name, content in files.items()},
        'clinical_review_status': 'not_reviewed', 'fitted_training_rows': len(training_rows)}
    for name, content in files.items():
        (output / name).write_bytes(content)
    (output / 'manifest.json').write_bytes(ds.json_bytes(manifest))
    return report


def verify_run(data_dir=rv.DEFAULT_OUTPUT, output=DEFAULT_OUTPUT):
    """Read-only verification. No fitting or repeat model/test prediction."""
    data_dir, output = Path(data_dir), Path(output)
    manifest = ds.read_json(output / 'manifest.json')
    ds.require(manifest['experiment_version'] == VERSION and manifest['clinical_review_status'] == 'not_reviewed', 'Experiment provenance mismatch.')
    ds.require(manifest['source_hashes'] == {name: ds.file_hash(ds.ROOT / name) for name in SOURCE_PATHS}, 'Code/plan/source changed: preserve this experiment and create a new version.')
    ds.require(manifest['data_manifest_sha256'] == ds.file_hash(data_dir / 'manifest.json'), 'Dataset manifest changed.')
    data_manifest = ds.read_json(data_dir / 'manifest.json')
    ds.require(manifest['dataset_output_hashes'] == data_manifest['outputs'], 'Dataset artifact registry changed.')
    for name, digest in manifest['dataset_output_hashes'].items():
        ds.require(ds.file_hash(data_dir / name) == digest, 'Frozen dataset file changed: ' + name)
    expected_files = {'models.json', 'selected_model.json', 'selection.json', 'plan.json', 'evaluation.json', 'evaluation.md', 'predictions.json', 'errors.json'}
    ds.require(set(manifest['artifact_hashes']) == expected_files, 'Unexpected experiment artifact list.')
    for name, digest in manifest['artifact_hashes'].items():
        ds.require(ds.file_hash(output / name) == digest, 'Frozen model/result changed: ' + name)
    settings, batch = plan(), ds.read_json(data_dir / 'batch.json')
    models, selected, selection = ds.read_json(output / 'models.json'), ds.read_json(output / 'selected_model.json'), ds.read_json(output / 'selection.json')
    partitions = mapped_partitions(batch)
    training_rows = unique_rows(partitions['train'])
    ds.require(set(models) == set(learners.ALGORITHMS), 'Expected three fitted model artifacts.')
    vocabulary = {name: sorted({tree.token(row['model_features'][name]) for row in training_rows}) for name in rv.FEATURES}
    for name, value in models.items():
        learners.validate(value['learner'], rv.FEATURES)
        ds.require(value == artifact(value['learner'], batch, data_dir) and value['algorithm'] == name, 'Model provenance/safety metadata drift.')
        ds.require(value['learner']['vocabulary'] == vocabulary and value['learner']['training_inputs'] == len(training_rows), 'Training-only preprocessing/support drift.')
    ds.require(selected == models[selection['selected_model']] and ds.content_hash(selected) == selection['selected_artifact_sha256'], 'Selected model freeze mismatch.')
    ds.require(selection['criterion'] == settings['selection'] and selection['test_used_for_selection'] is False
        and selection['refitted_on_validation'] is False and selection['fit_row_ids'] == [r['row_id'] for r in training_rows], 'Selection protocol drift.')
    report = ds.read_json(output / 'evaluation.json')
    ds.require(report['selection'] == selection and report['test_models_evaluated'] == [selected['algorithm']], 'Test audit mismatch.')
    return report


def predict_synthetic(scenario_id, candidate_id, *, enabled=False, data_dir=rv.DEFAULT_OUTPUT, output=DEFAULT_OUTPUT):
    ds.require(enabled is True, 'Explicit --enable-synthetic-demo is required.')
    verify_run(data_dir, output)
    batch = ds.read_json(Path(data_dir) / 'batch.json')
    row = next((r for r in batch['candidate_rows'] if r['scenario_id'] == scenario_id and r['candidate_id'] == candidate_id), None)
    ds.require(row is not None and row['synthetic_only'] is True, 'Choose an existing frozen synthetic scenario/candidate; no live or arbitrary input is accepted.')
    selected = ds.read_json(Path(output) / 'selected_model.json')
    prediction = (learners.predict(selected['learner'], row['model_features']) if row['mapping_status'] == 'mapped' else
                  {'label': None, 'status': 'abstained', 'reason': 'outside_fitted_condition_purpose_task', 'unseen_features': [], 'evidence': {}})
    return {'presentation_label': 'Experimental ML', 'experiment_version': VERSION, 'algorithm': selected['algorithm'],
        'dataset_version': rv.VERSION, 'scenario_id': scenario_id, 'candidate_id': candidate_id,
        'provisional_prediction': prediction, 'label_provenance': selected['label_provenance'],
        'deterministic_safety': deepcopy(row['research_safety']), 'clinical_review_status': 'not_reviewed',
        'medical_confidence_calibrated': False, 'synthetic_only': True, 'live_patient_data_used': False,
        'prescription_eligible': False, 'approved': False, 'published': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('train', 'validate', 'predict-synthetic'))
    parser.add_argument('--data-dir', type=Path, default=rv.DEFAULT_OUTPUT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--enable-synthetic-demo', action='store_true')
    parser.add_argument('--scenario-id')
    parser.add_argument('--candidate-id')
    args = parser.parse_args(argv)
    try:
        if args.action == 'predict-synthetic':
            result = predict_synthetic(args.scenario_id, args.candidate_id, enabled=args.enable_synthetic_demo,
                data_dir=args.data_dir, output=args.output)
        else:
            report = train(args.data_dir, args.output) if args.action == 'train' else verify_run(args.data_dir, args.output)
            result = summary(report)
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f'Offline model comparison failed: {error}\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
