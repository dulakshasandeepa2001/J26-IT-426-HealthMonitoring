"""Train/evaluate a real sklearn Random Forest offline, without Django imports."""
import argparse
from collections import Counter, defaultdict
import importlib.metadata
import json
from pathlib import Path
import platform

from . import data

SOURCE_FILES = ('__init__.py', 'data.py', 'experiment.py', 'plan.json', 'requirements.txt')
PACKAGES = ('scikit-learn', 'numpy', 'scipy', 'joblib', 'threadpoolctl', 'narwhals', 'cloudpickle')


def environment():
    return {'python': platform.python_version(), **{name: importlib.metadata.version(name) for name in PACKAGES}}


def partitions(rows):
    return {split: [row for row in rows if row['split'] == split and row['label'] is not None] for split in data.SPLITS}


def fit_model(training, estimator, settings):
    from sklearn.feature_extraction import DictVectorizer
    from sklearn.pipeline import Pipeline
    data.require(training and {r['split'] for r in training} == {'train'} and {r['label'] for r in training} == {0, 1}, 'Training needs both defined toy classes from training families only.')
    rows = data.unique_rows(training)
    data.require(all(set(row['model_features']) == set(settings['features']) for row in rows), 'The model feature allowlist changed.')
    pipeline = Pipeline([('encode', DictVectorizer(sparse=True, sort=True)), ('model', estimator)])
    pipeline.fit([r['model_features'] for r in rows], [r['label'] for r in rows])
    return {'pipeline': pipeline, 'version': settings['version'], 'task': settings['task'],
        'feature_names': settings['features'], 'training_inputs': len(rows),
        'training_row_ids': [r['row_id'] for r in rows],
        'vocabulary': {key: sorted({r['model_features'][key] for r in rows}) for key in settings['features']},
        'coverage': sorted({(r['condition'], r['candidate_key'], r['purpose']) for r in rows}),
        'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed', 'synthetic_only': True,
        'clinical_safety_model': False, 'dose_model': False, 'prescription_eligible': False}


def predict_one(model, row, settings):
    features = row['model_features']
    data.require(set(features) == set(model['feature_names']), 'Prediction feature allowlist mismatch.')
    scope = (features['condition'], features['candidate_key'], features['purpose'])
    reason = None
    if scope not in model['coverage']:
        reason = 'outside_trained_condition_candidate_purpose'
    else:
        targets = settings['toy_targets_by_candidate'].get(features['candidate_key'], [])
        values = [features['symptom_' + key] for key in targets]
        if not values or not ('present' in values or all(value == 'absent' for value in values)):
            reason = 'incomplete_target_symptoms; unknown_is_not_absent'
        elif any(features[key] not in values for key, values in model['vocabulary'].items()):
            reason = 'unseen_training_category'
    if reason:
        return {'label': None, 'status': 'abstained', 'reason': reason}
    return {'label': int(model['pipeline'].predict([features])[0]), 'status': 'predicted',
        'reason': 'experimental_forest_symptom_match_only; no_safety_or_dose_clearance'}


def records(model, rows, settings):
    return [{key: row[key] for key in ('row_id', 'scenario_id', 'template_family', 'condition', 'candidate_key', 'purpose')}
        | {'expected': row['label'], 'predicted': result['label'], 'status': result['status'], 'reason': result['reason']}
        for row in rows for result in [predict_one(model, row, settings)]]


