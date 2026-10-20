"""Inspectable hypothetical rule fixtures; no ORM, live records or review actions."""
from collections import Counter, defaultdict
from copy import deepcopy
import csv
import json
from pathlib import Path
from types import SimpleNamespace

from prescription_drafts.engine import aggregate, reference_regimen, run_screening
from prescription_research import dataset as old
from prescription_research.expansion.knowledge import load_knowledge
from prescription_research.random_forest_200 import data as source_data

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
OUTPUT = ROOT / 'docs/research/selected_rule_rf_v1'
TASKS = ('allergy', 'duplicate_ingredient', 'interaction', 'dose', 'purpose_applicability')
CONDITIONS = ('influenza', 'chickenpox', 'measles', 'mumps', 'viral_conjunctivitis', 'viral_gastroenteritis')
SYMPTOMS = ('fever', 'body_aches', 'itching', 'jaw_pain')
STATUS = {'passed': 'no_selected_issue', 'warning': 'review_required', 'cannot_validate': 'cannot_validate', 'blocked': 'blocked'}


def criteria():
    return source_data.read_json(HERE / 'criteria.json')


def bindings():
    paths = ['backend/prescription_research/rule_forest/' + name for name in ('__init__.py', 'criteria.json', 'dataset.py', 'experiment.py')]
    paths += ['backend/prescription_drafts/engine.py', 'backend/prescription_drafts/data/safety_profiles.json',
        'backend/medicine_knowledge/data/pilot_catalogue.json', 'backend/prescription_research/dataset.py',
        'backend/prescription_research/expansion/knowledge.py', 'backend/prescription_research/expansion/changes.json',
        'backend/prescription_research/expansion/policies.json', 'backend/prescription_research/random_forest_200/data.py']
    return {name: source_data.digest(ROOT / name) for name in paths}


def knowledge():
    products, policies, profiles = load_knowledge()
    return {key: products[key] for key in profiles}, [p for p in policies if p['candidate_id'] in profiles], profiles


def families():
    # An entire mechanism/composition family stays in one partition, across all
    # conditions, products and numerical variants. IDs and modes are NOT features.
    training = [
        ('standard', []), ('matching_allergy', ['allergy_match']), ('unknown_allergy', ['allergy_unknown']),
        ('unresolved_allergy', ['allergy_unresolved']), ('other_allergy', ['allergy_other']),
        ('duplicate', ['duplicate']), ('unknown_medicine', ['medicine_unknown']),
        ('unresolved_medicine', ['medicine_unresolved']), ('other_current', ['medicine_other']),
        ('warfarin', ['warfarin']), ('vaccine', ['laiv_review']), ('vaccine_unknown', ['laiv_unknown']),
        ('low_dose', ['dose_low']), ('high_dose', ['dose_high']), ('route', ['dose_route']),
        ('volume', ['dose_volume']), ('frequency', ['dose_frequency']), ('course', ['dose_duration']),
        ('schedule', ['dose_schedule']), ('missing_proposal', ['dose_missing']),
        ('pediatric', ['pediatric_small']), ('larger_child', ['pediatric_large']),
        ('unknown_age', ['age_unknown']), ('unknown_weight', ['pediatric_weight_unknown']),
        ('renal', ['renal_unknown']), ('hepatic', ['hepatic_review']),
        ('absent_targets', ['targets_absent']), ('unknown_targets', ['targets_unknown']),
        ('unknown_duration', ['duration_unknown']), ('late', ['late_onset']), ('who', ['who']),
        ('red_flag', ['red_flag']), ('population', ['population_unknown']), ('rash_risk', ['risk_unknown'])]
    validation = [
        ('allergy_renal', ['allergy_match', 'renal_unknown']), ('duplicate_missing', ['duplicate', 'dose_missing']),
        ('unknown_route', ['allergy_unknown', 'dose_route']), ('low_late', ['dose_low', 'late_onset']),
        ('who_allergy', ['who', 'allergy_match']), ('absent_current', ['targets_absent', 'medicine_other']),
        ('vaccine_pediatric', ['laiv_review', 'pediatric_large']), ('hepatic_unknown_meds', ['hepatic_review', 'medicine_unknown'])]
    test = [
        ('allergy_volume', ['allergy_unknown', 'dose_volume']), ('equivalent_grams', ['dose_grams']),
        ('warfarin_hepatic', ['warfarin', 'hepatic_review']), ('unknown_late', ['medicine_unknown', 'late_onset']),
        ('alias_duplicate', ['allergy_alias', 'duplicate']), ('unknown_targets_renal', ['targets_unknown', 'renal_unknown']),
        ('route_vaccine', ['dose_route', 'laiv_unknown']), ('who_missing', ['who', 'dose_missing']),
        ('mixed_history', ['allergy_mixed', 'medicine_unresolved']), ('risk_redflag', ['risk_unknown', 'red_flag']),
        ('unknown_onset', ['onset_unknown']), ('population_course', ['population_unknown', 'dose_duration'])]
    return [{'id': split + '__' + name, 'split': split, 'changes': changes,
        'ages': {'train': [13, 25, 52], 'validation': [19, 42], 'test': [12, 18, 65]}[split]}
        for split, items in (('train', training), ('validation', validation), ('test', test)) for name, changes in items]


