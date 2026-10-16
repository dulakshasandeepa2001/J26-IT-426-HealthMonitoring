"""Source-based synthetic rule checks. No ML, clinical review, ORM or publication."""

from copy import deepcopy
from types import SimpleNamespace

from prescription_drafts.engine import allergy_identity, aggregate, reference_regimen, run_screening
from prescription_research import dataset as ds
from .knowledge import CMC, CONCERN_FIELDS, CONDITIONS, HERE, ORS, SYMPTOMS, VERSION, load_knowledge

ENGINE_VERSION = 'six-condition-static-experiment-2026-10-16-v1'
COMMON_CONCERNS = ('respiratory_concern', 'neurological_concern', 'hydration_concern', 'immunocompromised', 'pregnant_or_breastfeeding')
ASSESSMENTS = ('red_flags', 'special_population', 'hepatic_assessment', 'renal_assessment', 'varicella_risk',
    'laiv_timing', 'topical_assessment', 'ophthalmic_integrity', 'excipient_assessment',
    'dehydration_assessment', 'oral_fluid_tolerance')


def normalize_case(case):
    try:
        ds.check_schema(case, ds.read_json(HERE / 'case.schema.json'))
    except OverflowError as error:
        raise ds.ValidationError('Numeric input is outside supported finite bounds.') from error
    case = deepcopy(case)
    patient = case['patient_features']
    for name in ('age_years', 'weight_kg', 'onset_hours'):
        patient.setdefault(name, None)
    symptoms = patient.setdefault('symptoms', {})
    for name in SYMPTOMS:
        symptoms.setdefault(name, {'present': None, 'duration_hours': None})
        ds.require(symptoms[name]['present'] is not False or symptoms[name]['duration_hours'] in (None, 0), 'Absent symptoms cannot carry positive durations.')
    for name in ('allergy_history', 'current_medicines'):
        patient.setdefault(name, {'status': 'unknown', 'mentions': []})
    assessments = patient.setdefault('assessments', {})
    for name in ASSESSMENTS:
        assessments.setdefault(name, 'unknown')
    concerns = patient.setdefault('condition_assessments', {})
    for name in CONCERN_FIELDS:
        concerns.setdefault(name, None)
    # Source observations are retained independently. Negative values never fill
    # the synthetic independent assessment; positive concerns can prevent a plan.
    case.setdefault('reported_observations', {})
    return case


def finding(category, status, reason, sources=()):
    return {'category': category, 'status': status, 'reason_code': reason, 'source_ids': list(sources)}


def condition_findings(case, policy):
    patient = case['patient_features']
    sources = policy['source_ids']
    checks = []
    if policy['condition'] not in ('influenza', 'chickenpox'):
        age = patient['age_years']
        checks.append(finding('research_age_scope', 'cannot_validate' if age is None else 'blocked' if age < 18 else 'passed',
            'unknown_age' if age is None else 'outside_adult_research_scope' if age < 18 else 'adult_research_scope_only'))
        for name in policy['concern_fields']:
            value = patient['condition_assessments'][name]
            checks.append(finding('condition_scope:' + name, 'cannot_validate' if value is None else 'blocked' if value else 'passed',
                                  'unknown_selected_assessment' if value is None else 'selected_concern_requires_assessment' if value else 'synthetic_negative_observation_only', sources))
    reported = set(COMMON_CONCERNS) | set(policy['concern_fields'])
    if any(case['reported_observations'].get(name) is True for name in reported):
        checks.append(finding('source_reported_concern', 'blocked', 'unverified_positive_source_concern_not_cleared', sources))
    for name in ('immunocompromised', 'pregnant_or_breastfeeding'):
        if patient['condition_assessments'][name] is True:
            checks.append(finding('special_population', 'blocked', 'positive_special_population_observation', sources))
    return checks


