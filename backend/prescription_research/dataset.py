"""Build/validate a small offline research batch using static shipped knowledge.

No Django setup, ORM, network, patient import, model fitting or API is involved.
Run this file directly with the existing virtual-environment Python.
"""

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
import math
from pathlib import Path
import random
import sys
from types import SimpleNamespace

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parent
ROOT = BACKEND.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# This module is pure Python; never import the Django services/profile modules.
from prescription_drafts.engine import ENGINE_VERSION, reference_regimen, run_screening

SCHEMA_VERSION = '1.0'
DATASET_VERSION = 'synthetic-prescription-2026-10-14-v1'
ADAPTER_VERSION = 'static-research-adapter-v1'
DEFAULT_OUTPUT = ROOT / 'docs/research/synthetic_prescription_v1'
INPUT_PATHS = (
    'backend/medicine_knowledge/data/pilot_catalogue.json',
    'backend/prescription_drafts/data/safety_profiles.json',
    'backend/prescription_drafts/engine.py',
    'backend/prescription_research/criteria.json',
    'backend/prescription_research/templates.json',
    'backend/prescription_research/schema.json',
    'backend/prescription_research/dataset.py',
)
REASONS = {
    'unsupported_or_unknown_condition': 'The condition is unknown or outside the two-condition pilot; do not infer applicability.',
    'no_condition_mapping': 'The shipped catalogue has no use mapping for this condition. This is a contrast row, not a clinical alternative.',
    'mapped_antiviral': 'The catalogue maps this antiviral to this condition. Patient-specific indication, onset, formulation and safety still require deterministic assessment.',
    'target_present': 'At least one source-informed symptom target is explicitly present in this synthetic context.',
    'targets_absent': 'All declared symptom targets are explicitly absent in this synthetic context.',
    'target_unknown': 'A necessary symptom fact is unknown; absence or applicability cannot be inferred.',
}


class ValidationError(ValueError):
    """Invalid or stale offline artifact."""


def reject_nonfinite(value):
    raise ValidationError(f'Non-finite JSON number is forbidden: {value}')


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'), parse_constant=reject_nonfinite)


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')


def content_hash(value):
    encoded = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(encoded.encode('utf-8')).hexdigest()


def file_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def knowledge():
    catalogue = read_json(BACKEND / 'medicine_knowledge/data/pilot_catalogue.json')
    profiles = read_json(BACKEND / 'prescription_drafts/data/safety_profiles.json')
    criteria = read_json(HERE / 'criteria.json')
    products = {entry['id']: entry for entry in catalogue}
    require(len(products) == len(catalogue) == 4, 'Expected four unique pilot products.')
    require(set(products) == set(profiles) == set(criteria['products']), 'Catalogue/rule/criteria IDs differ.')
    sources = {}
    for product_id, product in products.items():
        definition = criteria['products'][product_id]
        mappings = {use['condition']: use for use in product['uses']}
        require(set(mappings) == set(definition['roles']), f'Use mappings changed: {product_id}')
        require(all(use['purpose'] == definition['purpose'] for use in mappings.values()), f'Purpose mismatch: {product_id}')
        for role in definition['roles'].values():
            require(set(role['target_symptoms']) <= {'fever', 'body_aches', 'itching'}, 'Unknown symptom target.')
        local_sources = {source['id'] for source in product['sources']}
        require(set(profiles[product_id]['source_ids']) <= local_sources, f'Unknown rule source: {product_id}')
        for use in mappings.values():
            require(bool(use['source_ids']) and set(use['source_ids']) <= local_sources, f'Unknown mapping source: {product_id}')
        for source in product['sources']:
            # References shared by products must have identical recorded metadata.
            require(source['id'] not in sources or sources[source['id']] == source, f'Conflicting source: {source["id"]}')
            sources[source['id']] = source
    return products, profiles, criteria, sources


def merge(base, changes):
    for key, value in changes.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge(base[key], value)
        else:
            base[key] = deepcopy(value)
    return base