def base_patient(age):
    return {'age_years': age, 'weight_kg': 55, 'onset_hours': 12, 'allergy_status': 'none', 'allergies': [],
        'medicine_status': 'none', 'current_medicines': [], 'care_setting': 'outpatient', 'condition_severity': 'mild',
        'influenza_guideline': 'CDC_2026', 'red_flags': 'none', 'special_population': 'standard',
        'renal_assessment': 'standard', 'hepatic_assessment': 'standard', 'laiv_timing': 'no_conflict',
        'varicella_risk': 'risk_group_confirmed', 'topical_assessment': 'standard',
        'symptoms_reviewed': True, 'verified_symptoms': list(SYMPTOMS),
        'symptom_durations': {name: 12 for name in SYMPTOMS}}


def changed_patient(age, changes, product, profile, variant):
    patient = base_patient(age)
    for mode in changes:
        if mode == 'allergy_match':
            patient.update(allergy_status='confirmed', allergies=[profile['allergy_names'][0]])
        elif mode == 'allergy_alias':
            patient.update(allergy_status='confirmed', allergies=[profile['allergy_names'][-1] + ' (rash)'])
        elif mode == 'allergy_mixed':
            patient.update(allergy_status='confirmed', allergies=[profile['allergy_names'][0], 'UNKNOWN-FICTIONAL-ALLERGEN'])
        elif mode in ('allergy_unknown', 'allergy_unresolved', 'allergy_other'):
            patient.update(allergy_status='unknown' if mode == 'allergy_unknown' else 'confirmed',
                allergies=[] if mode == 'allergy_unknown' else ['UNKNOWN-FICTIONAL-ALLERGEN' if mode == 'allergy_unresolved' else ('acyclovir' if profile['kind'] == 'paracetamol' else 'paracetamol')])
        elif mode in ('duplicate', 'medicine_unknown', 'medicine_unresolved', 'medicine_other', 'warfarin'):
            names = [] if mode == 'medicine_unknown' else ['UNKNOWN-FICTIONAL-PRODUCT'] if mode == 'medicine_unresolved' else ['warfarin'] if mode == 'warfarin' else [next(a['name'] for a in product['aliases'] if a['level'] == 'product')] if mode == 'duplicate' else ['acetaminophen 500 mg oral tablet' if profile['kind'] != 'paracetamol' else 'oseltamivir 75 mg capsule']
            patient.update(medicine_status='unknown' if mode == 'medicine_unknown' else 'confirmed', current_medicines=names)
        elif mode in ('laiv_review', 'laiv_unknown'):
            patient['laiv_timing'] = 'needs_review' if mode == 'laiv_review' else 'unknown'
        elif mode in ('pediatric_small', 'pediatric_large', 'pediatric_weight_unknown'):
            patient.update(age_years=5 + variant, weight_kg=14 + variant if mode == 'pediatric_small' else 44 + variant if mode == 'pediatric_large' else None)
        elif mode == 'age_unknown': patient['age_years'] = None
        elif mode == 'renal_unknown': patient['renal_assessment'] = 'unknown'
        elif mode == 'hepatic_review': patient['hepatic_assessment'] = 'needs_review'
        elif mode == 'targets_absent': patient.update(verified_symptoms=[], symptom_durations={name: None for name in SYMPTOMS})
        elif mode == 'targets_unknown': patient.update(symptoms_reviewed=False, verified_symptoms=[], symptom_durations={name: None for name in SYMPTOMS})
        elif mode == 'duration_unknown': patient['symptom_durations'] = {name: None for name in SYMPTOMS}
        elif mode == 'late_onset': patient['onset_hours'] = 72 + variant
        elif mode == 'onset_unknown': patient['onset_hours'] = None
        elif mode == 'who': patient['influenza_guideline'] = 'WHO_2024'
        elif mode == 'red_flag': patient['red_flags'] = 'present'
        elif mode == 'population_unknown': patient['special_population'] = 'unknown'
        elif mode == 'risk_unknown': patient['varicella_risk'] = 'unknown'
        elif not mode.startswith('dose_'): raise ValueError('Unknown fixture mechanism: ' + mode)
    return patient