def legacy_evaluation(case, policy, products, legacy):
    """Reuse all original checks; only mapping-specific research facts are adapted.

    Historical 'verified'/'doctor' names inside the pure pilot engine refer here
    to supplied synthetic facts. Never output those messages as review attestations.
    """
    patient = case['patient_features']
    product = products[policy['candidate_id']]
    rule = deepcopy(legacy[product['id']])
    if policy['target_symptoms']:
        rule['parameters']['relevant_symptoms'] = policy['target_symptoms']
    if policy['condition'] == 'mumps':
        # The general-pain review limit is inherited, not a new disease duration.
        rule['parameters']['symptom_review_days']['jaw_pain'] = rule['parameters']['symptom_review_days']['body_aches']
    if policy['condition'] not in ('influenza', 'chickenpox'):
        rule['parameters']['minimum_age_years'] = 18  # Research scope, not label contraindication.
    facts = {name: patient['assessments'][name] for name in ASSESSMENTS}
    targets = policy['target_symptoms']
    facts.update(onset_hours=patient['onset_hours'], weight_kg=patient['weight_kg'],
        symptoms_reviewed=all(patient['symptoms'][name]['present'] is not None for name in targets),
        verified_symptoms=[name for name in targets if patient['symptoms'][name]['present'] is True],
        symptom_durations={name: patient['symptoms'][name]['duration_hours'] for name in targets})
    context = {}
    for name, status_key, list_key in (('allergy_history', 'allergy_status', 'allergies'), ('current_medicines', 'medicine_status', 'current_medicines')):
        history = patient[name]
        context[status_key] = 'confirmed' if history['status'] == 'reported' else history['status']
        context[list_key] = history['mentions']
    profiles = {key: SimpleNamespace(content=content, content_hash=ds.content_hash(content)) for key, content in legacy.items()}
    profiles[product['id']] = SimpleNamespace(content=rule, content_hash=ds.content_hash(rule))
    snapshot = {'clinical': facts, 'context': context, 'patient': {'age_years': patient['age_years']},
                'diagnosis': {'condition': policy['condition']}, 'omitted_unreviewed': []}
    reference = reference_regimen(rule, patient['age_years'], facts, product['route'])[0]
    matches = ds.match_synthetic_medicines(context['current_medicines'], products)
    result = run_screening([SimpleNamespace(pk=product['id'], content=product, content_hash=ds.content_hash(product))],
                           profiles, snapshot, {product['id']: reference}, matches)['candidates'][0]
    checks = [finding(item['category'], item['status'], 'reused_pilot_' + item['category'] + '_' + item['status'], item['source_ids']) for item in result['checks']]
    if reference and policy['condition'] == 'mumps':
        reference['instructions'] = reference['instructions'].replace('fever or aches', 'fever or pain')
    return checks, reference


def ophthalmic_common(case, policy, products, legacy):
    patient = case['patient_features']
    assessments = patient['assessments']
    sources = policy['source_ids']
    checks = []
    for name, passed in (('red_flags', 'none'), ('special_population', 'standard')):
        value = assessments[name]
        status = 'passed' if value == passed else 'blocked' if name == 'red_flags' and value == 'present' else 'cannot_validate'
        checks.append(finding(name, status, 'synthetic_' + name + '_' + status, sources))
    vocabulary = {item for rule in legacy.values() for item in rule['allergy_names']} | {'carboxymethylcellulose sodium', 'carboxymethylcellulose'}
    history = patient['allergy_history']
    identities = [allergy_identity(text, vocabulary) for text in history['mentions']]
    incomplete = (history['status'] == 'unknown' or (history['status'] == 'reported' and not identities) or (history['status'] == 'none' and bool(identities)))
    # A known matching allergy remains a block alongside unresolved entries.
    allergy_status = 'blocked' if {'carboxymethylcellulose sodium', 'carboxymethylcellulose'} & set(identities) else 'cannot_validate' if incomplete or None in identities else 'passed'
    checks.append(finding('allergy', allergy_status, 'selected_ingredient_allergy_' + allergy_status, sources))
    history = patient['current_medicines']
    matches = ds.match_synthetic_medicines(history['mentions'], products)
    unresolved = (history['status'] == 'unknown' or (history['status'] == 'reported' and not matches)
                  or (history['status'] == 'none' and bool(matches)) or any(item['status'] != 'recognized' for item in matches))
    duplicate = any('carboxymethylcellulose sodium' in match['ingredients'] for row in matches for match in row['matches'])
    checks.append(finding('duplicate_ingredient', 'blocked' if duplicate else 'cannot_validate' if unresolved else 'passed', 'current_ingredient_duplicate' if duplicate else 'current_identity_incomplete' if unresolved else 'no_supported_duplicate', sources))
    checks.append(finding('interaction', 'cannot_validate' if unresolved else 'warning' if matches else 'passed',
                          'current_medicines_unknown' if unresolved else 'pair_review_required' if matches else 'synthetic_no_current_medicines', sources))
    for name in ('ophthalmic_integrity', 'excipient_assessment'):
        value = assessments[name]
        checks.append(finding(name, 'passed' if value == 'acceptable' else 'cannot_validate' if value == 'unknown' else 'blocked',
                              'synthetic_product_assessment_' + value, sources))
    checks.append(finding('coverage', 'warning', 'selected_source_controls_only_local_equivalence_not_verified', sources))
    return checks