def build_scenarios(templates):
    rng = random.Random(templates['context_seed'])
    scenarios = []
    for family in templates['families']:
        conditions = family.get('conditions', ['influenza', 'chickenpox'])
        require(len(conditions) == 2, 'This inspectable batch requires two variants per family.')
        for variant, condition in enumerate(conditions, 1):
            # Values are created synthetic facts, never estimates of a real person.
            patient = {
                'age_years': rng.randint(18, 70), 'weight_kg': None, 'onset_hours': 12,
                'symptoms': {
                    'fever': {'present': True, 'duration_hours': 12},
                    'body_aches': {'present': True, 'duration_hours': 12},
                    'itching': {'present': condition == 'chickenpox', 'duration_hours': 12 if condition == 'chickenpox' else None},
                },
                'allergy_history': {'status': 'none', 'mentions': []},
                'current_medicines': {'status': 'none', 'mentions': []},
                'assessments': {
                    'red_flags': 'none', 'special_population': 'standard',
                    'hepatic_assessment': 'standard', 'renal_assessment': 'standard',
                    'varicella_risk': 'risk_group_confirmed' if condition == 'chickenpox' else 'unknown',
                    'laiv_timing': 'no_conflict', 'topical_assessment': 'standard',
                },
            }
            merge(patient, family['changes'])
            scenarios.append({
                'scenario_id': f'SYN-{family["id"]}-{variant:02d}',
                'template_family': family['id'], 'variant_id': variant, 'split': family['split'],
                'condition': condition, 'as_of_date': templates['as_of_date'],
                'data_origin': 'synthetic_template', 'clinical_review_status': 'not_reviewed',
                'patient_features': patient,
            })
    return scenarios


def candidate_metadata(condition, product_id, criteria):
    definition = criteria['products'][product_id]
    role = definition['roles'].get(condition)
    # Contrast/unsupported rows retain the product's actual purpose/role.
    fallback = next(iter(definition['roles'].values()))
    return definition['purpose'], (role or fallback)['clinical_role'], role


def model_features(scenario, product_id, criteria):
    purpose, clinical_role, _ = candidate_metadata(scenario['condition'], product_id, criteria)
    features = {'condition': scenario['condition'], 'candidate_id': product_id,
                'purpose': purpose, 'clinical_role': clinical_role}
    features.update({f'{name}_present': value['present'] for name, value in scenario['patient_features']['symptoms'].items()})
    require(set(features) == set(criteria['feature_allowlist']), 'Feature allowlist mismatch.')
    return features


def relevance_target(scenario, product_id, criteria):
    condition = scenario['condition']
    purpose, _, role = candidate_metadata(condition, product_id, criteria)
    if condition not in criteria['supported_conditions']:
        value, criterion = 'undetermined', 'unsupported_or_unknown_condition'
    elif role is None:
        value, criterion = 'not_relevant', 'no_condition_mapping'
    elif purpose == 'antiviral':
        value, criterion = 'relevant', 'mapped_antiviral'
    else:
        presence = [scenario['patient_features']['symptoms'][name]['present'] for name in role['target_symptoms']]
        if any(item is True for item in presence):
            value, criterion = 'relevant', 'target_present'
        elif presence and all(item is False for item in presence):
            value, criterion = 'not_relevant', 'targets_absent'
        else:
            value, criterion = 'undetermined', 'target_unknown'
    return {'value': value, 'label_method': 'rule_derived', 'criterion_id': criterion, 'reason': REASONS[criterion]}


def label_sources(condition, product):
    matching = [use for use in product['uses'] if use['condition'] == condition]
    uses = matching or product['uses']
    return sorted({source for use in uses for source in use['source_ids']})