def proposal(profile, product, patient, changes):
    # Explicit fictional proposals are generated for a dose-comparison task.
    # A proposal is not a prescription, recommendation or a teacher-score input.
    proposed = reference_regimen(profile, patient['age_years'], patient, product['route'])[0]
    if proposed is None:
        return None
    proposed = deepcopy(proposed)
    for mode in changes:
        if mode == 'dose_missing': return None
        if mode == 'dose_route': proposed['route'] = 'topical' if product['route'] == 'oral' else 'oral'
        if mode == 'dose_schedule': proposed['schedule_type'] = 'scheduled' if proposed.get('schedule_type') else 'oral_prn'
        if mode in ('dose_low', 'dose_high'):
            if proposed.get('amount') is not None:
                proposed['amount'] = str(float(proposed['amount']) * (0.5 if mode == 'dose_low' else 2))
            else: proposed['instructions'] = 'FICTIONAL WRONG INSTRUCTIONS'
        if mode == 'dose_volume': proposed.update(amount='1', unit='mL')
        if mode == 'dose_grams' and proposed.get('amount') is not None:
            proposed.update(amount=str(float(proposed['amount']) / 1000), unit='g')
        if mode == 'dose_frequency':
            if proposed.get('doses_per_day') is not None: proposed['doses_per_day'] += 1
            else: proposed['max_doses_per_day'] = 99
        if mode == 'dose_duration':
            if proposed.get('duration_days') is not None: proposed['duration_days'] += 2
            else: proposed['review_after_days'] = 99
    return proposed


def effective_rule(policy, profile):
    rule = deepcopy(profile)
    if policy['target_symptoms']:
        rule['parameters']['relevant_symptoms'] = policy['target_symptoms']
    if 'jaw_pain' in policy['target_symptoms']:
        rule['parameters']['symptom_review_days']['jaw_pain'] = rule['parameters']['symptom_review_days']['body_aches']
    if policy['condition'] not in ('influenza', 'chickenpox'):
        rule['parameters']['minimum_age_years'] = 18
    return rule


def purpose_target(patient, policy):
    if patient['care_setting'] != 'outpatient' or patient['condition_severity'] not in ('mild', 'moderate') or patient['red_flags'] != 'none' or patient['special_population'] != 'standard':
        return 'cannot_validate'
    if policy['handler'] in ('oseltamivir', 'acyclovir'):
        if policy['handler'] == 'oseltamivir':
            if patient['influenza_guideline'] == 'WHO_2024': return 'guideline_against'
            if patient['influenza_guideline'] != 'CDC_2026': return 'cannot_validate'
        elif patient['varicella_risk'] != 'risk_group_confirmed': return 'cannot_validate'
        onset = patient['onset_hours']
        if onset is None or onset > (48 if policy['handler'] == 'oseltamivir' else 24): return 'cannot_validate'
        return 'provisional_relevance'
    if not patient['symptoms_reviewed']: return 'cannot_validate'
    return 'provisional_relevance' if set(patient['verified_symptoms']) & set(policy['target_symptoms']) else 'not_relevant'


def evaluate(patient, product, rule, policy, proposed, profiles, products):
    wrapped = {key: SimpleNamespace(content=value, content_hash=old.content_hash(value)) for key, value in profiles.items()}
    wrapped[product['id']] = SimpleNamespace(content=rule, content_hash=old.content_hash(rule))
    snapshot = {'clinical': patient, 'context': patient, 'patient': {'age_years': patient['age_years']},
        'diagnosis': {'condition': policy['condition']}, 'omitted_unreviewed': []}
    candidate = run_screening([SimpleNamespace(pk=product['id'], content=product, content_hash=old.content_hash(product))],
        wrapped, snapshot, {product['id']: proposed}, old.match_synthetic_medicines(patient['current_medicines'], products))['candidates'][0]
    # Engine prose references real doctor workflow. Retain machine facts only;
    # never present synthetic rows as actual doctor attestations or reviews.
    checks = [{key: check[key] for key in ('category', 'status', 'source_ids')} for check in candidate['checks']]
    labels = {}
    for task in TASKS[:-1]:
        categories = {task, 'vaccine_interaction'} if task == 'interaction' else {task}
        value = aggregate([check for check in checks if check['category'] in categories])
        labels[task] = {'passed': 'matches_selected_rule', 'blocked': 'mismatch', 'cannot_validate': 'cannot_validate'}[value] if task == 'dose' else STATUS[value]
    labels['purpose_applicability'] = purpose_target(patient, policy)
    return labels, checks