def metrics(rows):
    confusion = {str(label): {'0': 0, '1': 0, 'abstained': 0} for label in (0, 1)}
    for row in rows:
        data.require(row['expected'] in (0, 1) and row['predicted'] in (None, 0, 1), 'Undefined toy labels cannot be scored.')
        confusion[str(row['expected'])]['abstained' if row['predicted'] is None else str(row['predicted'])] += 1
    per_class = {}
    for label in ('0', '1'):
        support, tp = sum(confusion[label].values()), confusion[label][label]
        predicted = sum(confusion[actual][label] for actual in ('0', '1'))
        per_class[label] = {'support': support, 'predicted_count': predicted,
            'precision': tp / predicted if predicted else None, 'recall': tp / support if support else None,
            'f1': 2 * tp / (support + predicted) if support else None}
    correct = sum(confusion[label][label] for label in ('0', '1'))
    abstained = sum(confusion[label]['abstained'] for label in ('0', '1'))
    supported = [value['f1'] for value in per_class.values() if value['support']]
    return {'inputs': len(rows), 'class_balance': dict(Counter(str(r['expected']) for r in rows)), 'correct': correct,
        'errors_including_abstentions': len(rows) - correct, 'abstentions': abstained,
        'agreement_with_supplied_toy_labels': correct / len(rows) if rows else None,
        'coverage': 1 - abstained / len(rows) if rows else None,
        'macro_f1': sum(supported) / len(supported) if supported else None,
        'macro_f1_supported_class_count': len(supported), 'per_class': per_class, 'confusion_matrix': confusion,
        'interpretation': 'agreement with unreviewed rule-derived toy labels; not clinical accuracy'}


def subset_metrics(model, rows, train_keys, settings):
    unique = data.unique_rows(rows)
    subsets = {'all_labelled_rows': rows, 'unique_inputs': unique,
        'novel_unique_inputs': [r for r in unique if data.feature_key(r) not in train_keys],
        'inputs_seen_in_training': [r for r in unique if data.feature_key(r) in train_keys]}
    return {name: metrics(records(model, values, settings)) for name, values in subsets.items()}


def checked_data(output):
    cases, rows, audit = data.load_inputs(output / 'inputs/patient_scenarios_200.csv', output / 'inputs/MediTrack_Synthetic_200.xlsx')
    data.require(data.read_json(output / 'plan.json') == data.plan(), 'Experiment plan changed; use a new experiment version/output.')
    data.require(data.read_json(output / 'audit.json') == audit, 'Audit/source mismatch.')
    for filename, expected in (('cases.jsonl', cases), ('candidate_rows.jsonl', rows)):
        actual = [json.loads(line) for line in (output / filename).read_text(encoding='utf-8').splitlines()]
        data.require(actual == expected, 'Normalized data changed: ' + filename)
    return cases, rows, audit