def match_synthetic_medicines(mentions, products):
    """Static exact-alias matching only; no fuzzy/substring or ORM lookup."""
    results = []
    for mention in mentions:
        normalized = ' '.join(mention.casefold().split())
        matches = [product for product in products.values() for alias in product['aliases']
                   if ' '.join(alias['name'].casefold().split()) == normalized]
        results.append({'input': mention,
                        'status': 'recognized' if len(matches) == 1 else 'ambiguous' if matches else 'unrecognized',
                        'matches': [{'ingredients': [entry['name'] for entry in product['ingredients']]} for product in matches]})
    return results


def safety_for_scenario(scenario, products, policies, criteria):
    """Research-only invocation, without pretending any review gate has passed.

    Historical engine names symptoms_reviewed/verified_symptoms mean *complete
    supplied synthetic facts* in this adapter, not clinician actions. Persist
    only categories/status/source IDs: engine messages describe a live doctor
    workflow and must not be presented as synthetic clinician attestations.
    """
    results = {}
    condition = scenario['condition']
    applicable = [product for product in products.values() if any(use['condition'] == condition for use in product['uses'])]
    if condition not in criteria['supported_conditions'] or not applicable:
        return results
    patient = scenario['patient_features']
    symptoms = patient['symptoms']
    facts = deepcopy(patient['assessments'])
    facts.update({
        'onset_hours': patient['onset_hours'], 'weight_kg': patient['weight_kg'],
        'symptoms_reviewed': all(item['present'] is not None for item in symptoms.values()),
        'verified_symptoms': [name for name, item in symptoms.items() if item['present'] is True],
        'symptom_durations': {name: item['duration_hours'] for name, item in symptoms.items()},
    })
    context = {}
    for source, status_key, items_key in (
        ('allergy_history', 'allergy_status', 'allergies'),
        ('current_medicines', 'medicine_status', 'current_medicines'),
    ):
        history = patient[source]
        context[status_key] = 'confirmed' if history['status'] == 'reported' else history['status']
        context[items_key] = history['mentions']
    snapshot = {'patient': {'age_years': patient['age_years']}, 'clinical': facts,
                'context': context, 'diagnosis': {'condition': condition}, 'omitted_unreviewed': []}
    medicines = [SimpleNamespace(pk=product['id'], content=product, content_hash=content_hash(product)) for product in applicable]
    profiles = {key: SimpleNamespace(content=policy, content_hash=content_hash(policy)) for key, policy in policies.items()}
    references = {product['id']: reference_regimen(policies[product['id']], patient['age_years'], facts, product['route'])[0]
                  for product in applicable}
    matches = match_synthetic_medicines(patient['current_medicines']['mentions'], products)
    evaluated = run_screening(medicines, profiles, snapshot, references, matches)
    for row in evaluated['candidates']:
        product_id = row['medicine_id']
        results[product_id] = {
            'evaluation_status': 'static_rules_evaluated', 'aggregate_status': row['screening_status'],
            'findings': [{key: finding[key] for key in ('category', 'status', 'source_ids')} for finding in row['checks']],
            'reference_regimen_available': references[product_id] is not None,
            'simulation_only': True, 'review_gate_evaluated': False, 'full_safety_clearance': False,
        }
    return results


def outside_scope():
    return {'evaluation_status': 'outside_condition_scope', 'aggregate_status': 'not_evaluated',
            'findings': [], 'reference_regimen_available': None,
            'simulation_only': True, 'review_gate_evaluated': False, 'full_safety_clearance': False}


def versions(product, policy, criteria, templates):
    return {'schema': SCHEMA_VERSION, 'dataset': DATASET_VERSION,
            'criteria': criteria['version'], 'templates': templates['version'],
            'catalogue': product['catalogue_version'], 'rule': policy['version'],
            'engine': ENGINE_VERSION, 'adapter': ADAPTER_VERSION}


