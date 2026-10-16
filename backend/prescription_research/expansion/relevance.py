"""Small six-condition provisional relevance batch. Offline only, no model fitting."""

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import csv
import hashlib
import io
import json
import re
from pathlib import Path

from prescription_research import dataset as ds
from . import check, knowledge as kn, screening as sc

VERSION = 'six-condition-synthetic-relevance-2026-10-16-v1'
SCHEMA_VERSION = '1.0'
ADAPTER_VERSION = 'six-condition-relevance-adapter-v1'
DEFAULT_OUTPUT = ds.ROOT / 'docs/research/six_condition_relevance_v1'
CRITERIA_PATH = kn.HERE / 'relevance_criteria.json'
TEMPLATE_PATH = kn.HERE / 'relevance_templates.json'
SCHEMA_PATH = kn.HERE / 'relevance.schema.json'
FEATURES = ('condition', 'candidate_id', 'purpose', 'clinical_role', *(name + '_present' for name in kn.SYMPTOMS))
LABELS = ('relevant', 'not_relevant', 'undetermined')
INPUT_PATHS = kn.INPUT_PATHS + tuple('backend/prescription_research/expansion/' + name for name in (
    'relevance.py', 'relevance_criteria.json', 'relevance_templates.json', 'relevance.schema.json'))


def configuration():
    criteria = ds.read_json(CRITERIA_PATH)
    templates = ds.read_json(TEMPLATE_PATH)
    ds.require(set(criteria) == {'version', 'label_method', 'clinical_review_status', 'task', 'labels', 'feature_allowlist',
        'decision_order', 'mapping_source', 'safety_excluded_from_target_and_model', 'interpretation'}, 'Unknown criteria metadata/review fields.')
    ds.require(criteria['version'] == 'six-condition-provisional-relevance-2026-10-16-v1', 'Criteria version changed.')
    ds.require(criteria['label_method'] == 'rule_derived' and criteria['clinical_review_status'] == 'not_reviewed', 'Labels must remain rule-derived and not reviewed.')
    ds.require(criteria['feature_allowlist'] == list(FEATURES) and criteria['labels'] == list(LABELS), 'Unversioned task/feature change.')
    ds.require([item['id'] for item in criteria['decision_order']] == ['unsupported_condition', 'unmapped_candidate', 'mapped_antiviral', 'target_present', 'targets_absent', 'target_unknown'], 'Criteria decision order differs from the executable target definition.')
    ds.require(all(set(item) == {'id', 'rule'} and isinstance(item['rule'], str) and item['rule'] for item in criteria['decision_order']), 'Invalid criterion definition.')
    ds.require(set(templates) == {'version', 'dataset_version', 'schema_version', 'split_method', 'initial_context_limit', 'families'}, 'Unknown template metadata/review fields.')
    ds.require(templates['dataset_version'] == VERSION and templates['schema_version'] == SCHEMA_VERSION, 'Template version mismatch.')
    families = templates['families']
    ds.require(len({f['id'] for f in families}) == len(families), 'Duplicate template family.')
    ds.require({f['split'] for f in families} == {'train', 'validation', 'test'}, 'Missing/unknown split.')
    ds.require(type(templates['initial_context_limit']) is int and 1 <= templates['initial_context_limit'] <= 64, 'Initial inspection batch cannot expand before schema/label checks.')
    for family in families:
        ds.require(set(family) in ({'id', 'split', 'pattern', 'context', 'duration_hours', 'description'},
                                  {'id', 'split', 'pattern', 'context', 'duration_hours', 'description', 'conditions'}), 'Unknown family fields.')
        ds.require(isinstance(family['id'], str) and re.fullmatch(r'[a-z][a-z0-9_]{0,99}', family['id']), 'Invalid family identity.')
        conditions = family.get('conditions', list(kn.CONDITIONS))
        ds.require(isinstance(conditions, list) and 1 <= len(conditions) <= 6
                   and all(value is None or isinstance(value, str) for value in conditions)
                   and len(conditions) == len(set(conditions)), 'Duplicate/invalid family condition variants.')
    return criteria, templates