def flatten_proposal(proposed):
    fields = ('amount', 'unit', 'route', 'schedule_type', 'doses_per_day', 'duration_days', 'interval_hours',
        'max_doses_per_day', 'max_daily_amount_mg', 'review_after_days', 'instructions')
    return {'proposal_' + key: (proposed or {}).get(key) for key in fields} | {'proposal_present': proposed is not None}


def features(row, task):
    patient = row['patient_features']
    result = {'candidate_id': row['candidate_id']}
    if task == 'allergy':
        result.update(allergy_status=patient['allergy_status'], allergy_mentions=json.dumps(sorted(patient['allergies'])))
    elif task in ('interaction', 'duplicate_ingredient'):
        result.update(medicine_status=patient['medicine_status'], current_medicine_mentions=json.dumps(sorted(patient['current_medicines'])))
        if task == 'interaction': result['laiv_timing'] = patient['laiv_timing']
    elif task in ('dose', 'purpose_applicability'):
        result['condition'] = row['condition']
        keys = ('age_years', 'weight_kg', 'renal_assessment', 'hepatic_assessment', 'topical_assessment') if task == 'dose' else (
            'care_setting', 'condition_severity', 'red_flags', 'special_population', 'onset_hours', 'influenza_guideline', 'varicella_risk')
        result.update({key: patient[key] for key in keys})
        result.update(symptoms_reviewed=patient['symptoms_reviewed'])
        for symptom in SYMPTOMS:
            result['symptom_' + symptom] = symptom in patient['verified_symptoms'] if patient['symptoms_reviewed'] else None
            if task == 'dose': result['duration_' + symptom] = patient['symptom_durations'].get(symptom)
        if task == 'dose': result.update(flatten_proposal(row['proposed_regimen']))
    else: raise ValueError('Unsupported task.')
    # Fixed schema includes explicit unknown tokens, never imputed clinical facts.
    return {key: '__unknown__' if value is None else str(value) if isinstance(value, bool) else value for key, value in result.items()}


def make_row(family, variant, policy, product, rule, profiles, products):
    patient = changed_patient(family['ages'][variant], family['changes'], product, rule, variant)
    proposed = proposal(rule, product, patient, family['changes'])
    labels, checks = evaluate(patient, product, rule, policy, proposed, profiles, products)
    return {'scenario_id': f"RF-RULE-{family['id']}-{variant + 1}-{policy['id']}", 'template_family': family['id'],
        'condition': policy['condition'], 'candidate_id': product['id'], 'purpose': policy['purpose'], 'clinical_role': policy['clinical_role'],
        'split': family['split'], 'patient_features': patient, 'proposed_regimen': proposed, 'targets': labels, 'teacher_checks': checks,
        'evidence_references': sorted(set(policy['source_ids'] + rule['source_ids'] + (['who-flu-2024', 'cdc-flu-2026'] if rule['kind'] == 'oseltamivir' else []))),
        'rule_version': rule['version'], 'rule_hash': old.content_hash(rule), 'label_method': 'rule_derived',
        'criteria_version': criteria()['version'],
        'clinical_review_status': 'not_reviewed', 'fact_origin': 'new_controlled_fictional_fixture; not_copied_patient_facts',
        'synthetic_only': True, 'clinical_validation': False, 'review_gate_evaluated': False,
        'approved': False, 'prescription_eligible': False}