def build_batch():
    products, policies, criteria, _ = knowledge()
    templates = read_json(HERE / 'templates.json')
    scenarios = build_scenarios(templates)
    rows = []
    for scenario in scenarios:
        safety = safety_for_scenario(scenario, products, policies, criteria)
        for product_id, product in products.items():
            purpose, clinical_role, _ = candidate_metadata(scenario['condition'], product_id, criteria)
            rows.append({
                'row_id': f'{scenario["scenario_id"]}::{product_id}',
                'scenario_id': scenario['scenario_id'], 'template_family': scenario['template_family'],
                'split': scenario['split'], 'condition': scenario['condition'],
                'candidate_id': product_id, 'candidate_purpose': purpose, 'clinical_role': clinical_role,
                'group_key': f'{scenario["condition"] or "unknown"}::{purpose}::{clinical_role}',
                'model_features': model_features(scenario, product_id, criteria),
                'relevance_target': relevance_target(scenario, product_id, criteria),
                'label_source_ids': label_sources(scenario['condition'], product),
                'research_safety': safety.get(product_id, outside_scope()),
                'clinical_review_status': 'not_reviewed',
                'versions': versions(product, policies[product_id], criteria, templates),
                'catalogue_content_sha256': content_hash(product),
                'rule_content_sha256': content_hash(policies[product_id]),
            })
    return {'schema_version': SCHEMA_VERSION, 'dataset_version': DATASET_VERSION,
            'synthetic_only': True, 'clinical_review_status': 'not_reviewed',
            'scenarios': scenarios, 'candidate_rows': rows}


def check_schema(value, schema, root=None, path='$'):
    """Dependency-free validation of the keywords used in the bundled schema.

    This is deliberately not advertised as a general JSON Schema implementation.
    Unknown keywords fail rather than silently dropping a future constraint.
    """
    root = root or schema
    supported = {'$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'const', 'enum',
                 'properties', 'required', 'additionalProperties', 'items', 'minItems', 'maxItems',
                 'minLength', 'maxLength', 'minimum', 'maximum'}
    require(set(schema) <= supported, f'{path}: unsupported schema keyword')
    if '$ref' in schema:
        reference = schema['$ref']
        require(reference.startswith('#/$defs/'), f'{path}: only local definition references are allowed')
        check_schema(value, root['$defs'][reference.split('/')[-1]], root, path)
        return
    predicates = {
        'object': lambda item: isinstance(item, dict), 'array': lambda item: isinstance(item, list),
        'string': lambda item: isinstance(item, str), 'boolean': lambda item: type(item) is bool,
        'null': lambda item: item is None, 'integer': lambda item: type(item) is int,
        'number': lambda item: type(item) in (int, float) and math.isfinite(item),
    }
    if 'type' in schema:
        allowed = schema['type'] if isinstance(schema['type'], list) else [schema['type']]
        require(any(predicates[name](value) for name in allowed), f'{path}: wrong type; expected {allowed}')
    if 'const' in schema:
        require(type(value) is type(schema['const']) and value == schema['const'], f'{path}: wrong constant')
    if 'enum' in schema:
        require(any(type(value) is type(item) and value == item for item in schema['enum']), f'{path}: invalid enum')
    if isinstance(value, dict):
        require(set(schema.get('required', [])) <= set(value), f'{path}: required field missing')
        properties = schema.get('properties', {})
        if schema.get('additionalProperties') is False:
            require(set(value) <= set(properties), f'{path}: unexpected field(s): {set(value) - set(properties)}')
        for key, item in value.items():
            if key in properties:
                check_schema(item, properties[key], root, f'{path}.{key}')
    elif isinstance(value, list):
        require(len(value) >= schema.get('minItems', 0), f'{path}: too few items')
        require(len(value) <= schema.get('maxItems', math.inf), f'{path}: too many items')
        if 'items' in schema:
            for index, item in enumerate(value):
                check_schema(item, schema['items'], root, f'{path}[{index}]')
    elif isinstance(value, str):
        require(len(value) >= schema.get('minLength', 0), f'{path}: too short')
        require(len(value) <= schema.get('maxLength', math.inf), f'{path}: too long')
    elif type(value) in (int, float):
        require(math.isfinite(value), f'{path}: non-finite number')
        require(value >= schema.get('minimum', -math.inf), f'{path}: below minimum')
        require(value <= schema.get('maximum', math.inf), f'{path}: above maximum')


