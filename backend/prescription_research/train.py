"""Offline training/evaluation and opt-in prediction on frozen synthetic fixtures.

No Django integration, live-patient inputs, model fitting during prediction,
clinical reviews, medical confidence scores or prescription publication.
"""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import platform
import sys

if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prescription_research import categorical_tree as tree
from prescription_research import dataset as ds
from prescription_research import training_dataset as td

DEFAULT_OUTPUT = ds.ROOT / 'docs/research/experimental_ml_v1'
SOURCE_PATHS = td.INPUT_PATHS + (
    'backend/prescription_research/categorical_tree.py',
    'backend/prescription_research/train.py',
)
LABELS = ('not_relevant', 'relevant', 'undetermined')


def split_rows(batch):
    mapped = td.mapped_rows(batch)
    return {split: [row for row in mapped if row['split'] == split] for split in ('train', 'validation', 'test')}


def metrics(records):
    confusion = {label: {predicted: 0 for predicted in (*LABELS, 'abstained')} for label in LABELS}
    for record in records:
        confusion[record['expected']][record['predicted'] or 'abstained'] += 1
    correct = sum(record['expected'] == record['predicted'] for record in records)
    predicted_count = sum(record['predicted'] is not None for record in records)
    per_class = {}
    for label in LABELS:
        support = sum(confusion[label].values())
        predicted = sum(confusion[actual][label] for actual in LABELS)
        true_positive = confusion[label][label]
        precision = true_positive / predicted if predicted else None
        recall = true_positive / support if support else None
        f1 = None if precision is None or recall is None else (2 * precision * recall / (precision + recall) if precision + recall else 0.0)
        per_class[label] = {'support': support, 'predicted_count': predicted, 'precision': precision,
                            'recall': recall, 'f1': f1, 'measurement': 'rule_label_agreement_only'}
    return {
        'evaluated_inputs': len(records), 'correct': correct, 'errors_including_abstentions': len(records) - correct,
        'agreement_with_provisional_labels': correct / len(records) if records else None,
        'prediction_coverage': predicted_count / len(records) if records else None,
        'abstentions': len(records) - predicted_count, 'confusion_matrix': confusion,
        'per_class': per_class,
    }


def prediction_record(model, row):
    prediction = tree.predict(model, row['model_features'])
    return {'row_id': row['row_id'], 'scenario_id': row['scenario_id'],
            'template_family': row['template_family'], 'condition': row['condition'],
            'candidate_id': row['candidate_id'], 'group_key': row['group_key'],
            'expected': row['relevance_target']['value'], 'predicted': prediction['label'],
            'prediction_status': prediction['status'], 'reason': prediction['reason'],
            'learned_path': prediction['path']}


