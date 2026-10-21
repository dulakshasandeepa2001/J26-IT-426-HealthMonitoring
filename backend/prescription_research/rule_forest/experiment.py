"""Fit separate RF rule-imitation experiments offline. No clinical inference API."""
import argparse
from collections import Counter, defaultdict
import json
from pathlib import Path

from prescription_research.random_forest_200 import experiment as previous
from prescription_research.random_forest_200 import data as io
from . import dataset as ds


def feature_key(row, task):
    return json.dumps(ds.features(row, task), sort_keys=True)


def unique(rows, task):
    result = {}
    for row in rows:
        key = feature_key(row, task)
        io.require(key not in result or result[key]['targets'][task] == row['targets'][task], 'Conflicting labels on identical allowlisted inputs: ' + task)
        result.setdefault(key, row)
    return list(result.values())


def fit(rows, task, estimator):
    from sklearn.feature_extraction import DictVectorizer
    from sklearn.pipeline import Pipeline
    io.require(rows and {r['split'] for r in rows} == {'train'}, 'Only training families may fit preprocessing/model.')
    rows = unique(rows, task)
    labels = [r['targets'][task] for r in rows]
    io.require(len(set(labels)) > 1, 'Insufficient training label variation: ' + task)
    inputs = [ds.features(r, task) for r in rows]
    pipeline = Pipeline([('encode', DictVectorizer(sparse=True)), ('forest', estimator)])
    pipeline.fit(inputs, labels)
    return {'task': task, 'version': ds.criteria()['version'], 'pipeline': pipeline,
        'feature_names': sorted(inputs[0]), 'training_class_balance': dict(Counter(labels)),
        'training_unique_inputs': len(inputs), 'vocabulary': {key: sorted({x[key] for x in inputs if isinstance(x[key], str)}) for key in inputs[0]},
        'synthetic_only': True, 'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed', 'prescription_eligible': False}


def predict(model, rows):
    # Never read targets, teacher checks, source decisions or references here.
    features = [ds.features(row, model['task']) for row in rows]
    results, valid = [], []
    for index, values in enumerate(features):
        io.require(sorted(values) == model['feature_names'], 'Prediction feature schema changed.')
        unseen = [key for key, value in values.items() if isinstance(value, str) and value not in model['vocabulary'][key]]
        results.append({'predicted': None, 'status': 'abstained', 'reason': 'unseen_training_category:' + ','.join(unseen)} if unseen else None)
        if not unseen: valid.append(index)
    if valid:
        labels = model['pipeline'].predict([features[index] for index in valid])
        for index, label in zip(valid, labels):
            results[index] = {'predicted': str(label), 'status': 'experimental_prediction', 'reason': 'selected_rule_imitation_only; not_clinical_clearance'}
    return results


def predictions(model, rows):
    return [{'scenario_id': row['scenario_id'], 'template_family': row['template_family'], 'candidate_id': row['candidate_id'],
        'condition': row['condition'], 'purpose': row['purpose'], 'clinical_role': row['clinical_role'],
        'expected': row['targets'][model['task']], **value} for row, value in zip(rows, predict(model, rows))]


def metrics(values):
    labels = sorted({v['expected'] for v in values} | {v['predicted'] for v in values if v['predicted'] is not None})
    matrix = {label: dict.fromkeys([*labels, 'abstained'], 0) for label in labels}
    for row in values: matrix[row['expected']][row['predicted'] or 'abstained'] += 1
    per_class = {}
    for label in labels:
        support, correct = sum(matrix[label].values()), matrix[label][label]
        predicted = sum(row[label] for row in matrix.values())
        per_class[label] = {'support': support, 'precision': correct / predicted if predicted else None,
            'recall': correct / support if support else None, 'f1': 2 * correct / (support + predicted) if support else None}
    correct = sum(matrix[label][label] for label in labels)
    f1 = [value['f1'] for value in per_class.values() if value['support']]
    permissive = {'no_selected_issue', 'matches_selected_rule', 'provisional_relevance'}
    return {'inputs': len(values), 'class_balance': dict(Counter(v['expected'] for v in values)),
        'agreement_with_rule_labels': correct / len(values) if values else None, 'correct': correct,
        'errors_including_abstentions': len(values) - correct, 'abstentions': sum(v['predicted'] is None for v in values),
        'false_permissive_predictions': sum(v['predicted'] in permissive and v['predicted'] != v['expected'] for v in values),
        'macro_f1': sum(f1) / len(f1) if f1 else None, 'supported_class_count': len(f1), 'per_class': per_class,
        'confusion_matrix': matrix, 'interpretation': 'agreement with synthetic rules, not clinical accuracy'}