def validate_batch(batch):
    check_schema(batch, read_json(HERE / 'schema.json'))
    products, policies, criteria, sources = knowledge()
    templates = read_json(HERE / 'templates.json')
    families = {family['id']: family for family in templates['families']}
    require(len(families) == len(templates['families']), 'Duplicate template family.')
    scenarios = {item['scenario_id']: item for item in batch['scenarios']}
    require(len(scenarios) == len(batch['scenarios']), 'Duplicate scenario ID.')
    require(30 <= len(scenarios) <= 40, 'Initial inspection batch must have 30-40 contexts.')
    family_variants = defaultdict(set)
    safety_cache = {}
    for scenario in scenarios.values():
        family = families.get(scenario['template_family'])
        require(family is not None, 'Unknown template family.')
        require(scenario['split'] == family['split'], 'Family split leakage or stale split assignment.')
        require(scenario['scenario_id'] == f'SYN-{family["id"]}-{scenario["variant_id"]:02d}', 'Invalid synthetic ID.')
        conditions = family.get('conditions', ['influenza', 'chickenpox'])
        require(scenario['condition'] == conditions[scenario['variant_id'] - 1], 'Template condition mismatch.')
        require(scenario['variant_id'] not in family_variants[family['id']], 'Duplicate scenario variant.')
        family_variants[family['id']].add(scenario['variant_id'])
        patient = scenario['patient_features']
        for symptom in patient['symptoms'].values():
            require(symptom['present'] is True or symptom['duration_hours'] is None, 'Absent/unknown symptom cannot have an invented duration.')
        for name in ('allergy_history', 'current_medicines'):
            history = patient[name]
            require(history['status'] != 'none' or not history['mentions'], 'Negative history contradicts recorded items.')
            require(history['status'] != 'reported' or bool(history['mentions']), 'Reported history has no recorded items.')
        safety_cache[scenario['scenario_id']] = safety_for_scenario(scenario, products, policies, criteria)
    require(set(family_variants) == set(families), 'A declared family is missing.')
    require(all(variants == {1, 2} for variants in family_variants.values()), 'A family variant is missing.')
    seen = set()
    for row in batch['candidate_rows']:
        scenario = scenarios.get(row['scenario_id'])
        require(scenario is not None, 'Candidate references unknown scenario.')
        product = products.get(row['candidate_id'])
        require(product is not None, 'Unknown candidate product.')
        key = (row['scenario_id'], row['candidate_id'])
        require(key not in seen, 'Duplicate scenario/candidate row.')
        seen.add(key)
        require(row['row_id'] == f'{key[0]}::{key[1]}', 'Incorrect row ID.')
        for name in ('template_family', 'split', 'condition'):
            require(row[name] == scenario[name], f'Candidate/scenario {name} mismatch.')
        purpose, clinical_role, _ = candidate_metadata(scenario['condition'], row['candidate_id'], criteria)
        require(row['candidate_purpose'] == purpose and row['clinical_role'] == clinical_role, 'Purpose/role mismatch.')
        require(row['group_key'] == f'{scenario["condition"] or "unknown"}::{purpose}::{clinical_role}', 'Wrong purpose group.')
        require(row['model_features'] == model_features(scenario, row['candidate_id'], criteria), 'Feature projection mismatch.')
        require(row['relevance_target'] == relevance_target(scenario, row['candidate_id'], criteria), 'Provisional label/provenance mismatch.')
        require(row['label_source_ids'] == label_sources(scenario['condition'], product), 'Incorrect label evidence references.')
        require(set(row['label_source_ids']) <= set(sources), 'Unresolved source ID.')
        require(row['versions'] == versions(product, policies[row['candidate_id']], criteria, templates), 'Stale versions.')
        require(row['catalogue_content_sha256'] == content_hash(product), 'Stale catalogue content.')
        require(row['rule_content_sha256'] == content_hash(policies[row['candidate_id']]), 'Stale rule content.')
        expected = safety_cache[row['scenario_id']].get(row['candidate_id'], outside_scope())
        require(row['research_safety'] == expected, 'Deterministic safety findings changed or were fabricated.')
    require(seen == {(scenario_id, product_id) for scenario_id in scenarios for product_id in products}, 'Missing candidate rows.')
    # A versioned batch is generated from declared templates, never from imports.
    require(batch['scenarios'] == build_scenarios(templates), 'Contexts do not reproduce from the frozen synthetic templates/seed.')
    return make_report(batch, criteria)