def validate(rows):
    source_data.require(rows and len({r['scenario_id'] for r in rows}) == len(rows), 'Empty/duplicate scenario IDs.')
    groups = defaultdict(set)
    for row in rows:
        groups[row['template_family']].add(row['split'])
        source_data.require(row['label_method'] == 'rule_derived' and row['clinical_review_status'] == 'not_reviewed' and row['synthetic_only'] is True
            and not row['approved'] and not row['prescription_eligible'], 'Synthetic provenance changed.')
        source_data.require(set(row['targets']) == set(TASKS) and row['evidence_references'], 'Missing target/evidence provenance.')
    source_data.require(all(len(values) == 1 for values in groups.values()), 'Template family crosses partitions.')
    return {'rows': len(rows), 'families': len(groups), 'family_leakage': False,
        'splits': {split: {'rows': sum(r['split'] == split for r in rows), 'families': sum(split in s for s in groups.values())} for split in source_data.SPLITS},
        'class_balance': {task: {split: dict(Counter(r['targets'][task] for r in rows if r['split'] == split)) for split in source_data.SPLITS} for task in TASKS}}


def initial_batch():
    products, policies, profiles = knowledge()
    selected = {'train__standard', 'train__matching_allergy', 'train__unknown_medicine', 'train__low_dose'}
    return [make_row(family, 0, p, products[p['candidate_id']], effective_rule(p, profiles[p['candidate_id']]), profiles, products)
        for family in families() if family['id'] in selected for p in policies]


def fixtures():
    products, policies, profiles = knowledge()
    definitions = families()
    # Validate the small first batch before creating the full expansion.
    initial = initial_batch()
    validate(initial)
    rows = [make_row(family, variant, p, products[p['candidate_id']], effective_rule(p, profiles[p['candidate_id']]), profiles, products)
        for family in definitions for variant in range(len(family['ages'])) for p in policies]
    return rows, initial, validate(rows)


def audit_source_200():
    # Entirely separate: never rewrite labels or fill unverified history/doses.
    source = source_data.DEFAULT_OUTPUT
    cases, pairs, audit = source_data.load_inputs(source / 'inputs/patient_scenarios_200.csv', source / 'inputs/MediTrack_Synthetic_200.xlsx')
    output = []
    for row in pairs:
        output.append({'scenario_id': row['scenario_id'], 'candidate_key': row['candidate_key'], 'purpose': row['purpose'],
            'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed', 'used_for_training': False,
            'allergy': 'cannot_validate', 'duplicate_ingredient': 'cannot_validate', 'interaction': 'cannot_validate', 'dose': 'cannot_validate', 'purpose_applicability': 'cannot_validate',
            'best_medicine': None, 'reason': 'reported facts remain unverified; exact product and proposed regimen not established',
            'source_evidence': row['evidence_references'], 'synthetic_only': True})
    return output, {'cases': len(cases), 'candidate_rows': len(output), 'clinical_facts_promoted': 0,
        'invented_proposed_regimens': 0, 'source_hashes': audit['sources'], 'used_for_training': False}


def build(output=OUTPUT):
    output = Path(output)
    source_data.require(not (output / 'manifest.json').exists() and not (output / 'models.joblib').exists(), 'Frozen run exists. Use a new output/version.')
    rows, initial, audit = fixtures()
    source_rows, source_audit = audit_source_200()
    output.mkdir(parents=True, exist_ok=True)
    for name, value in (('criteria.json', criteria()), ('inspection_batch.json', initial), ('audit.json', audit),
        ('templates.json', families()), ('source_200_audit.json', source_audit), ('source_bindings.json', bindings())):
        source_data.write_json(output / name, value)
    for name, values in (('dataset.jsonl', rows), ('source_200_labels.jsonl', source_rows)):
        (output / name).write_text(''.join(json.dumps(r, sort_keys=True, allow_nan=False) + '\n' for r in values), encoding='utf-8', newline='\n')
    with (output / 'inspection_rows.csv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['scenario_id', 'template_family', 'condition', 'candidate_id', 'purpose', *TASKS, 'label_method', 'clinical_review_status'])
        writer.writeheader()
        writer.writerows({key: row[key] for key in writer.fieldnames if key not in TASKS} | row['targets'] for row in initial)
    source_data.write_json(output / 'evidence.json', {'criteria_version': criteria()['version'],
        'references': {s['id']: s for product in knowledge()[0].values() for s in product['sources']},
        'source_handling': 'Existing versioned local policy interpretations reused. Web sources checked 2026-10-20; no clinician approval or exhaustive evidence review claimed.',
        'guideline_references': [{'id': 'who-flu-2024', 'url': 'https://www.ncbi.nlm.nih.gov/sites/books/NBK607909/', 'section': '1.4 and 1.5'},
            {'id': 'cdc-flu-2026', 'url': 'https://www.cdc.gov/flu/hcp/antivirals/summary-clinicians.html', 'section': 'outpatient treatment'}]})
    return audit
