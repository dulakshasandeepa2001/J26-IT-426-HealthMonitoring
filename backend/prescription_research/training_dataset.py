"""Additive v2 synthetic batch; preserve the checked Step 7A batch and criteria."""

import argparse
from collections import defaultdict
import hashlib
import json
from itertools import product as cartesian_product
from pathlib import Path
import random
import sys

if str(Path(__file__).resolve().parents[1]) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from prescription_research import dataset as ds

DEFAULT_OUTPUT = ds.ROOT / 'docs/research/synthetic_prescription_v2'
PLAN_PATH = ds.HERE / 'training_plan.json'
INPUT_PATHS = ds.INPUT_PATHS + (
    'backend/prescription_research/training_plan.json',
    'backend/prescription_research/training_dataset.py',
)
SYMPTOMS = ('fever', 'body_aches', 'itching')


def plan():
    return ds.read_json(PLAN_PATH)


def schema_for_training():
    schema = ds.read_json(ds.HERE / 'schema.json')
    settings = plan()
    schema['$id'] = 'meditrack:synthetic-prescription-batch:1.1'
    schema['title'] = 'Step 7B factorial symptom-family synthetic batch'
    schema['properties']['schema_version']['const'] = settings['schema_version']
    schema['properties']['dataset_version']['const'] = settings['dataset_version']
    schema['properties']['scenarios']['maxItems'] = 200
    schema['properties']['candidate_rows']['maxItems'] = 800
    schema['$defs']['scenario']['properties']['variant_id']['maximum'] = 3
    schema['$defs']['scenario']['properties']['as_of_date']['const'] = settings['as_of_date']
    for name in ('scenario', 'row'):
        schema['$defs'][name]['required'].append('base_scenario_id')
        schema['$defs'][name]['properties']['base_scenario_id'] = {'type': 'string', 'minLength': 1}
    return schema


def template_families():
    settings = plan()
    families = []
    tokens = {True: 'P', False: 'N', None: 'U'}
    for states in cartesian_product(settings['symptom_states'], repeat=3):
        family_id = 'symptoms-' + ''.join(tokens[state] for state in states)
        families.append({'id': family_id, 'presence': dict(zip(SYMPTOMS, states))})
    order = list(range(len(families)))
    random.Random(settings['split_seed']).shuffle(order)
    start = 0
    for split, count in settings['supported_family_counts'].items():
        for index in order[start:start + count]:
            families[index]['split'] = split
        start += count
    ds.require(start == len(families), 'Plan must partition every supported family.')
    families.append({'id': 'unsupported-condition', 'presence': {name: None for name in SYMPTOMS},
                     'split': settings['unsupported_family_split']})
    return families


def patient_context(condition, presence, variant, index, rng):
    patient = {
        'age_years': rng.randint(18, 70), 'weight_kg': None, 'onset_hours': 12,
        'symptoms': {name: {'present': state, 'duration_hours': 12 if state is True else None}
                     for name, state in presence.items()},
        'allergy_history': {'status': 'none', 'mentions': []},
        'current_medicines': {'status': 'none', 'mentions': []},
        'assessments': {
            'red_flags': 'none', 'special_population': 'standard',
            'hepatic_assessment': 'standard', 'renal_assessment': 'standard',
            'varicella_risk': 'risk_group_confirmed' if condition == 'chickenpox' else 'unknown',
            'laiv_timing': 'no_conflict', 'topical_assessment': 'standard',
        },
    }
    if variant == 'missing_context':
        patient.update(age_years=None, weight_kg=None, onset_hours=None)
        patient['allergy_history'] = {'status': 'unknown', 'mentions': []}
        patient['current_medicines'] = {'status': 'unknown', 'mentions': []}
        patient['assessments'] = {key: 'unknown' for key in patient['assessments']}
        for symptom in patient['symptoms'].values():
            symptom['duration_hours'] = None
    elif variant == 'safety_obstacle':
        if index % 3 == 0:
            patient.update(age_years=8, weight_kg=20)
            patient['allergy_history'] = {'status': 'reported', 'mentions': ['Paracetamol (Rash)']}
            patient['current_medicines'] = {'status': 'reported', 'mentions': ['paracetamol 500 mg tablet']}
            patient['assessments']['varicella_risk'] = 'typical_uncomplicated_child' if condition == 'chickenpox' else 'unknown'
        elif index % 3 == 1:
            patient['assessments']['red_flags'] = 'present'
            patient['assessments']['renal_assessment'] = 'requires_adjustment'
            patient['assessments']['hepatic_assessment'] = 'requires_review'
            patient['assessments']['topical_assessment'] = 'requires_review'
            patient['onset_hours'] = 96
        else:
            patient['allergy_history'] = {'status': 'reported', 'mentions': ['Penicillin (Rash)']}
            patient['current_medicines'] = {'status': 'reported', 'mentions': ['Paracetamol 500mg SOS']}
            patient['assessments']['laiv_timing'] = 'unknown'
    if condition not in ('influenza', 'chickenpox'):
        # Unknown/unsupported cases deliberately have no fabricated assessments.
        patient.update(age_years=None, weight_kg=None, onset_hours=None)
        patient['allergy_history'] = {'status': 'unknown', 'mentions': []}
        patient['current_medicines'] = {'status': 'unknown', 'mentions': []}
        patient['assessments'] = {key: 'unknown' for key in patient['assessments']}
    return patient