def evaluate(model, batch, validation):
    settings = td.plan()
    _, _, criteria, _ = ds.knowledge()
    scenarios = {scenario['scenario_id']: scenario for scenario in batch['scenarios']}
    rows_by_split = split_rows(batch)
    train_unique = td.unique_rows(rows_by_split['train'])
    majority = Counter(row['relevance_target']['value'] for row in train_unique).most_common(1)[0][0]
    reports, errors = {}, []
    for split, rows in rows_by_split.items():
        unique = td.unique_rows(rows)
        unique_records = [prediction_record(model, row) for row in unique]
        all_records = [prediction_record(model, row) for row in rows]
        majority_records = [dict(record, predicted=majority) for record in unique_records]
        # This is the generating criteria, so its agreement is tautological.
        criteria_records = [dict(record, predicted=ds.relevance_target(
            scenarios[row['scenario_id']], row['candidate_id'], criteria)['value'])
                            for record, row in zip(unique_records, unique)]
        report = {'unique_input_metrics': metrics(unique_records), 'all_mapped_row_metrics': metrics(all_records),
                  'training_majority_baseline': dict(metrics(majority_records), predicted_class=majority),
                  'generating_criteria_baseline': dict(metrics(criteria_records), independence='none; same criteria generated targets'),
                  'by_condition_unique_inputs': {}, 'by_group_unique_inputs': {}}
        for condition in sorted({record['condition'] for record in unique_records}):
            report['by_condition_unique_inputs'][condition] = metrics([record for record in unique_records if record['condition'] == condition])
        for group in sorted({record['group_key'] for record in unique_records}):
            selected = [record for record in unique_records if record['group_key'] == group]
            result = metrics(selected)
            result.update(candidate_ids=sorted({record['candidate_id'] for record in selected}),
                          target_variation=len({record['expected'] for record in selected}),
                          ranking_evaluation='not_meaningful_single_candidate')
            report['by_group_unique_inputs'][group] = result
        reports[split] = report
        errors.extend(dict(record, split=split) for record in unique_records if record['predicted'] != record['expected'])
    return {
        'presentation_label': 'Experimental ML', 'model_version': settings['model_version'],
        'model_trained': True, 'clinical_review_status': 'not_reviewed', 'label_method': 'rule_derived',
        'task': 'Provisional condition/purpose/symptom relevance classification',
        'baseline_type': 'experimental_rule_imitation', 'counts': validation['counts'],
        'class_balance_condition_mapped_rows': validation['class_balance_condition_mapped_rows'],
        'dataset_splits': validation['by_split'], 'family_split_overlap': 0, 'model_input_split_overlap': 0,
        'fit_unique_inputs': len(train_unique), 'model_structure': tree.summary(model),
        'hyperparameters': settings['hyperparameters'], 'tuning': settings['tuning'],
        'fit_population': settings['fit_population'], 'feature_allowlist': model['feature_names'],
        'splits': reports, 'unique_input_error_count': len(errors),
        'coverage': {
            'supported_conditions': ['influenza', 'chickenpox'], 'pilot_product_count': 4,
            'purpose_role_groups': validation['supported_groups'],
            'contrast_rows_used_for_fitting': False, 'unsupported_conditions_used_for_fitting': False,
            'medical_confidence_calibrated': False, 'independent_clinical_validation': False,
        },
        'limitations': validation['limitations'] + [
            'Agreement measures imitation of the researcher-defined generating criteria, not clinical accuracy or independent validation.',
            'This compact learner is a stdlib categorical information-gain implementation, not scikit-learn CART and not a tuned benchmark.',
            'The generating criteria remain the exact baseline; learned agreement provides no evidence of superiority or additional clinical knowledge.',
            'Vocabularies and splits are fitted on deduplicated training inputs only. Null remains distinct from false; unseen categories/branches abstain.',
            'Small held-out pattern counts do not establish population generalization; all partitions come from the same synthetic generator.',
            'No numeric output is medical confidence. Leaf training support and learned paths describe engineering evidence only.',
            'ML relevance cannot approve medicines, clear unknown facts, override deterministic findings or publish a prescription.',
        ],
        'next_step': 'Step 7C: review offline findings, then optionally build an explicitly enabled synthetic-only Django demo using this frozen artifact and existing deterministic controls.',
    }, errors