def train(output=data.DEFAULT_OUTPUT):
    import joblib
    from sklearn.dummy import DummyClassifier
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.tree import DecisionTreeClassifier
    output = Path(output)
    data.require(not (output / 'manifest.json').exists(), 'Frozen run exists; verify it or use a new output/version.')
    cases, all_rows, audit = checked_data(output)
    settings = data.plan()
    split = partitions(all_rows)
    training = data.unique_rows(split['train'])
    train_keys = {data.feature_key(row) for row in training}
    validation = data.unique_rows(split['validation'])
    novel_validation = [row for row in validation if data.feature_key(row) not in train_keys]
    primary = novel_validation or validation
    data.require(primary and {r['label'] for r in primary} == {0, 1}, 'Insufficient validation class variation; do not force model-selection metrics.')
    selection_subset = 'novel_unique_inputs' if novel_validation else 'unique_inputs'
    fitted, validation_results = {}, {}
    for candidate in settings['rf_candidates']:
        estimator = RandomForestClassifier(**settings['rf_common'], **{k: v for k, v in candidate.items() if k != 'id'}, random_state=settings['random_state'])
        model = fit_model(training, estimator, settings)
        fitted[candidate['id']] = model
        validation_results[candidate['id']] = subset_metrics(model, split['validation'], train_keys, settings)
    selected = max(settings['rf_candidates'], key=lambda row: validation_results[row['id']][selection_subset]['macro_f1'])['id']
    model = fitted[selected]  # No test access during selection; no validation refit.
    baseline_estimators = {'training_majority': DummyClassifier(strategy='most_frequent'),
        'decision_tree_depth6_leaf2': DecisionTreeClassifier(max_depth=6, min_samples_leaf=2, class_weight='balanced', random_state=settings['random_state'])}
    for name, estimator in baseline_estimators.items():
        baseline = fit_model(training, estimator, settings)
        validation_results[name] = subset_metrics(baseline, split['validation'], train_keys, settings)
    test_records = records(model, split['test'], settings)
    majority = Counter(row['label'] for row in training).most_common(1)[0][0]
    majority_test = [{'expected': row['label'], 'predicted': majority} for row in data.unique_rows(split['test'])]
    partition_keys = {key: {data.feature_key(row) for row in values} for key, values in split.items()}
    per_group = defaultdict(list)
    for row in all_rows:
        per_group[(row['condition'], row['purpose'])].append(row)
    groups = []
    for (condition, purpose), values in sorted(per_group.items()):
        targets_by_scenario = defaultdict(set)
        for row in values:
            if row['label'] is not None:
                targets_by_scenario[row['scenario_id']].add(row['label'])
        groups.append({'condition': condition, 'purpose': purpose, 'candidates': sorted({r['candidate_key'] for r in values}),
            'labels': dict(Counter('unlabelled' if r['label'] is None else str(r['label']) for r in values)),
            'within_scenario_preference_variation': any(len(v) > 1 for v in targets_by_scenario.values()),
            'ranking_performance_claimed': False})
    test_by_group = {condition + '::' + purpose: metrics([row for row in test_records if row['condition'] == condition and row['purpose'] == purpose])
        for condition, purpose in sorted({(r['condition'], r['purpose']) for r in split['test']})}
    full_predictions = records(model, all_rows, settings)
    data.require(all(r['predicted'] is None for r in full_predictions if r['expected'] is None), 'Unlabelled/undefined targets must abstain, never become negatives.')
    report = {'version': settings['version'], 'task': settings['task'], 'algorithm': 'sklearn.ensemble.RandomForestClassifier',
        'selected_configuration': selected, 'selected_parameters': model['pipeline']['model'].get_params(),
        'selection_subset': selection_subset, 'selection_used_test': False, 'refitted_on_validation': False,
        'audit': audit, 'training': {'raw_labelled_rows': len(split['train']), 'unique_inputs': len(training),
            'class_balance': dict(Counter(str(r['label']) for r in training)), 'encoded_feature_count': len(model['pipeline']['encode'].get_feature_names_out()),
            'features': settings['features']},
        'validation': validation_results, 'selected_rf_test': subset_metrics(model, split['test'], train_keys, settings),
        'majority_baseline_test_unique': metrics(majority_test), 'test_by_condition_and_purpose': test_by_group,
        'overlap': {a + '--' + b: len(partition_keys[a] & partition_keys[b]) for a, b in (('train', 'validation'), ('train', 'test'), ('validation', 'test'))},
        'template_patterns_across_partitions': {pattern: sorted({c['suggested_split'] for c in cases if c['context_pattern'] == pattern}) for pattern in sorted({c['context_pattern'] for c in cases})},
        'group_support': groups, 'unlabelled_prediction_statuses': dict(Counter(r['status'] for r in full_predictions if r['expected'] is None)),
        'coverage': {'trained_generic_candidates': sorted({r['candidate_key'] for r in training}),
            'untrained_candidates': sorted({r['candidate_key'] for r in all_rows} - {r['candidate_key'] for r in training})},
        'environment': environment(), 'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed',
        'independent_clinical_validation': False, 'medical_confidence_calibrated': False, 'active_application_model_replaced': False,
        'safety_and_dose_models_trained': False, 'api_enabled': False, 'published': False,
        'limitations': [
            'All labels are supplied synthetic symptom-match rules, not independent clinician judgments or treatment outcomes.',
            'Patient safety, interaction, contraindication and dose targets are absent; no such models were fitted.',
            'The workbook omits full context fields; CSV and XLSX describe the same 200 cases and must not be concatenated as 400.',
            'Blank labels remain unlabelled; undefined antiviral/adjunct tasks and incomplete targets abstain.',
            'Family IDs include condition; broader generator context patterns and exact feature vectors can recur across splits. Novel-input metrics do not establish independent clinical validation.',
            'Alternative medicines have identical toy targets within purpose. No preference labels or meaningful within-group ranking are supplied.',
            'The best Random Forest is validation-selected among three declared settings, not presumed superior to the decision-tree baseline.',
            'Headache mappings and generic candidate tasks differ from the old relevance experiment; their scores are not directly comparable.',
            'Candidates are generic concepts; a symptom-match prediction supplies no exact formulation, product verification, dose or safety clearance.',
            'Existing application artifacts and deterministic blocks are unchanged. This saved experiment is offline only.']}
    joblib.dump(model, output / 'model.joblib', compress=3)
    reloaded = joblib.load(output / 'model.joblib')  # Only the artifact just created by this local process.
    data.require(records(reloaded, split['test'], settings) == test_records, 'Saved preprocessing/model predictions changed on reload.')
    data.write_json(output / 'evaluation.json', report)
    data.write_json(output / 'test_errors.json', [r for r in test_records if r['expected'] != r['predicted']])
    data.write_json(output / 'predictions.json', full_predictions)
    (output / 'evaluation.md').write_text(markdown(report), encoding='utf-8', newline='\n')
    outputs = sorted(path.relative_to(output).as_posix() for path in output.rglob('*') if path.is_file())
    manifest = {'version': settings['version'], 'environment': environment(),
        'sources': {name: data.digest(data.HERE / name) for name in SOURCE_FILES},
        'outputs': {name: data.digest(output / name) for name in outputs}}
    data.write_json(output / 'manifest.json', manifest)
    return summary(report)


