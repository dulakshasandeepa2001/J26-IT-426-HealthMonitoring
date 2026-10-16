"""Export/verify pending knowledge and a small, inspectable rule-check fixture.

Run from backend: python -m prescription_research.expansion.check
No Django initialization, DB, network, live-patient importer or ML fitting.
"""

import argparse
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path

from prescription_research import dataset as ds
from .knowledge import CONCERN_FIELDS, CONDITIONS, INPUT_PATHS, ORS, SYMPTOMS, VERSION, load_knowledge
from .screening import ASSESSMENTS, ENGINE_VERSION, evaluate_case

DEFAULT_OUTPUT = ds.ROOT / 'docs/research/six_condition_knowledge_v1'


def check_cases():
    """25 fixed fictional technical fixtures, not a labelled/training dataset."""
    targets = {'influenza': ['fever', 'body_aches'], 'chickenpox': ['fever', 'itching'], 'measles': ['fever'],
               'mumps': ['jaw_pain'], 'viral_conjunctivitis': ['ocular_dryness'], 'viral_gastroenteritis': ['diarrhoea']}
    cases = []
    for condition in CONDITIONS:
        patient = {'age_years': 42, 'weight_kg': None, 'onset_hours': 12,
            'symptoms': {name: {'present': name in targets[condition], 'duration_hours': 12 if name in targets[condition] else None} for name in SYMPTOMS},
            'allergy_history': {'status': 'none', 'mentions': []}, 'current_medicines': {'status': 'none', 'mentions': []},
            'assessments': {key: 'standard' for key in ASSESSMENTS}, 'condition_assessments': {key: False for key in CONCERN_FIELDS}}
        patient['assessments'].update(red_flags='none', varicella_risk='risk_group_confirmed', laiv_timing='no_conflict',
            ophthalmic_integrity='acceptable', excipient_assessment='acceptable', dehydration_assessment='none', oral_fluid_tolerance='tolerated')
        for family in ('supplied_context', 'missing_context', 'matching_allergy', 'reported_concern'):
            case = {'case_id': condition + '--' + family, 'synthetic_only': True, 'fact_origin': 'synthetic_researcher_defined',
                    'condition': condition, 'patient_features': deepcopy(patient), 'reported_observations': {}}
            if family == 'missing_context':
                case['patient_features'] = {}
            elif family == 'matching_allergy':
                case['patient_features']['allergy_history'] = {'status': 'reported', 'mentions': ['carboxymethylcellulose sodium' if condition == 'viral_conjunctivitis' else 'paracetamol']}
            elif family == 'reported_concern':
                case['reported_observations']['hydration_concern'] = True
            cases.append(case)
    cases.append({'case_id': 'unsupported-condition', 'synthetic_only': True, 'fact_origin': 'synthetic_researcher_defined',
                  'condition': 'unsupported', 'patient_features': {}})
    return cases