def evidence_registry(products):
    sources = {}
    for product in products.values():
        for source in product['sources']:
            ds.require(source['id'] not in sources or sources[source['id']] == source, 'Conflicting evidence metadata.')
            sources[source['id']] = deepcopy(source)
    # Preserve the unresolved guidance provenance recorded by the Step 8B builder.
    files, _ = check.build_artifacts()
    unresolved = json.loads(files['bundle.json'])['unresolved_products'][0]
    for identity, url in zip(unresolved['source_ids'], unresolved['source_urls']):
        sources[identity] = {'id': identity, 'url': url, 'source_handling': deepcopy(unresolved['source_handling']),
                             'scope': 'Guidance only; no verified local product identity or patient-level clinical label.'}
    return dict(sorted(sources.items()))


def condition_targets(condition, policies):
    return list(dict.fromkeys(name for policy in policies if policy['condition'] == condition for name in policy['target_symptoms']))


def presence_pattern(pattern, size):
    if pattern == 'all_present':
        return [True] * size
    if pattern == 'all_absent':
        return [False] * size
    if pattern == 'all_unknown':
        return [None] * size
    if pattern == 'first_present_rest_absent':
        return [True] + [False] * (size - 1)
    if pattern == 'first_unknown_rest_absent':
        return [None] + [False] * (size - 1)
    if pattern == 'first_present_rest_unknown':
        return [True] + [None] * (size - 1)
    if pattern == 'first_absent_rest_unknown':
        return [False] + [None] * (size - 1) if size > 1 else [None]
    raise ds.ValidationError('Unknown scenario-generation pattern.')


def build_scenarios(templates, policies):
    bases = {c['condition']: c for c in check.check_cases() if c['case_id'].endswith('--supplied_context')}
    scenarios = []
    for family in templates['families']:
        for variant, condition in enumerate(family.get('conditions', list(kn.CONDITIONS)), 1):
            base = deepcopy(bases[condition if condition in kn.CONDITIONS else 'influenza'])
            base.update(case_id=f'SIX-{family["id"]}-{variant:02d}', condition=condition, reported_observations={})
            patient = base['patient_features']
            patient['symptoms'] = {name: {'present': None, 'duration_hours': None} for name in kn.SYMPTOMS}
            targets = condition_targets(condition, policies) if condition in kn.CONDITIONS else list(kn.SYMPTOMS)
            for name, present in zip(targets, presence_pattern(family['pattern'], len(targets))):
                patient['symptoms'][name] = {'present': present, 'duration_hours': family['duration_hours'] if present is True else None}
            mode = family['context']
            if mode == 'missing':
                base['patient_features'] = {}
            elif mode == 'unknown_histories':
                for key in ('allergy_history', 'current_medicines'):
                    patient[key] = {'status': 'unknown', 'mentions': []}
                patient['age_years'] = None
            elif mode == 'reported_concern':
                base['reported_observations']['hydration_concern'] = True
            elif mode == 'late_onset':
                patient['onset_hours'] = 96
                patient['age_years'] = 61
            elif mode == 'outside_adult_scope':
                patient['age_years'], patient['weight_kg'] = 16, None
                patient['assessments']['ophthalmic_integrity'] = 'unknown'
            elif mode == 'unresolved_medicine':
                patient['current_medicines'] = {'status': 'reported', 'mentions': ['Unresolved synthetic medicine']}
            else:
                ds.require(mode == 'supplied', 'Unknown synthetic context mechanism.')
            base = sc.normalize_case(base)
            scenarios.append({'scenario_id': base.pop('case_id'), 'template_family': family['id'],
                              'variant_id': variant, 'split': family['split'], **base})
    ds.require(len(scenarios) <= templates['initial_context_limit'], 'Inspect the small batch before any expansion.')
    return scenarios


def as_case(scenario):
    return {'case_id': scenario['scenario_id'], **{name: scenario[name] for name in (
        'synthetic_only', 'fact_origin', 'condition', 'patient_features', 'reported_observations')}}


def mapped_policy(condition, identity, policies):
    return next((p for p in policies if p['condition'] == condition and p['candidate_id'] == identity), None)


def candidate_metadata(condition, identity, policies):
    uses = [p for p in policies if p['candidate_id'] == identity]
    ds.require(bool(uses), 'Unknown research candidate identity.')
    policy = mapped_policy(condition, identity, policies)
    return uses[0]['purpose'], policy['clinical_role'] if policy else 'unmapped_for_condition', policy