def markdown(report):
    chosen = report['selected_configuration']
    lines = ['# Random Forest: supplied synthetic 200-case experiment', '', '**Experimental ML; unreviewed rule-derived toy symptom-match labels.**', '',
        'CSV provides complete contexts; XLSX provides candidate labels for the same 200 cases.',
        'Allergy/interaction/dose/clinical relevance labels are absent. No clinical safety or dose model is trained.', '',
        f"Candidate rows: {report['audit']['candidate_rows']}; labelled: {report['audit']['labelled_rows']}; unlabelled: {report['audit']['unlabelled_rows']}.",
        f"Training: {report['training']['raw_labelled_rows']} labelled rows, {report['training']['unique_inputs']} unique model inputs.",
        f"Primary selection subset: {report['selection_subset']}. Selected RF: **{chosen}**. No validation refit or test-based selection.", '',
        '| Model | Validation primary macro F1 | Agreement | Coverage |', '| --- | ---: | ---: | ---: |']
    for name, values in report['validation'].items():
        value = values[report['selection_subset']]
        lines.append(f"| {name} | {value['macro_f1']:.4f} | {value['agreement_with_supplied_toy_labels']:.4f} | {value['coverage']:.4f} |")
    lines += ['', '## Selected RF: held-out test', '', '| Subset | Inputs | Toy-label agreement | Macro F1 | Errors including abstentions | Abstentions |', '| --- | ---: | ---: | ---: | ---: | ---: |']
    for name, value in report['selected_rf_test'].items():
        lines.append(f"| {name} | {value['inputs']} | {value['agreement_with_supplied_toy_labels']} | {value['macro_f1']} | {value['errors_including_abstentions']} | {value['abstentions']} |")
    lines += ['', 'Unique-input majority baseline: ' + str(report['majority_baseline_test_unique']['agreement_with_supplied_toy_labels']),
        'Exact labelled-input overlaps: `' + json.dumps(report['overlap'], sort_keys=True) + '`.', '',
        'These are engineering agreement results, not medical accuracy or independent validation.', '', '## Coverage', '',
        'Trained generic candidates: ' + ', '.join(report['coverage']['trained_generic_candidates']) + '.',
        'No training labels for: ' + ', '.join(report['coverage']['untrained_candidates']) + '.', '', '## Limits', '']
    lines += ['- ' + item for item in report['limitations']]
    return '\n'.join(lines) + '\n'