def report_markdown(report, errors):
    lines = ['# Step 7B: Experimental ML offline results', '',
             '**Experimental rule-imitation baseline. All relevance labels are rule-derived and clinically not reviewed.**', '',
             f'Model: `{report["model_version"]}`; fitted on **{report["fit_unique_inputs"]} unique condition-mapped inputs**. '
             f'Tree structure: `{report["model_structure"]}`.', '',
             f'Dataset counts: `{report["counts"]}`. Condition-mapped row balance: '
             f'`{report["class_balance_condition_mapped_rows"]}`.', '',
             '| Partition | Unique inputs | Agreement with provisional labels | Errors / abstentions | Majority baseline agreement |',
             '| --- | ---: | ---: | ---: | ---: |']
    for split, values in report['splits'].items():
        data = values['unique_input_metrics']
        baseline = values['training_majority_baseline']
        lines.append(f'| {split} | {data["evaluated_inputs"]} | {data["agreement_with_provisional_labels"]:.3f} | '
                     f'{data["errors_including_abstentions"]} / {data["abstentions"]} | {baseline["agreement_with_provisional_labels"]:.3f} |')
    lines += ['', 'Family/base-scenario/exact model-input overlap across splits is zero. Within-family safety variants '
              'share relevance inputs and are deduplicated for fitting and primary metrics.', '',
              'The criteria baseline has agreement 1.0 by construction: it generated these targets. '
              'No clinical improvement or superiority is established.', '',
              '| Test condition / purpose / role | Unique inputs | Agreement | Target classes |', '| --- | ---: | ---: | ---: |']
    for group, values in report['splits']['test']['by_group_unique_inputs'].items():
        lines.append(f'| {group} | {values["evaluated_inputs"]} | {values["agreement_with_provisional_labels"]:.3f} | {values["target_variation"]} |')
    lines += ['', 'Each role group has one candidate. Antiviral labels are constant within the supported condition; '
              'within-group ranking and varying antiviral applicability are not evaluated.', '',
              '## Errors on unique inputs', '']
    if errors:
        lines += ['| Split | Scenario | Candidate | Expected | Predicted | Reason |', '| --- | --- | --- | --- | --- | --- |']
        for error in errors:
            lines.append(f'| {error["split"]} | {error["scenario_id"]} | {error["candidate_id"]} | '
                         f'{error["expected"]} | {error["predicted"] or "abstained"} | {error["reason"]} |')
    else:
        lines.append('No disagreement on the reported unique inputs. This is still agreement with synthetic generating rules, not clinical validation.')
    lines += ['', 'Per-class precision/recall/F1, confusion matrices, row-weighted metrics and condition/group '
              'breakdowns are in `evaluation.json`. Unsupported diagnoses and contrast rows are excluded from these metrics.', '',
              '## Limits', ''] + [f'- {limit}' for limit in report['limitations']]
    lines += ['', report['next_step'], '']
    return '\n'.join(lines)


def model_artifact(learner):
    settings = td.plan()
    _, _, criteria, _ = ds.knowledge()
    return {
        'artifact_version': '1.0', 'model_version': settings['model_version'],
        'presentation_label': 'Experimental ML', 'clinical_review_status': 'not_reviewed',
        'label_provenance': {'method': 'rule_derived', 'criteria_version': criteria['version'],
                             'source': 'researcher_defined_source_informed_criteria', 'independent_clinical_validation': False},
        'supported_conditions': criteria['supported_conditions'], 'candidate_definitions': criteria['products'],
        'learner': learner, 'medical_confidence_calibrated': False,
        'deterministic_controls_required': True, 'api_enabled': False, 'publication_enabled': False,
    }


def current_bindings(data_dir):
    return {'source_sha256': {path: ds.file_hash(ds.ROOT / path) for path in SOURCE_PATHS},
            'dataset_manifest_sha256': ds.file_hash(Path(data_dir) / 'manifest.json'),
            'dataset_batch_sha256': ds.file_hash(Path(data_dir) / 'batch.json')}