def candidate_definitions(products, policies):
    definitions = []
    for identity in sorted(kn.HANDLERS):
        product = products.get(identity)
        uses = [p for p in policies if p['candidate_id'] == identity]
        definitions.append({'candidate_id': identity, 'purpose': uses[0]['purpose'],
            'display_name': product['generic_name'] if product else 'ORS planning identity; exact product unresolved',
            'identity_status': 'source_reference_product' if product else 'unresolved_planning_identity',
            'strength': product['strength'] if product else None, 'form': product['form'] if product else None,
            'route': product['route'] if product else None, 'standard_concept': deepcopy(product['standard_concept']) if product else None,
            'policy_ids': [p['id'] for p in uses], 'clinical_review_status': 'not_reviewed'})
    return definitions


def model_features(scenario, identity, policies):
    purpose, role, _ = candidate_metadata(scenario['condition'], identity, policies)
    return {'condition': scenario['condition'], 'candidate_id': identity, 'purpose': purpose, 'clinical_role': role,
            **{name + '_present': scenario['patient_features']['symptoms'][name]['present'] for name in kn.SYMPTOMS}}


def relevance_target(scenario, identity, policies):
    _, _, policy = candidate_metadata(scenario['condition'], identity, policies)
    if scenario['condition'] not in kn.CONDITIONS:
        value, criterion = 'undetermined', 'unsupported_condition'
    elif policy is None:
        value, criterion = 'not_relevant', 'unmapped_candidate'
    elif policy['purpose'] == 'antiviral':
        value, criterion = 'relevant', 'mapped_antiviral'
    else:
        presence = [scenario['patient_features']['symptoms'][name]['present'] for name in policy['target_symptoms']]
        if any(item is True for item in presence):
            value, criterion = 'relevant', 'target_present'
        elif presence and all(item is False for item in presence):
            value, criterion = 'not_relevant', 'targets_absent'
        else:
            value, criterion = 'undetermined', 'target_unknown'
    return {'value': value, 'criterion_id': criterion, 'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed'}


def safety_summary(result):
    return {'evaluation_status': 'selected_static_rules_evaluated' if result else 'outside_condition_mapping',
            'aggregate_status': result['aggregate_status'] if result else 'not_evaluated',
            'findings': deepcopy(result['findings']) if result else [],
            'experimental_reference_available': result['experimental_reference'] is not None if result else None,
            'simulation_only': True, 'review_gate_evaluated': False, 'eligible_for_prescription': False,
            'full_safety_clearance': False, 'approved': False, 'published': False}


def candidate_rows(scenarios, knowledge, criteria, templates):
    products, policies, _ = knowledge
    rows = []
    for scenario in scenarios:
        safety = {row['candidate_id']: row for row in sc.evaluate_case(as_case(scenario), knowledge)['results']}
        for identity in sorted(kn.HANDLERS):
            purpose, role, policy = candidate_metadata(scenario['condition'], identity, policies)
            sources = policy['source_ids'] if policy else sorted({source for p in policies if p['candidate_id'] == identity for source in p['source_ids']})
            rows.append({'row_id': scenario['scenario_id'] + '::' + identity,
                **{name: scenario[name] for name in ('scenario_id', 'template_family', 'split', 'condition')},
                'candidate_id': identity, 'candidate_purpose': purpose, 'clinical_role': role,
                'mapping_status': 'unsupported_condition' if scenario['condition'] not in kn.CONDITIONS else 'mapped' if policy else 'unmapped',
                'identity_status': 'unresolved_planning_identity' if identity == kn.ORS else 'source_reference_product',
                'group_key': f'{scenario["condition"] or "unknown"}::{purpose}::{role}',
                'model_features': model_features(scenario, identity, policies),
                'relevance_target': relevance_target(scenario, identity, policies),
                'label_source_ids': sorted(sources), 'research_safety': safety_summary(safety.get(identity)),
                'clinical_review_status': 'not_reviewed', 'synthetic_only': True,
                'versions': {'dataset': VERSION, 'schema': SCHEMA_VERSION, 'criteria': criteria['version'],
                             'templates': templates['version'], 'knowledge': kn.VERSION, 'engine': sc.ENGINE_VERSION,
                             'adapter': ADAPTER_VERSION, 'policy': policy['version'] if policy else None},
                'catalogue_content_sha256': ds.content_hash(products[identity]) if identity in products else None,
                'policy_content_sha256': ds.content_hash(policy) if policy else None})
    return rows