def tally(items):
    return dict(sorted(Counter(items).items()))


def make_report(batch, criteria):
    scenarios, rows = batch['scenarios'], batch['candidate_rows']
    supported = [row for row in rows if row['research_safety']['evaluation_status'] == 'static_rules_evaluated']
    by_condition = {}
    for condition in sorted({row['condition'] or 'unknown' for row in rows}):
        selected = [row for row in rows if (row['condition'] or 'unknown') == condition]
        by_condition[condition] = {
            'contexts': sum((scenario['condition'] or 'unknown') == condition for scenario in scenarios),
            'candidate_rows': len(selected), 'labels': tally(row['relevance_target']['value'] for row in selected),
        }
    by_split = {}
    for split in ('train', 'validation', 'test'):
        selected = [row for row in rows if row['split'] == split]
        by_split[split] = {
            'contexts': sum(scenario['split'] == split for scenario in scenarios),
            'template_families': len({row['template_family'] for row in selected}),
            'candidate_rows': len(selected), 'labels': tally(row['relevance_target']['value'] for row in selected),
            'missing_label_classes': sorted(set(criteria['labels']) - {row['relevance_target']['value'] for row in selected}),
        }
    groups = defaultdict(list)
    for row in supported:
        groups[row['group_key']].append(row)
    group_report = {key: {
        'candidate_ids': sorted({row['candidate_id'] for row in selected}),
        'labels': tally(row['relevance_target']['value'] for row in selected),
        'ranking_evaluation': 'not_meaningful_single_candidate',
    } for key, selected in sorted(groups.items())}
    fingerprints = defaultdict(set)
    for row in rows:
        fingerprints[content_hash(row['model_features'])].add(row['split'])
    overlap = sum(len(splits) > 1 for splits in fingerprints.values())
    safety_counts = tally(row['research_safety']['aggregate_status'] for row in rows)
    relevant_blocked = [row['row_id'] for row in rows if row['relevance_target']['value'] == 'relevant'
                        and row['research_safety']['aggregate_status'] == 'blocked']
    return {
        'validation': 'passed', 'clinical_review_status': 'not_reviewed',
        'counts': {'synthetic_contexts': len(scenarios), 'candidate_rows': len(rows),
                   'template_families': len({row['template_family'] for row in rows}),
                   'condition_mapped_rows': len(supported),
                   'contrast_or_unsupported_rows': len(rows) - len(supported)},
        'class_balance': tally(row['relevance_target']['value'] for row in rows),
        'condition_mapped_class_balance': tally(row['relevance_target']['value'] for row in supported),
        'contrast_or_unsupported_class_balance': tally(row['relevance_target']['value'] for row in rows if row not in supported),
        'by_condition': by_condition, 'by_split': by_split, 'supported_groups': group_report,
        'by_candidate': {product_id: tally(row['relevance_target']['value'] for row in rows if row['candidate_id'] == product_id)
                         for product_id in sorted(criteria['products'])},
        'research_safety_counts': safety_counts,
        'relevant_but_blocked_count': len(relevant_blocked), 'relevant_but_blocked_examples': relevant_blocked[:4],
        'unique_model_feature_vectors': len(fingerprints),
        'feature_vectors_shared_across_splits': overlap,
        'family_split_overlap': 0, 'feature_allowlist': criteria['feature_allowlist'],
        'model_trained': False, 'held_out_agreement': None, 'model_errors': None,
        'limitations': [
            'This batch verifies schema, provenance and research engineering; no clinician labels or clinical validation exist.',
            'All relevance labels imitate documented researcher-defined rules. Evidence references do not supply independent patient-level labels.',
            'Condition-mismatch rows are negative contrasts, not interchangeable treatment alternatives.',
            'Each supported condition/purpose/role group has one candidate; within-group ranking performance is not meaningful.',
            'Mapped antivirals are always relevant to their purpose under this target; no within-condition applicability variation is learned for them.',
            'Complete synthetic symptom facts are mapped to historical engine flags only for simulation; no clinical review gates are evaluated.',
            'Static safety findings cover selected rules only. A reference regimen being calculable is not safety clearance or approval.',
            f'{overlap} identical allowed feature vectors occur across family splits; agreement later could reflect repeated inputs as well as rule imitation.',
            'The small fixed template set is not a population sample. Labels and feature diversity must be reviewed before expansion or fitting.',
            'The validation split has no undetermined labels; class-specific validation agreement for that class cannot be measured in this batch.',
            'No model was fitted: held-out agreement/error metrics are unavailable, not zero.',
        ],
        'next_step': 'Inspect this batch/criteria, settle feature repetition and coverage, then Step 7B: offline training/evaluation with train-only preprocessing and a rules baseline.',
    }