def build_batch():
    settings = plan()
    products, policies, criteria, _ = ds.knowledge()
    rng = random.Random(settings['context_seed'])
    scenarios, rows = [], []
    for index, family in enumerate(template_families()):
        conditions = settings['unsupported_conditions'] if family['id'] == 'unsupported-condition' else criteria['supported_conditions']
        for condition in conditions:
            base_id = f'SYN2-{family["id"]}-{condition or "unknown"}'
            for variant_id, variant in enumerate(settings['variants'], 1):
                scenario = {
                    'scenario_id': f'{base_id}-{variant_id:02d}', 'base_scenario_id': base_id,
                    'template_family': family['id'], 'variant_id': variant_id,
                    'split': family['split'], 'condition': condition,
                    'as_of_date': settings['as_of_date'], 'data_origin': 'synthetic_template',
                    'clinical_review_status': 'not_reviewed',
                    'patient_features': patient_context(condition, family['presence'], variant, index, rng),
                }
                scenarios.append(scenario)
                safety = ds.safety_for_scenario(scenario, products, policies, criteria)
                for product_id, candidate in products.items():
                    purpose, role, _ = ds.candidate_metadata(condition, product_id, criteria)
                    version = ds.versions(candidate, policies[product_id], criteria, {'version': settings['template_version']})
                    version.update(schema=settings['schema_version'], dataset=settings['dataset_version'])
                    rows.append({
                        'row_id': f'{scenario["scenario_id"]}::{product_id}',
                        'scenario_id': scenario['scenario_id'], 'base_scenario_id': base_id,
                        'template_family': family['id'], 'split': family['split'], 'condition': condition,
                        'candidate_id': product_id, 'candidate_purpose': purpose, 'clinical_role': role,
                        'group_key': f'{condition or "unknown"}::{purpose}::{role}',
                        'model_features': ds.model_features(scenario, product_id, criteria),
                        'relevance_target': ds.relevance_target(scenario, product_id, criteria),
                        'label_source_ids': ds.label_sources(condition, candidate),
                        'research_safety': safety.get(product_id, ds.outside_scope()),
                        'clinical_review_status': 'not_reviewed', 'versions': version,
                        'catalogue_content_sha256': ds.content_hash(candidate),
                        'rule_content_sha256': ds.content_hash(policies[product_id]),
                    })
    return {'schema_version': settings['schema_version'], 'dataset_version': settings['dataset_version'],
            'synthetic_only': True, 'clinical_review_status': 'not_reviewed',
            'scenarios': scenarios, 'candidate_rows': rows}


def mapped_rows(batch):
    # A static condition-mapping boundary, never a selection based on safety outcomes.
    _, _, criteria, _ = ds.knowledge()
    return [row for row in batch['candidate_rows'] if row['condition'] in criteria['products'][row['candidate_id']]['roles']]


def unique_rows(rows):
    fingerprints = {}
    for row in rows:
        key = ds.content_hash(row['model_features'])
        if key in fingerprints:
            ds.require(row['relevance_target']['value'] == fingerprints[key]['relevance_target']['value'],
                       'Conflicting labels for identical model inputs.')
        else:
            fingerprints[key] = row
    return list(fingerprints.values())