def build_batch():
    knowledge = kn.load_knowledge()
    criteria, templates = configuration()
    scenarios = build_scenarios(templates, knowledge[1])
    return {'schema_version': SCHEMA_VERSION, 'dataset_version': VERSION, 'synthetic_only': True,
            'clinical_review_status': 'not_reviewed', 'evidence_references': evidence_registry(knowledge[0]),
            'candidate_definitions': candidate_definitions(knowledge[0], knowledge[1]),
            'scenarios': scenarios, 'candidate_rows': candidate_rows(scenarios, knowledge, criteria, templates)}


def validate_batch(batch):
    try:
        ds.check_schema(batch, ds.read_json(SCHEMA_PATH))
    except OverflowError as error:
        raise ds.ValidationError('Non-finite or oversized numeric input.') from error
    knowledge = kn.load_knowledge()
    criteria, templates = configuration()
    expected_scenarios = build_scenarios(templates, knowledge[1])
    ds.require(batch['scenarios'] == expected_scenarios, 'Scenario drift, duplicate/missing family variants or split leakage.')
    for scenario in batch['scenarios']:
        sc.normalize_case(as_case(scenario))
        for symptom in scenario['patient_features']['symptoms'].values():
            ds.require(symptom['present'] is True or symptom['duration_hours'] is None, 'Absent/unknown facts cannot receive invented durations.')
    expected_rows = candidate_rows(expected_scenarios, knowledge, criteria, templates)
    ds.require(batch['candidate_rows'] == expected_rows, 'Feature/label/provenance/safety drift, duplicate or missing candidate row.')
    ds.require(batch['evidence_references'] == evidence_registry(knowledge[0]), 'Evidence provenance drift.')
    ds.require(batch['candidate_definitions'] == candidate_definitions(knowledge[0], knowledge[1]), 'Candidate identity or treatment-purpose drift.')
    return make_report(batch, knowledge[1], criteria, templates)


def tally(rows):
    return dict(sorted(Counter(row['relevance_target']['value'] for row in rows).items()))


def feature_key(row):
    return ds.content_hash(row['model_features'])