def summary(report):
    return {key: report[key] for key in ('version', 'selected_configuration', 'selection_subset', 'training', 'selected_rf_test', 'safety_and_dose_models_trained', 'active_application_model_replaced')}


def verify(output=data.DEFAULT_OUTPUT):
    output = Path(output)
    manifest = data.read_json(output / 'manifest.json')
    data.require(manifest['version'] == data.plan()['version'] and manifest['environment'] == environment(), 'Model version/dependency environment changed.')
    data.require(set(manifest['sources']) == set(SOURCE_FILES), 'Unexpected source manifest.')
    data.require({'model.joblib', 'audit.json', 'plan.json', 'candidate_rows.jsonl', 'evaluation.json'} <= set(manifest['outputs']), 'Required artifact hashes are absent.')
    for name in SOURCE_FILES:
        data.require(data.digest(data.HERE / name) == manifest['sources'][name], 'Training code/plan changed: ' + name)
    for name, expected in manifest['outputs'].items():
        path = (output / name).resolve()
        data.require(path.is_relative_to(output.resolve()) and path.is_file() and data.digest(path) == expected, 'Artifact integrity failed: ' + name)
    checked_data(output)
    return summary(data.read_json(output / 'evaluation.json'))


def predict_synthetic(output, scenario_id, candidate_key, *, enabled=False):
    data.require(enabled is True, 'Explicit --enable-synthetic-demo is required.')
    output = Path(output)
    verify(output)  # Verify local provenance before loading the locally created pickle.
    import joblib
    _, rows, _ = checked_data(output)
    row = next((r for r in rows if r['scenario_id'] == scenario_id and r['candidate_key'] == candidate_key), None)
    data.require(row is not None and row['synthetic_only'] is True, 'Only an existing frozen fictional pair is accepted; no live patient inputs.')
    result = predict_one(joblib.load(output / 'model.joblib'), row, data.plan())
    return {'presentation_label': 'Experimental ML', 'task': data.plan()['task'], 'model_version': data.plan()['version'],
        'scenario_id': scenario_id, 'candidate_key': candidate_key, 'purpose': row['purpose'], 'prediction': result,
        'clinical_review_status': 'not_reviewed', 'medical_confidence_calibrated': False,
        'synthetic_only': True, 'approved': False, 'published': False, 'prescription_eligible': False,
        'clinical_safety_assessed_by_model': False, 'dose_predicted': False, 'live_patient_data_used': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('inspect', 'audit', 'build', 'train', 'verify', 'predict-synthetic'))
    parser.add_argument('--csv', type=Path)
    parser.add_argument('--xlsx', type=Path)
    parser.add_argument('--output', type=Path, default=data.DEFAULT_OUTPUT)
    parser.add_argument('--scenario-id')
    parser.add_argument('--candidate')
    parser.add_argument('--enable-synthetic-demo', action='store_true')
    args = parser.parse_args()
    try:
        if args.action in ('inspect', 'audit', 'build'):
            data.require(args.csv and args.xlsx, 'Both --csv and --xlsx are required; they supply complementary context/labels.')
            if args.action == 'inspect':
                data.require(not (args.output / 'manifest.json').exists(), 'Frozen run exists; verify it or use a new inspection output.')
                inspection = data.inspect_inputs(args.csv, args.xlsx)
                args.output.mkdir(parents=True, exist_ok=True)
                data.write_json(args.output / 'inspection_batch.json', inspection)
                result = {key: value for key, value in inspection.items() if key != 'rows'}
            else:
                result = data.load_inputs(args.csv, args.xlsx)[2] if args.action == 'audit' else data.build(args.csv, args.xlsx, args.output)
        elif args.action == 'train':
            result = train(args.output)
        elif args.action == 'verify':
            result = verify(args.output)
        else:
            result = predict_synthetic(args.output, args.scenario_id, args.candidate, enabled=args.enable_synthetic_demo)
        print(json.dumps(result, indent=2, allow_nan=False))
    except (ValueError, OSError, KeyError, TypeError, ImportError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