def subsets(model, rows, train_keys):
    task = model['task']
    distinct = unique(rows, task)
    return {name: metrics(predictions(model, group)) for name, group in {
        'all_rows': rows, 'unique_inputs': distinct,
        'novel_unique_inputs': [r for r in distinct if feature_key(r, task) not in train_keys]}.items()}


def checked_rows(output):
    output = Path(output)
    io.require(io.read_json(output / 'source_bindings.json') == ds.bindings(), 'Criteria/teacher/implementation changed; use a new version/run.')
    io.require(io.read_json(output / 'criteria.json') == ds.criteria(), 'Criteria mismatch.')
    expected, initial, audit = ds.fixtures()
    actual = [json.loads(line) for line in (output / 'dataset.jsonl').read_text(encoding='utf-8').splitlines()]
    io.require(actual == expected and io.read_json(output / 'audit.json') == audit and io.read_json(output / 'inspection_batch.json') == initial, 'Dataset or label audit changed.')
    source, source_audit = ds.audit_source_200()
    io.require(io.read_json(output / 'source_200_audit.json') == source_audit, 'Source 200 audit changed.')
    io.require([json.loads(line) for line in (output / 'source_200_labels.jsonl').read_text(encoding='utf-8').splitlines()] == source, 'Source reports were changed or promoted.')
    return actual, audit