def make_report(batch, policies, criteria, templates):
    rows, scenarios = batch['candidate_rows'], batch['scenarios']
    mapped = [r for r in rows if r['mapping_status'] == 'mapped']
    splits = {}
    feature_splits = {split: {feature_key(r) for r in rows if r['split'] == split} for split in ('train', 'validation', 'test')}
    mapped_feature_splits = {split: {feature_key(r) for r in mapped if r['split'] == split} for split in ('train', 'validation', 'test')}
    for split in ('train', 'validation', 'test'):
        local = [r for r in rows if r['split'] == split]
        local_mapped = [r for r in local if r['mapping_status'] == 'mapped']
        splits[split] = {'scenarios': sum(s['split'] == split for s in scenarios),
            'families': sorted({r['template_family'] for r in local}), 'rows': len(local), 'mapped_rows': len(local_mapped),
            'class_balance': tally(local), 'mapped_class_balance': tally(local_mapped),
            'missing_classes': sorted(set(LABELS) - set(tally(local_mapped))), 'unique_model_inputs': len(feature_splits[split]),
            'unique_mapped_model_inputs': len(mapped_feature_splits[split]),
            'mapped_inputs_also_in_train': len(mapped_feature_splits[split] & mapped_feature_splits['train']) if split != 'train' else None,
            'novel_mapped_inputs_relative_to_train': len(mapped_feature_splits[split] - mapped_feature_splits['train']) if split != 'train' else None,
            'model_inputs_also_in_train': len(feature_splits[split] & feature_splits['train']) if split != 'train' else None}
    groups = {}
    for policy in policies:
        group = [r for r in mapped if r['candidate_id'] == policy['candidate_id'] and r['condition'] == policy['condition']]
        groups[policy['id']] = {'condition': policy['condition'], 'purpose': policy['purpose'], 'clinical_role': policy['clinical_role'],
            'candidate_ids': sorted({r['candidate_id'] for r in group}), 'rows': len(group), 'class_balance': tally(group),
            'by_split': {split: {'class_balance': tally([r for r in group if r['split'] == split]),
                                'missing_classes': sorted(set(LABELS) - set(tally([r for r in group if r['split'] == split])))} for split in ('train', 'validation', 'test')},
            'constant_target': len(tally(group)) == 1, 'within_group_ranking_meaningful': False}
    feature_labels = defaultdict(set)
    for row in rows:
        feature_labels[feature_key(row)].add(row['relevance_target']['value'])
    conflicts = sum(len(labels) > 1 for labels in feature_labels.values())
    ds.require(conflicts == 0, 'Identical allowed model inputs have conflicting labels.')
    mapped_keys = {feature_key(r) for r in mapped}
    return {'validation': 'passed', 'dataset_version': VERSION, 'criteria_version': criteria['version'],
        'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed',
        'counts': {'synthetic_contexts': len(scenarios), 'candidate_rows': len(rows), 'template_families': len(templates['families']),
            'supported_conditions': len(kn.CONDITIONS), 'candidate_identities': len(kn.HANDLERS),
            'resolved_products': 5, 'unresolved_planning_identities': 1, 'condition_mapped_rows': len(mapped),
            'contrast_rows': sum(r['mapping_status'] == 'unmapped' for r in rows),
            'unsupported_condition_rows': sum(r['mapping_status'] == 'unsupported_condition' for r in rows),
            'unique_model_inputs': len(feature_labels), 'unique_mapped_model_inputs': len(mapped_keys)},
        'class_balance': tally(rows), 'mapped_class_balance': tally(mapped), 'by_split': splits,
        'by_condition': {condition: {'class_balance': tally([r for r in rows if r['condition'] == condition]),
                                    'mapped_class_balance': tally([r for r in mapped if r['condition'] == condition])} for condition in kn.CONDITIONS},
        'purpose_groups': groups, 'constant_target_groups': [key for key, value in groups.items() if value['constant_target']],
        'model_feature_allowlist': list(FEATURES), 'conflicting_identical_inputs': conflicts,
        'split_overlap_inputs': {a + '--' + b: len(feature_splits[a] & feature_splits[b]) for a, b in (
            ('train', 'validation'), ('train', 'test'), ('validation', 'test'))},
        'mapped_safety_statuses': dict(sorted(Counter(r['research_safety']['aggregate_status'] for r in mapped).items())),
        'relevant_but_blocked_or_unknown': sum(r['relevance_target']['value'] == 'relevant' and r['research_safety']['aggregate_status'] in ('blocked', 'cannot_validate') for r in mapped),
        'ors_relevant_but_identity_blocked': sum(r['candidate_id'] == kn.ORS and r['relevance_target']['value'] == 'relevant' and r['research_safety']['aggregate_status'] == 'blocked' for r in mapped),
        'family_split_leakage': False, 'preprocessing_fitted': False, 'model_trained': False, 'held_out_agreement': None,
        'clinical_validation_performed': False, 'prescription_eligible_rows': 0, 'live_patient_data_used': False,
        'limitations': ['Labels imitate documented researcher-defined rules; there is no independent clinical ground truth.',
            'Purpose/role lookup is part of the bounded task and can proxy the mapping rules.',
            'One candidate per purpose group; no meaningful within-group alternative ranking.',
            'Mapped antiviral targets are constant; do not force per-group discrimination metrics.',
            'Template-family separation is enforced, but exact model inputs can repeat across splits; reported overlap limits novelty claims.',
            'Only a small set of symptom patterns is covered. This is an inspection batch, not a trained or clinically validated model.',
            'ORS is an unresolved planning identity: purpose relevance never supplies composition, dilution or a dose.',
            'Contrast rows dominate the overall distribution; future evaluation must report mapped-purpose and condition-level results separately.']}


def inspection_csv(rows):
    fields = ['row_id', 'scenario_id', 'template_family', 'split', 'condition', 'candidate_id', 'candidate_purpose',
              'clinical_role', 'mapping_status', 'identity_status', *[name + '_present' for name in kn.SYMPTOMS],
              'provisional_label', 'criterion_id', 'label_method', 'clinical_review_status', 'safety_status', 'source_ids']
    stream = io.StringIO(newline='')
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator='\n')
    writer.writeheader()
    for row in rows:
        item = {key: row[key] for key in fields if key in row}
        for name in kn.SYMPTOMS:
            value = row['model_features'][name + '_present']
            item[name + '_present'] = 'unknown' if value is None else 'present' if value else 'absent'
        target = row['relevance_target']
        item.update(provisional_label=target['value'], criterion_id=target['criterion_id'], label_method=target['label_method'],
                    safety_status=row['research_safety']['aggregate_status'], source_ids=';'.join(row['label_source_ids']))
        writer.writerow(item)
    return stream.getvalue().encode('utf-8')