def manifest_for(batch_bytes, criteria, sources, templates):
    return {
        'manifest_version': '1.0', 'dataset_version': DATASET_VERSION,
        'schema_version': SCHEMA_VERSION, 'clinical_review_status': 'not_reviewed',
        'synthetic_only': True, 'data_origin': 'frozen_researcher_defined_templates_only',
        'label_method': 'rule_derived', 'criteria_version': criteria['version'],
        'template_version': templates['version'], 'engine_version': ENGINE_VERSION, 'adapter_version': ADAPTER_VERSION,
        'context_seed': templates['context_seed'], 'split_method': templates['split_method'], 'split_seed': templates['split_seed'],
        'family_splits': {family['id']: family['split'] for family in templates['families']},
        'feature_allowlist': criteria['feature_allowlist'],
        'input_sha256': {path: file_hash(ROOT / path) for path in INPUT_PATHS},
        'batch_sha256': hashlib.sha256(batch_bytes).hexdigest(),
        'evidence_references': [sources[key] for key in sorted(sources)],
        'review_gates': 'not_evaluated_in_offline_static_rule_simulation',
        'adapter_semantics': {
            'symptoms_reviewed': 'synthetic symptom-presence completeness only, not a doctor review',
            'verified_symptoms': 'explicitly present synthetic symptom facts only, not clinician verification',
            'confirmed_history_and_risk_flags': 'supplied synthetic facts only, no reviewer or attestation',
            'engine_messages': 'discarded; their live-workflow clinician wording is not synthetic evidence',
        },
        'live_patient_data_used': False, 'database_access': False,
        'model_trained': False, 'api_enabled': False, 'publication_enabled': False,
    }