def build_artifacts():
    knowledge = load_knowledge()
    products, policies, _ = knowledge
    evaluations = [evaluate_case(case, knowledge) for case in check_cases()]
    rows = [row for result in evaluations for row in result['results']]
    unresolved = {'id': ORS, 'purpose': 'rehydration_support', 'identity_status': 'unresolved',
        'rxcui': None, 'strength': None, 'composition': None, 'reconstitution_volume_ml': None, 'regimen': None,
        'clinical_review_status': 'not_reviewed', 'source_ids': ['niddk-gastroenteritis', 'who-ors'],
        'source_urls': ['https://www.niddk.nih.gov/health-information/digestive-diseases/viral-gastroenteritis/treatment',
                        'https://www.who.int/publications/i/item/WHO-FCH-CAH-06.1'],
        'source_handling': {'accessed_date': '2026-10-16', 'niddk_publisher_review_month': '2018-05',
                            'who_publication_date': '2006-01-01', 'scope': 'Guidance pages only; no exact local product label or full WHO PDF is claimed.'},
        'gap': 'An actual product label and supported identifier are required; a local sales listing and a WHO formulation reference are insufficient.'}
    bundle = {'schema_version': '2.0', 'knowledge_version': VERSION, 'clinical_review_status': 'not_reviewed',
              'live_enabled': False, 'catalogue': list(products.values()), 'purpose_policies': policies, 'unresolved_products': [unresolved]}
    checks = {'engine_version': ENGINE_VERSION, 'synthetic_only': True, 'clinical_review_status': 'not_reviewed',
              'fact_origin': 'synthetic_researcher_defined', 'evaluations': evaluations}
    report = {'knowledge_version': VERSION, 'engine_version': ENGINE_VERSION,
        'counts': {'conditions': len(CONDITIONS), 'resolved_catalogue_products': len(products), 'unresolved_products': 1,
                   'purpose_groups': len(policies), 'resolved_purpose_groups': len(policies) - 1,
                   'synthetic_check_cases': len(evaluations), 'candidate_rule_evaluations': len(rows),
                   'unsupported_cases': sum(item['coverage'] == 'unsupported_condition' for item in evaluations)},
        'aggregate_status_counts': dict(sorted(Counter(item['aggregate_status'] for item in rows).items())),
        'workflow_counts': dict(sorted(Counter(item['workflow_outcome'] for item in rows).items())),
        'experimental_references': sum(item['experimental_reference'] is not None for item in rows),
        'prescription_eligible_rows': sum(item['eligible_for_prescription'] for item in rows),
        'candidate_count_by_purpose_group': {p['id']: 1 for p in policies},
        'clinical_review_status': 'not_reviewed', 'review_gate_evaluated': False, 'live_enabled': False,
        'model_trained': False, 'clinical_validation_performed': False, 'within_group_ranking_evaluated': False,
        'limitations': ['Source-informed researcher controls, not a clinical protocol or validation.',
            'One candidate per purpose group; no meaningful alternative ranking.',
            'The new mappings use adult-only research scope, not label age contraindications.',
            'Exact ORS identity/composition/dilution unresolved; no executable ORS regimen.',
            'The CMC reference is a US label; local equivalence and complete excipient/interaction coverage are not established.',
            'Static fixtures test selected technical behavior, not accuracy or model performance.',
            'Every entry/policy is pending clinical review and no prescription is eligible.']}
    markdown = '\n'.join([
        '# Six-condition pending knowledge and deterministic rule-check report', '',
        f'Knowledge: `{VERSION}`. Engine: `{ENGINE_VERSION}`.', '',
        '**Offline only; clinical review: not_reviewed. No live imports or ML training.**', '',
        '## Actual counts', '', *[f'- {key}: {value}' for key, value in report['counts'].items()], '',
        f"Aggregate statuses: `{json.dumps(report['aggregate_status_counts'], sort_keys=True)}`.",
        f"Workflow outcomes: `{json.dumps(report['workflow_counts'], sort_keys=True)}`.",
        f"Experimental references: {report['experimental_references']}; prescription-eligible rows: 0.", '',
        'These are rule-check fixture counts, not clinical performance metrics or a labelled ML dataset.', '',
        '## Limits', '', *['- ' + item for item in report['limitations']], '',
        'See backend/prescription_context/STEP8B.md for source provenance, commands and integration requirements.', ''])
    files = {'bundle.json': ds.json_bytes(bundle), 'rule_checks.json': ds.json_bytes(checks),
             'validation_report.json': ds.json_bytes(report), 'validation_report.md': markdown.encode('utf-8')}
    manifest = {'knowledge_version': VERSION, 'clinical_review_status': 'not_reviewed',
                'inputs': {name: ds.file_hash(ds.ROOT / name) for name in INPUT_PATHS},
                'outputs': {name: hashlib.sha256(content).hexdigest() for name, content in files.items()}}
    files['manifest.json'] = ds.json_bytes(manifest)
    return files, report


def export_artifacts(output):
    files, report = build_artifacts()
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (output / name).write_bytes(content)
    return report


def validate_artifacts(output):
    expected, report = build_artifacts()
    for name, content in expected.items():
        ds.require((Path(output) / name).read_bytes() == content, f'Stale or tampered artifact: {name}')
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--validate', action='store_true', help='Verify existing outputs and all source/code hashes without rewriting.')
    args = parser.parse_args(argv)
    try:
        result = validate_artifacts(args.output) if args.validate else export_artifacts(args.output)
    except (ValueError, OSError, KeyError, TypeError) as error:
        parser.exit(1, f'Offline knowledge checks failed: {error}\n')
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