def validate_batch(batch):
    ds.check_schema(batch, schema_for_training())
    # Reproduction checks every field, including provenance, contexts and safety
    # outputs; new schema capacities do not weaken v1's semantic restrictions.
    ds.require(batch == build_batch(), 'v2 batch does not reproduce from frozen templates, seed, criteria and rules.')
    supported = mapped_rows(batch)
    families, bases, vectors = defaultdict(set), defaultdict(set), defaultdict(set)
    for scenario in batch['scenarios']:
        families[scenario['template_family']].add(scenario['split'])
        bases[scenario['base_scenario_id']].add(scenario['split'])
    for row in batch['candidate_rows']:
        vectors[ds.content_hash(row['model_features'])].add(row['split'])
    ds.require(all(len(splits) == 1 for splits in families.values()), 'Template family leakage.')
    ds.require(all(len(splits) == 1 for splits in bases.values()), 'Base-scenario leakage.')
    ds.require(all(len(splits) == 1 for splits in vectors.values()), 'Identical model inputs overlap across splits.')
    by_split = {}
    for split in ('train', 'validation', 'test'):
        rows = [row for row in batch['candidate_rows'] if row['split'] == split]
        fit_rows = [row for row in supported if row['split'] == split]
        unique = unique_rows(fit_rows)
        balance = ds.tally(row['relevance_target']['value'] for row in unique)
        ds.require(set(balance) == {'relevant', 'not_relevant', 'undetermined'}, f'{split} has insufficient label variation.')
        by_split[split] = {
            'contexts': sum(item['split'] == split for item in batch['scenarios']),
            'families': len({row['template_family'] for row in rows}), 'all_candidate_rows': len(rows),
            'condition_mapped_rows': len(fit_rows), 'unique_condition_mapped_inputs': len(unique),
            'mapped_label_balance': ds.tally(row['relevance_target']['value'] for row in fit_rows),
            'unique_mapped_label_balance': balance,
        }
    _, _, criteria, _ = ds.knowledge()
    groups = defaultdict(list)
    for row in supported:
        groups[row['group_key']].append(row)
    return {
        'validation': 'passed', 'clinical_review_status': 'not_reviewed', 'model_trained': False,
        'counts': {'synthetic_contexts': len(batch['scenarios']), 'candidate_rows': len(batch['candidate_rows']),
                   'template_families': len(families), 'base_scenarios': len(bases),
                   'condition_mapped_rows': len(supported), 'unique_condition_mapped_inputs': len(unique_rows(supported))},
        'class_balance_all_rows': ds.tally(row['relevance_target']['value'] for row in batch['candidate_rows']),
        'class_balance_condition_mapped_rows': ds.tally(row['relevance_target']['value'] for row in supported),
        'by_split': by_split,
        'family_split_overlap': 0, 'base_scenario_split_overlap': 0, 'feature_vector_split_overlap': 0,
        'feature_allowlist': criteria['feature_allowlist'],
        'supported_groups': {key: {'candidate_ids': sorted({row['candidate_id'] for row in rows}),
                                   'labels': ds.tally(row['relevance_target']['value'] for row in rows),
                                   'ranking_evaluation': 'not_meaningful_single_candidate'}
                             for key, rows in sorted(groups.items())},
        'research_safety_counts': ds.tally(row['research_safety']['aggregate_status'] for row in supported),
        'relevant_but_blocked_count': sum(row['relevance_target']['value'] == 'relevant' and
                                        row['research_safety']['aggregate_status'] == 'blocked' for row in supported),
        'limitations': [
            'All labels remain unreviewed, rule-derived targets; more generated rows are not new clinical evidence.',
            'Families partition a single factorial generator; this is held-out symptom-pattern agreement, not independent clinical validation.',
            'Three safety variants deliberately share relevance features within each base scenario; fit once per unique input to avoid overweighting duplicates.',
            'Off-condition contrasts and unsupported diagnoses are excluded from fitting and primary model evaluation.',
            'Mapped antiviral targets are constant. Every condition/purpose/role group still has one candidate; no within-group ranking metric is meaningful.',
            'Unknown facts are explicit null/categories. The existing conservative global symptom-completeness adapter is retained.',
        ],
    }