def markdown_report(report):
    counts = report['counts']
    lines = [
        '# Step 7A synthetic batch validation', '',
        'Schema and provenance checks passed. This is an offline, unreviewed research batch; no model was trained.', '',
        f'{counts["synthetic_contexts"]} contexts; {counts["candidate_rows"]} scenario-product rows; '
        f'{counts["template_families"]} template families. '
        f'{counts["condition_mapped_rows"]} rows have a pilot condition mapping; '
        f'{counts["contrast_or_unsupported_rows"]} are contrast/unsupported rows.', '',
        '| Label | Rows |', '| --- | ---: |',
    ]
    lines += [f'| {label} | {count} |' for label, count in report['class_balance'].items()]
    lines += ['', f'Condition-mapped row labels: `{report["condition_mapped_class_balance"]}`. '
              f'Contrast/unsupported labels: `{report["contrast_or_unsupported_class_balance"]}`. '
              'Keep these populations separate in later evaluation.']
    lines += ['', '| Split | Contexts | Families | Rows | Labels |', '| --- | ---: | ---: | ---: | --- |']
    for split, data in report['by_split'].items():
        lines.append(f'| {split} | {data["contexts"]} | {data["template_families"]} | {data["candidate_rows"]} | {data["labels"]} |')
    lines += ['', '| Condition | Contexts | Rows | Labels |', '| --- | ---: | ---: | --- |']
    for condition, data in report['by_condition'].items():
        lines.append(f'| {condition} | {data["contexts"]} | {data["candidate_rows"]} | {data["labels"]} |')
    lines += ['', '| Supported condition/purpose/role group | Candidates | Labels |', '| --- | ---: | --- |']
    for group, data in report['supported_groups'].items():
        lines.append(f'| {group} | {len(data["candidate_ids"])} | {data["labels"]} |')
    lines += [
        '', f'Research safety outcomes: `{report["research_safety_counts"]}`. '
        f'{report["relevant_but_blocked_count"]} relevant rows are independently blocked.', '',
        f'{report["unique_model_feature_vectors"]} distinct allowed model input vectors; '
        f'{report["feature_vectors_shared_across_splits"]} occur across splits. '
        'Template family overlap is zero; identical model inputs are still possible because safety facts are excluded.', '',
        'Held-out agreement and model errors: **unavailable (no fitting in Step 7A)**.', '',
        '## Limitations', '',
    ]
    lines += [f'- {limitation}' for limitation in report['limitations']]
    lines += ['', report['next_step'], '', 'Rebuild/validate commands are in `backend/prescription_context/STEP7A.md`.', '']
    return '\n'.join(lines)


def write_batch(output):
    batch = build_batch()
    report = validate_batch(batch)  # No artifact is written until all checks pass.
    _, _, criteria, sources = knowledge()
    templates = read_json(HERE / 'templates.json')
    encoded = json_bytes(batch)
    manifest = manifest_for(encoded, criteria, sources, templates)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    artifacts = {'batch.json': encoded, 'manifest.json': json_bytes(manifest),
                 'validation_report.json': json_bytes(report),
                 'validation_report.md': markdown_report(report).encode('utf-8')}
    for name, data in artifacts.items():
        (output / name).write_bytes(data)
    return report


def validate_artifacts(output):
    output = Path(output)
    batch = read_json(output / 'batch.json')
    report = validate_batch(batch)
    manifest = read_json(output / 'manifest.json')
    _, _, criteria, sources = knowledge()
    expected = manifest_for((output / 'batch.json').read_bytes(), criteria, sources, read_json(HERE / 'templates.json'))
    require(manifest == expected, 'Manifest hash/provenance mismatch: rebuild the batch after inspecting changed inputs.')
    require(read_json(output / 'validation_report.json') == report, 'Stored validation report is stale.')
    require((output / 'validation_report.md').read_bytes() == markdown_report(report).encode('utf-8'), 'Stored Markdown report is stale.')
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('build', 'validate'))
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT,
                        help='Offline artifact directory; defaults to docs/research/synthetic_prescription_v1')
    args = parser.parse_args(argv)
    try:
        report = write_batch(args.output) if args.action == 'build' else validate_artifacts(args.output)
    except (ValidationError, OSError, KeyError, TypeError, ValueError) as error:
        parser.exit(1, f'Validation failed: {error}\n')
    print(json.dumps({'validation': report['validation'], 'counts': report['counts'],
                      'class_balance': report['class_balance'], 'model_trained': False,
                      'output': str(args.output.resolve())}, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