def train(data_dir=td.DEFAULT_OUTPUT, output=DEFAULT_OUTPUT):
    validation = td.validate_artifacts(data_dir)
    batch = ds.read_json(Path(data_dir) / 'batch.json')
    settings = td.plan()
    _, _, criteria, _ = ds.knowledge()
    training = td.unique_rows(split_rows(batch)['train'])
    ds.require(set(row['relevance_target']['value'] for row in training) == set(LABELS), 'Insufficient training class variation.')
    learner = tree.fit_model([row['model_features'] for row in training],
                             [row['relevance_target']['value'] for row in training],
                             criteria['feature_allowlist'], settings['hyperparameters'])
    tree.validate_model(learner, criteria['feature_allowlist'])
    report, errors = evaluate(learner, batch, validation)
    artifact = model_artifact(learner)
    artifacts = {'model.json': ds.json_bytes(artifact), 'evaluation.json': ds.json_bytes(report),
                 'errors.json': ds.json_bytes(errors), 'evaluation.md': report_markdown(report, errors).encode('utf-8'),
                 'tree.txt': tree.tree_text(learner).encode('utf-8')}
    manifest = {
        'manifest_version': '1.0', 'model_version': settings['model_version'], 'model_trained': True,
        'clinical_review_status': 'not_reviewed', 'label_method': 'rule_derived',
        'python_training_version': platform.python_version(), 'dependencies': 'Python standard library only; no packages added',
        'context_seed': settings['context_seed'], 'split_seed': settings['split_seed'],
        'family_splits': {family['id']: family['split'] for family in td.template_families()},
        'training_unique_row_ids': [row['row_id'] for row in training],
        'preprocessing_fitted_on': 'deduplicated_train_inputs_only',
        'fit_unique_inputs': len(training), 'hyperparameters': settings['hyperparameters'],
        'bindings': current_bindings(data_dir),
        'artifact_sha256': {name: hashlib.sha256(contents).hexdigest() for name, contents in artifacts.items()},
        'api_enabled': False, 'publication_enabled': False, 'live_patient_data_used': False,
    }
    output = Path(output)
    ds.require(output.resolve() not in (Path(data_dir).resolve(), ds.DEFAULT_OUTPUT.resolve()), 'Model output must be separate from dataset directories.')
    output.mkdir(parents=True, exist_ok=True)
    for name, contents in artifacts.items():
        (output / name).write_bytes(contents)
    (output / 'manifest.json').write_bytes(ds.json_bytes(manifest))
    return report


def load_model(data_dir=td.DEFAULT_OUTPUT, output=DEFAULT_OUTPUT):
    """Check hashes/coverage; load JSON, never fit or import pickle during inference."""
    td.validate_artifacts(data_dir)
    output = Path(output)
    manifest = ds.read_json(output / 'manifest.json')
    ds.require(manifest['clinical_review_status'] == 'not_reviewed' and manifest['label_method'] == 'rule_derived', 'Invalid model review/label provenance.')
    ds.require(manifest['model_trained'] is True and manifest['api_enabled'] is False and
               manifest['publication_enabled'] is False and manifest['live_patient_data_used'] is False, 'Invalid experiment scope flags.')
    ds.require(manifest['bindings'] == current_bindings(data_dir), 'Model artifact is stale: dataset, criteria, engine or training source changed.')
    required = {'model.json', 'evaluation.json', 'errors.json', 'evaluation.md', 'tree.txt'}
    ds.require(set(manifest['artifact_sha256']) == required, 'Unexpected model artifact set.')
    for name, expected_hash in manifest['artifact_sha256'].items():
        ds.require(ds.file_hash(output / name) == expected_hash, f'Model artifact hash mismatch: {name}')
    artifact = ds.read_json(output / 'model.json')
    _, _, criteria, _ = ds.knowledge()
    tree.validate_model(artifact['learner'], criteria['feature_allowlist'])
    ds.require(artifact['learner']['labels'] == sorted(LABELS) and
               artifact['learner']['hyperparameters'] == td.plan()['hyperparameters'], 'Unexpected learned classes/hyperparameters.')
    ds.require(artifact == model_artifact(artifact['learner']), 'Model provenance/scope flags do not match the unreviewed experiment.')
    ds.require(artifact['model_version'] == manifest['model_version'] == td.plan()['model_version'], 'Model version mismatch.')
    return artifact


def validate_run(data_dir=td.DEFAULT_OUTPUT, output=DEFAULT_OUTPUT):
    artifact = load_model(data_dir, output)
    output = Path(output)
    validation = td.validate_artifacts(data_dir)
    batch = ds.read_json(Path(data_dir) / 'batch.json')
    report, errors = evaluate(artifact['learner'], batch, validation)
    ds.require(ds.read_json(output / 'evaluation.json') == report, 'Saved evaluation does not reproduce from the loaded model.')
    ds.require(ds.read_json(output / 'errors.json') == errors, 'Saved error report is stale.')
    ds.require((output / 'evaluation.md').read_bytes() == report_markdown(report, errors).encode('utf-8'), 'Saved Markdown evaluation is stale.')
    ds.require((output / 'tree.txt').read_bytes() == tree.tree_text(artifact['learner']).encode('utf-8'), 'Saved tree explanation is stale.')
    manifest = ds.read_json(output / 'manifest.json')
    training = td.unique_rows(split_rows(batch)['train'])
    ds.require(manifest['training_unique_row_ids'] == [row['row_id'] for row in training], 'Training split provenance mismatch.')
    ds.require(manifest['fit_unique_inputs'] == artifact['learner']['training_unique_inputs'] == len(training), 'Training support mismatch.')
    ds.require(manifest['family_splits'] == {family['id']: family['split'] for family in td.template_families()}, 'Family partition mismatch.')
    vocabulary = {name: sorted({tree.token(row['model_features'][name]) for row in training}) for name in artifact['learner']['feature_names']}
    ds.require(artifact['learner']['vocabulary'] == vocabulary, 'Vocabulary was not fitted exclusively on training inputs.')
    return report