def train(output=ds.OUTPUT):
    import joblib
    from sklearn.ensemble import RandomForestClassifier
    output = Path(output)
    io.require(not (output / 'manifest.json').exists(), 'Frozen run exists; use a new output/version.')
    rows, audit = checked_rows(output)
    settings = ds.criteria()
    models, reports, errors = {}, {}, {}
    for task in ds.TASKS:
        split = {s: [r for r in rows if r['split'] == s] for s in io.SPLITS}
        training = unique(split['train'], task)
        train_keys = {feature_key(r, task) for r in training}
        validation = unique(split['validation'], task)
        novel_validation = [r for r in validation if feature_key(r, task) not in train_keys]
        primary = 'novel_unique_inputs' if novel_validation else 'unique_inputs'
        if len({r['targets'][task] for r in training}) < 2:
            reports[task] = {'status': 'not_trained', 'reason': 'insufficient_training_label_variation'}
            continue
        fitted, validations = {}, {}
        for config in settings['rf_candidates']:
            fitted[config['id']] = fit(training, task, RandomForestClassifier(n_estimators=settings['n_estimators'], n_jobs=1,
                random_state=settings['random_state'], class_weight='balanced_subsample',
                max_depth=config['max_depth'], min_samples_leaf=config['min_samples_leaf']))
            validations[config['id']] = subsets(fitted[config['id']], split['validation'], train_keys)
        best = max(settings['rf_candidates'], key=lambda config: validations[config['id']][primary]['macro_f1'])['id']
        model = models[task] = fitted[best]
        tests = predictions(model, split['test'])
        errors[task] = [v for v in tests if v['expected'] != v['predicted']]
        majority = Counter(r['targets'][task] for r in training).most_common(1)[0][0]
        baseline = metrics([{'expected': r['targets'][task], 'predicted': majority} for r in unique(split['test'], task)])
        test_unique = unique(split['test'], task)
        reports[task] = {'status': 'trained', 'algorithm': 'sklearn.ensemble.RandomForestClassifier', 'selected_configuration': best,
            'selection_subset': primary, 'novel_validation_inputs': len(novel_validation),
            'selection_variation': 'insufficient_novel_validation_variation' if len({r['targets'][task] for r in novel_validation}) < 2 else 'multiple_novel_classes',
            'selection_used_test': False, 'validation_refit': False, 'training_unique_inputs': len(training),
            'training_class_balance': model['training_class_balance'], 'feature_names': model['feature_names'],
            'validation': validations, 'test': subsets(model, split['test'], train_keys), 'majority_baseline_test_unique': baseline,
            'train_test_exact_input_overlap': sum(feature_key(r, task) in train_keys for r in test_unique)}
    groups = defaultdict(set)
    for row in rows: groups[(row['condition'], row['purpose'], row['clinical_role'])].add(row['candidate_id'])
    report = {'version': settings['version'], 'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed',
        'clinical_validation': False, 'audit': audit, 'tasks': reports,
        'purpose_groups': [{'condition': c, 'purpose': p, 'clinical_role': role, 'candidates': sorted(ids),
            'within_group_ranking_supported': False} for (c, p, role), ids in sorted(groups.items())],
        'best_medicine_model_trained': False, 'numeric_dose_model_trained': False,
        'application_model_replaced': False, 'api_enabled': False, 'live_patient_data_used': False,
        'clinical_reviews_created': 0, 'clinical_accuracy_claimed': False,
        'limitations': ['Synthetic rule imitation only; no independent clinician labels or outcomes.',
            'Four exact reference products with existing executable profiles; other catalogue products are unsupported by this experiment.',
            'Interaction labels cover selected cautions and missingness only; there are no validated safe/unsafe drug-pair labels.',
            'Dose classifier compares a fictional proposed regimen to an existing rule; it never generates a dose.',
            'Single-candidate purpose groups have no meaningful ranking ground truth. No best-medicine labels are invented.',
            'Held-out family compositions can repeat task-specific feature vectors; novel counts and overlap are reported per task.',
            'Unseen categorical inputs abstain; RF errors, including falsely permissive predictions, cannot overrule deterministic controls.',
            'The supplied 200 cases remain unverified and are audited separately, never promoted or used to train these classifiers.'],
        'environment': previous.environment()}
    joblib.dump(models, output / 'models.joblib', compress=3)
    restored = joblib.load(output / 'models.joblib')  # Only models just created locally.
    for task, model in models.items():
        io.require(predict(model, rows[:14]) == predict(restored[task], rows[:14]), 'Saved pipeline did not round-trip.')
    io.write_json(output / 'evaluation.json', report)
    io.write_json(output / 'test_errors.json', errors)
    (output / 'evaluation.md').write_text(markdown(report), encoding='utf-8', newline='\n')
    manifest = {'version': settings['version'], 'source_bindings': ds.bindings(), 'environment': previous.environment(),
        'outputs': {p.relative_to(output).as_posix(): io.digest(p) for p in sorted(output.rglob('*')) if p.is_file() and p.name != 'manifest.json'}}
    io.write_json(output / 'manifest.json', manifest)
    return compact(report)


def compact(report):
    return {'version': report['version'], 'dataset_rows': report['audit']['rows'], 'tasks': {
        name: {key: value[key] for key in ('status', 'selected_configuration', 'training_unique_inputs', 'test') if key in value}
        for name, value in report['tasks'].items()}, 'clinical_validation': False, 'application_model_replaced': False}


def markdown(report):
    lines = ['# Selected-rule Random Forest experiment', '', '**Experimental rule imitation. Not clinically reviewed or validated.**', '',
        '| Task | RF configuration | Unique train inputs | Novel test inputs | Novel rule-label agreement | Novel macro F1 | Novel abstentions | Novel false-permissive |',
        '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |']
    for task, value in report['tasks'].items():
        if value['status'] != 'trained':
            lines.append(f'| {task} | insufficient variation | | | | | | |')
            continue
        test = value['test']['novel_unique_inputs']
        lines.append(f"| {task} | {value['selected_configuration']} | {value['training_unique_inputs']} | {test['inputs']} | {test['agreement_with_rule_labels']} | {test['macro_f1']} | {test['abstentions']} | {test['false_permissive_predictions']} |")
    lines += ['', 'All rows, unique rows, repeated inputs, class support, per-class errors and validation configurations are in evaluation.json.',
        'A null novel-test metric means no novel examples; no generalization performance is established for that task.', '', '## Limitations', '']
    lines += ['- ' + value for value in report['limitations']]
    return '\n'.join(lines) + '\n'