def ophthalmic_reference(case, policy):
    symptoms = case['patient_features']['symptoms']
    targets = policy['target_symptoms']
    sources = policy['source_ids']
    if any(symptoms[name]['present'] is None for name in targets):
        return [finding('symptom_relevance', 'cannot_validate', 'unknown_target_observation', sources)], None
    present = [symptoms[name] for name in targets if symptoms[name]['present'] is True]
    if not present:
        return [finding('symptom_relevance', 'cannot_validate', 'no_declared_relief_target', sources)], None
    if any(item['duration_hours'] is None for item in present):
        return [finding('symptom_duration', 'cannot_validate', 'missing_target_duration', sources)], None
    if any(item['duration_hours'] > 72 for item in present):
        return [finding('symptom_duration', 'blocked', 'beyond_label_reassessment_window', sources)], None
    return [finding('symptom_relevance', 'passed', 'synthetic_target_present', sources)], {
        'schedule_type': 'ophthalmic_prn', 'amount_range': [1, 2], 'unit': 'drop', 'route': 'ophthalmic',
        'frequency': 'as_needed', 'fixed_duration_days': None, 'reassessment_limit_hours': 72,
        'instructions': 'For affected eye(s) as needed. Keep the dropper tip clean. Review pain, vision change, '
                        'persistent redness, worsening or symptoms beyond the label reassessment limit. No drop-to-mL conversion or fixed course.'}


def evaluate_case(case, knowledge=None):
    case = normalize_case(case)
    products, policies, legacy = knowledge or load_knowledge()
    results = []
    for policy in policies:
        if policy['condition'] != case['condition']:
            continue
        checks = condition_findings(case, policy)
        reference = None
        if policy['handler'] in ('paracetamol', 'oseltamivir', 'acyclovir', 'calamine'):
            findings, reference = legacy_evaluation(case, policy, products, legacy)
            checks.extend(findings)
        elif policy['handler'] == 'ophthalmic_lubricant':
            checks.extend(ophthalmic_common(case, policy, products, legacy))
            findings, reference = ophthalmic_reference(case, policy)
            checks.extend(findings)
        elif policy['handler'] == 'unresolved_ors':
            checks.append(finding('product_identity', 'blocked', 'exact_ors_label_composition_dilution_identifier_unresolved', policy['source_ids']))
            assessments = case['patient_features']['assessments']
            for name, outside in (('dehydration_assessment', {'moderate', 'severe'}), ('oral_fluid_tolerance', {'not_tolerated'})):
                value = assessments[name]
                checks.append(finding(name, 'cannot_validate' if value == 'unknown' else 'blocked' if value in outside else 'passed', 'synthetic_' + name + '_' + value, policy['source_ids']))
        else:
            raise ds.ValidationError('No executable handler for this policy; fallback dosing is forbidden.')
        obstacles = [check for check in checks if check['status'] in ('blocked', 'cannot_validate')
                     or (check['status'] == 'warning' and check['category'] not in ('coverage', 'topical_precaution'))]
        targets = [case['patient_features']['symptoms'][name]['present'] for name in policy['target_symptoms']]
        no_target = bool(targets) and all(value is False for value in targets)
        status = aggregate(checks)
        results.append({'case_id': case['case_id'], 'condition': case['condition'], 'policy_id': policy['id'],
            'candidate_id': policy['candidate_id'], 'purpose': policy['purpose'], 'clinical_role': policy['clinical_role'],
            'rule_version': policy['version'], 'aggregate_status': status,
            'workflow_outcome': 'requires_assessment' if status == 'blocked' else 'no_medicine_needed' if no_target else 'requires_assessment' if obstacles else 'experimental_reference_only',
            'findings': checks, 'experimental_reference': None if obstacles else reference,
            'clinical_review_status': 'not_reviewed', 'simulation_only': True, 'review_gate_evaluated': False,
            'eligible_for_prescription': False, 'full_safety_clearance': False, 'approved': False, 'published': False})
    return {'engine_version': ENGINE_VERSION, 'knowledge_version': VERSION, 'case': case,
            'coverage': 'supported_static_experiment' if case['condition'] in CONDITIONS else 'unsupported_condition',
            'results': results, 'simulation_only': True, 'model_used': False}