def predict_synthetic(scenario_id, candidate_id, data_dir=td.DEFAULT_OUTPUT, output=DEFAULT_OUTPUT):
    artifact = load_model(data_dir, output)
    batch = ds.read_json(Path(data_dir) / 'batch.json')
    row = next((row for row in batch['candidate_rows'] if row['scenario_id'] == scenario_id and row['candidate_id'] == candidate_id), None)
    ds.require(row is not None, 'Choose an existing frozen synthetic scenario/product; live records are not accepted.')
    if row['condition'] not in artifact['supported_conditions']:
        prediction = {'label': None, 'status': 'abstained', 'reason': 'unsupported_or_unknown_condition', 'path': []}
    elif row['condition'] not in artifact['candidate_definitions'][candidate_id]['roles']:
        prediction = {'label': None, 'status': 'abstained', 'reason': 'candidate_outside_condition_mapping', 'path': []}
    else:
        prediction = tree.predict(artifact['learner'], row['model_features'])
    return {
        'presentation_label': 'Experimental ML', 'synthetic_only': True,
        'model_version': artifact['model_version'], 'scenario_id': scenario_id, 'candidate_id': candidate_id,
        'purpose': row['candidate_purpose'], 'clinical_role': row['clinical_role'],
        'provisional_relevance_prediction': prediction, 'label_provenance': artifact['label_provenance'],
        'clinical_review_status': 'not_reviewed',
        'deterministic_findings': row['research_safety'],
        'coverage_limits': ['Influenza/Chickenpox pilot products only; fixed synthetic fixtures only.',
                            'Condition/purpose/symptom relevance only; allergy/interaction/contraindication/dose remain deterministic.',
                            'Rule-imitation baseline; no independent clinical validation or medical confidence.',
                            'One candidate per supported role group; no meaningful within-group ranking.'],
        'prescription_selection_enabled': False, 'publication_enabled': False,
        'review_required': True,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('train', 'validate', 'predict-synthetic'))
    parser.add_argument('--data-dir', type=Path, default=td.DEFAULT_OUTPUT)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--scenario-id')
    parser.add_argument('--candidate-id')
    args = parser.parse_args(argv)
    try:
        if args.action == 'predict-synthetic':
            ds.require(args.scenario_id is not None and args.candidate_id is not None, 'Synthetic prediction requires --scenario-id and --candidate-id.')
            result = predict_synthetic(args.scenario_id, args.candidate_id, args.data_dir, args.output)
        else:
            report = train(args.data_dir, args.output) if args.action == 'train' else validate_run(args.data_dir, args.output)
            result = {'validation': 'passed', 'model_version': report['model_version'], 'fit_unique_inputs': report['fit_unique_inputs'],
                      'agreement_with_rule_derived_labels': {split: data['unique_input_metrics']['agreement_with_provisional_labels']
                                                            for split, data in report['splits'].items()},
                      'errors_and_abstentions': {split: {key: data['unique_input_metrics'][key] for key in ('errors_including_abstentions', 'abstentions')}
                                               for split, data in report['splits'].items()},
                      'clinical_review_status': 'not_reviewed', 'output': str(args.output.resolve())}
    except (ds.ValidationError, OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f'Offline experiment failed: {error}\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