def verify(output=ds.OUTPUT):
    output = Path(output)
    manifest = io.read_json(output / 'manifest.json')
    io.require(manifest['version'] == ds.criteria()['version'] and manifest['source_bindings'] == ds.bindings()
        and manifest['environment'] == previous.environment(), 'Source/environment/version changed.')
    io.require({'models.joblib', 'dataset.jsonl', 'evaluation.json', 'criteria.json', 'evidence.json'} <= set(manifest['outputs']), 'Required manifest entries missing.')
    for name, digest in manifest['outputs'].items():
        path = (output / name).resolve()
        io.require(path.is_relative_to(output.resolve()) and path.is_file() and io.digest(path) == digest, 'Artifact integrity failed: ' + name)
    checked_rows(output)
    return compact(io.read_json(output / 'evaluation.json'))


def guarded_comparison(row, values):
    """Expose disagreements; a learned permissive label never clears a block."""
    io.require(row['synthetic_only'] is True and set(values) == set(ds.TASKS), 'All tasks and a fictional fixture are required.')
    blocking = [c for c in row['teacher_checks'] if c['status'] in ('blocked', 'cannot_validate') or
        (c['status'] == 'warning' and c['category'] not in ('coverage', 'topical_precaution'))]
    mismatch = [task for task, value in values.items() if value['predicted'] != row['targets'][task]]
    reference = row['proposed_regimen'] if not blocking and not mismatch and row['targets']['purpose_applicability'] == 'provisional_relevance' else None
    return {'presentation_label': 'Experimental ML — fictional selected-rule comparison', 'model_version': ds.criteria()['version'],
        'scenario_id': row['scenario_id'], 'candidate_id': row['candidate_id'], 'purpose': row['purpose'], 'clinical_role': row['clinical_role'],
        'predictions': values, 'deterministic_labels': row['targets'], 'deterministic_obstacles': blocking,
        'model_disagreements_or_abstentions': mismatch, 'fictional_reference_regimen': reference,
        'numeric_dose_origin': 'deterministic existing product rule; never ML-generated',
        'ranking': 'not_supported; one candidate in this condition-role group', 'medical_confidence': None,
        'clinical_review_status': 'not_reviewed', 'clinical_validation': False, 'synthetic_only': True,
        'ml_can_override_rules': False, 'prescription_eligible': False, 'approved': False, 'published': False}


def inspect_synthetic(output, scenario_id, *, enabled=False):
    io.require(enabled is True, 'Explicit --enable-synthetic-demo is required.')
    output = Path(output)
    verify(output)
    rows, _ = checked_rows(output)
    row = next((r for r in rows if r['scenario_id'] == scenario_id), None)
    io.require(row is not None and row['synthetic_only'] is True, 'Only a frozen fictional scenario ID is accepted.')
    import joblib
    models = joblib.load(output / 'models.joblib')
    values = {task: predict(model, [row])[0] for task, model in models.items()}
    return guarded_comparison(row, values)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('inspect', 'build', 'train', 'verify', 'inspect-synthetic'))
    parser.add_argument('--output', type=Path, default=ds.OUTPUT)
    parser.add_argument('--scenario-id')
    parser.add_argument('--enable-synthetic-demo', action='store_true')
    args = parser.parse_args()
    try:
        if args.action == 'inspect':
            batch = ds.initial_batch()
            result = {'inspection_count': len(batch), 'audit': ds.validate(batch), 'hint': 'build saves inspection_batch.json with all inputs, labels and provenance'}
        elif args.action == 'build': result = ds.build(args.output)
        elif args.action == 'train': result = train(args.output)
        elif args.action == 'verify': result = verify(args.output)
        else: result = inspect_synthetic(args.output, args.scenario_id, enabled=args.enable_synthetic_demo)
        print(json.dumps(result, indent=2, allow_nan=False))
    except (ValueError, KeyError, TypeError, OSError, ImportError) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