def manifest_for(batch_bytes):
    settings = plan()
    _, _, criteria, sources = ds.knowledge()
    return {
        'manifest_version': '1.1', 'dataset_version': settings['dataset_version'],
        'schema_version': settings['schema_version'], 'clinical_review_status': 'not_reviewed',
        'synthetic_only': True, 'label_method': 'rule_derived', 'criteria_version': criteria['version'],
        'context_seed': settings['context_seed'], 'split_seed': settings['split_seed'],
        'split_method': settings['split_method'], 'families': template_families(),
        'variants': settings['variants'], 'feature_allowlist': criteria['feature_allowlist'],
        'input_sha256': {path: ds.file_hash(ds.ROOT / path) for path in INPUT_PATHS},
        'batch_sha256': hashlib.sha256(batch_bytes).hexdigest(),
        'schema_sha256': hashlib.sha256(ds.json_bytes(schema_for_training())).hexdigest(),
        'parent_batch_sha256': ds.file_hash(ds.DEFAULT_OUTPUT / 'batch.json'),
        'parent_manifest_sha256': ds.file_hash(ds.DEFAULT_OUTPUT / 'manifest.json'),
        'evidence_references': [sources[key] for key in sorted(sources)],
        'adapter_version': ds.ADAPTER_VERSION, 'review_gates_evaluated': False,
        'adapter_semantics': ds.read_json(ds.DEFAULT_OUTPUT / 'manifest.json')['adapter_semantics'],
        'database_access': False, 'live_patient_data_used': False, 'api_enabled': False, 'publication_enabled': False,
    }


def report_markdown(report):
    lines = ['# Step 7B expanded synthetic batch', '',
             'Unreviewed source-informed rule-derived labels. No model is fitted by the dataset builder.', '',
             f'Counts: `{report["counts"]}`.', '',
             '| Split | Contexts | Families | Mapped rows | Unique mapped inputs | Unique label balance |',
             '| --- | ---: | ---: | ---: | ---: | --- |']
    for split, data in report['by_split'].items():
        lines.append(f'| {split} | {data["contexts"]} | {data["families"]} | {data["condition_mapped_rows"]} | '
                     f'{data["unique_condition_mapped_inputs"]} | {data["unique_mapped_label_balance"]} |')
    lines += ['', 'Family/base-scenario/model-input overlap across splits: **zero**.', '',
              f'Condition-mapped safety outcomes: `{report["research_safety_counts"]}`. '
              f'{report["relevant_but_blocked_count"]} relevant rows are blocked independently.', '',
              '## Limits', ''] + [f'- {item}' for item in report['limitations']]
    return '\n'.join(lines) + '\n'


def write_batch(output=DEFAULT_OUTPUT):
    ds.validate_artifacts(ds.DEFAULT_OUTPUT)  # The small inspectable predecessor must pass first.
    batch = build_batch()
    report = validate_batch(batch)
    encoded = ds.json_bytes(batch)
    output = Path(output)
    ds.require(output.resolve() != ds.DEFAULT_OUTPUT.resolve(), 'Do not overwrite the Step 7A batch.')
    output.mkdir(parents=True, exist_ok=True)
    artifacts = {'batch.json': encoded, 'schema.json': ds.json_bytes(schema_for_training()),
                 'manifest.json': ds.json_bytes(manifest_for(encoded)),
                 'validation_report.json': ds.json_bytes(report), 'validation_report.md': report_markdown(report).encode('utf-8')}
    for name, contents in artifacts.items():
        (output / name).write_bytes(contents)
    return report


def validate_artifacts(output=DEFAULT_OUTPUT):
    ds.validate_artifacts(ds.DEFAULT_OUTPUT)
    output = Path(output)
    batch = ds.read_json(output / 'batch.json')
    report = validate_batch(batch)
    ds.require(ds.read_json(output / 'manifest.json') == manifest_for((output / 'batch.json').read_bytes()), 'Stale v2 manifest/provenance.')
    ds.require(ds.read_json(output / 'schema.json') == schema_for_training(), 'Stale v2 schema.')
    ds.require(ds.read_json(output / 'validation_report.json') == report, 'Stale v2 report.')
    ds.require((output / 'validation_report.md').read_bytes() == report_markdown(report).encode('utf-8'), 'Stale v2 Markdown report.')
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('build', 'validate'))
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(argv)
    try:
        report = write_batch(args.output) if args.action == 'build' else validate_artifacts(args.output)
    except (ds.ValidationError, OSError, KeyError, ValueError, TypeError) as error:
        parser.exit(1, f'Validation failed: {error}\n')
    print(json.dumps({'validation': report['validation'], 'counts': report['counts'],
                         'mapped_class_balance': report['class_balance_condition_mapped_rows'],
                         'output': str(args.output.resolve())}, indent=2))


if __name__ == '__main__':
    main()