def report_markdown(report):
    return '\n'.join(['# Six-condition synthetic relevance inspection batch', '',
        '**Offline; provisional rule-derived labels; clinical review: not_reviewed. No model fitted.**', '',
        '## Actual counts', '', *[f'- {key}: {value}' for key, value in report['counts'].items()], '',
        f"All-row class balance: `{json.dumps(report['class_balance'], sort_keys=True)}`.",
        f"Mapped-purpose class balance: `{json.dumps(report['mapped_class_balance'], sort_keys=True)}`.", '',
        '## Frozen family splits', '',
        '| Split | Contexts | Rows | Mapped rows | Unique inputs | Inputs also in train |', '| --- | ---: | ---: | ---: | ---: | ---: |',
        *[f'| {split} | {v["scenarios"]} | {v["rows"]} | {v["mapped_rows"]} | {v["unique_model_inputs"]} | {v["model_inputs_also_in_train"] if split != "train" else "n/a"} |' for split, v in report['by_split'].items()], '',
        f"Exact input overlaps: `{json.dumps(report['split_overlap_inputs'], sort_keys=True)}`. Families never cross splits; input overlap is reported, not concealed.", '',
        f"Mapped rows relevant but blocked/unknown: {report['relevant_but_blocked_or_unknown']}; relevant ORS rows still identity-blocked: {report['ors_relevant_but_identity_blocked']}.",
        f"Constant-target groups: {', '.join(report['constant_target_groups'])}. No meaningful within-group ranking.", '',
        '## Mapped-purpose group variation', '',
        '| Group | Relevant | Not relevant | Undetermined | Candidates |', '| --- | ---: | ---: | ---: | ---: |',
        *[f'| {key} | {g["class_balance"].get("relevant", 0)} | {g["class_balance"].get("not_relevant", 0)} | {g["class_balance"].get("undetermined", 0)} | {len(g["candidate_ids"])} |' for key, g in report['purpose_groups'].items()], '',
        'Held-out agreement: not measured. Preprocessing/model fitting: not performed. Prescription-eligible rows: 0.', '',
        '## Limits', '', *['- ' + item for item in report['limitations']], '',
        'See backend/prescription_context/STEP8C.md for task, provenance, commands and next-model requirements.', '']).encode('utf-8')


def artifacts():
    batch = build_batch()
    report = validate_batch(batch)  # No artifacts are written before schema/label checks pass.
    files = {'batch.json': ds.json_bytes(batch), 'inspection_rows.csv': inspection_csv(batch['candidate_rows']),
             'schema.json': SCHEMA_PATH.read_bytes(), 'criteria.json': CRITERIA_PATH.read_bytes(),
             'templates.json': TEMPLATE_PATH.read_bytes(), 'validation_report.json': ds.json_bytes(report),
             'validation_report.md': report_markdown(report)}
    manifest = {'dataset_version': VERSION, 'clinical_review_status': 'not_reviewed', 'label_method': 'rule_derived',
                'inputs': {name: ds.file_hash(ds.ROOT / name) for name in INPUT_PATHS},
                'outputs': {name: hashlib.sha256(content).hexdigest() for name, content in files.items()},
                'family_splits': {f['id']: f['split'] for f in configuration()[1]['families']},
                'model_trained': False, 'live_patient_data_used': False}
    files['manifest.json'] = ds.json_bytes(manifest)
    return files, report


def export(output):
    files, report = artifacts()
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (output / name).write_bytes(content)
    return report


def validate_artifacts(output):
    files, report = artifacts()
    for name, content in files.items():
        ds.require((Path(output) / name).read_bytes() == content, f'Stale or altered relevance artifact: {name}')
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--validate', action='store_true')
    args = parser.parse_args(argv)
    try:
        report = validate_artifacts(args.output) if args.validate else export(args.output)
    except (ValueError, OSError, TypeError, KeyError) as error:
        parser.exit(1, f'Offline relevance batch failed: {error}\n')
    print(json.dumps({key: report[key] for key in ('validation', 'dataset_version', 'counts', 'class_balance',
          'mapped_class_balance', 'constant_target_groups', 'split_overlap_inputs', 'model_trained', 'held_out_agreement')}, indent=2))


if __name__ == '__main__':
    main()
