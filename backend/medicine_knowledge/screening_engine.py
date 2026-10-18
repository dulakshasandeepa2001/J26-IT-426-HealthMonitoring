"""Deterministic candidate screening only. No ML, publication or safety override."""
from copy import deepcopy
from types import SimpleNamespace
from decimal import Decimal
from prescription_drafts.engine import allergy_identity, aggregate, reference_regimen, run_screening
from prescription_context.history_identity import resolved_allergies, resolve_medicines

ENGINE_VERSION = 'six-condition-patient-screening-2026-10-17-v2'
BLOCKING = {'blocked', 'cannot_validate'}


def finding(category, status, message, sources=()):
    return {'category': category, 'status': status, 'message': message, 'source_ids': list(sources)}


def normalize_history(names, products, context=None):
    """Exact aliases only. An ingredient match never establishes a product/dose."""
    result = []
    for name in names:
        key = ' '.join(name.casefold().split())
        matches = []
        for identity, product in products.items():
            alias = next((alias for alias in product['aliases'] if ' '.join(alias['name'].casefold().split()) == key), None)
            if alias:
                matches.append({'entry_id': identity, 'ingredients': [i['name'] for i in product['ingredients']],
                    'match_level': alias['level'], 'standard_concept': product.get('standard_concept') if alias['level'] == 'product' else None})
        result.append({'input': name, 'status': 'recognized' if len(matches) == 1 else 'ambiguous' if matches else 'unrecognized', 'matches': matches})
    return resolve_medicines(context, products, result) if context is not None else result


def structured_allergy_check(snapshot, contraindicated):
    context = snapshot['context']
    identities = resolved_allergies(context)
    if identities is None:
        return None
    incomplete = context['allergy_status'] not in ('confirmed', 'none') or (context['allergy_status'] == 'confirmed' and not identities) or (context['allergy_status'] == 'none' and bool(identities))
    if set(filter(None, identities)) & set(contraindicated):
        return finding('allergy', 'blocked', 'A doctor-confirmed recorded allergen matches the selected ingredient/cross-hypersensitivity rule. The allergy record is retained.')
    if incomplete or None in identities:
        return finding('allergy', 'cannot_validate', 'A recorded allergy has no confirmed supported identity. Clarify it in Patient allergies and current medicines; do not delete it or mark it absent.')
    return finding('allergy', 'passed', 'Doctor-confirmed recorded identities have no match in this selected ingredient/cross-hypersensitivity rule. This is not allergy delabelling, excipient clearance or comprehensive cross-reactivity assessment.')


def common_checks(snapshot, policy, adult_only):
    facts, age = snapshot['clinical'], snapshot['patient']['age_years']
    reported = snapshot['source_observations']
    checks = []
    if age is None:
        checks.append(finding('age', 'cannot_validate', 'A valid registered DOB is required; JSON ages are not accepted.'))
    elif adult_only and age < 18:
        checks.append(finding('age_scope', 'cannot_validate', 'Outside this adult research pathway; this is not a universal product contraindication.'))
    if facts['care_setting'] != 'outpatient' or facts['condition_severity'] in ('unknown', 'severe') or reported.get('severity') == 'severe':
        checks.append(finding('clinical_scope', 'blocked' if facts['care_setting'] == 'hospital' or facts['condition_severity'] == 'severe' or reported.get('severity') == 'severe' else 'cannot_validate', 'Only assessed mild/moderate outpatient contexts are encoded.'))
    if facts['red_flags'] != 'none' or reported['red_flags']:
        checks.append(finding('red_flags', 'blocked' if facts['red_flags'] == 'present' or reported['red_flags'] else 'cannot_validate', 'Reported red flags or missing independent assessment prevent selection.'))
    if facts['special_population'] != 'standard':
        checks.append(finding('special_population', 'cannot_validate', 'Standard assessed context is required; specialist/unknown contexts are outside this pathway.'))
    concerns = set(policy.get('concern_fields', [])) | {'respiratory_concern', 'neurological_concern', 'hydration_concern', 'immunocompromised', 'pregnant_or_breastfeeding'}
    for name in concerns:
        value = facts['condition_assessments'][name]
        if reported['assessments'].get(name) is True or value is True:
            checks.append(finding('condition_scope:' + name, 'blocked', 'A reported or independently assessed concern requires clarification/individualized care.'))
        elif adult_only and value is None:
            checks.append(finding('condition_scope:' + name, 'cannot_validate', 'The required independent assessment is unknown.'))
    return checks


def identity_checks(snapshot, product, matches, vocabulary, contraindicated):
    context = snapshot['context']
    identities = [allergy_identity(name, vocabulary) for name in context['allergies']]
    checks = []
    allergy_incomplete = context['allergy_status'] not in ('confirmed', 'none') or (context['allergy_status'] == 'confirmed' and not identities) or (context['allergy_status'] == 'none' and bool(identities))
    checks.append(finding('allergy', 'blocked' if set(filter(None, identities)) & set(contraindicated) else 'cannot_validate' if allergy_incomplete or None in identities else 'passed', 'Exact supported ingredient/hypersensitivity check; unknown identities cannot be cleared.'))
    structured = structured_allergy_check(snapshot, contraindicated)
    if structured is not None:
        checks[-1] = structured
    incomplete = context['medicine_status'] not in ('confirmed', 'none') or (context['medicine_status'] == 'confirmed' and not matches) or (context['medicine_status'] == 'none' and bool(matches)) or any(m['status'] != 'recognized' for m in matches)
    current = {ingredient for row in matches for match in row['matches'] for ingredient in match['ingredients']}
    duplicate = current & {i['name'] for i in product['ingredients']}
    checks.append(finding('duplicate_ingredient', 'blocked' if duplicate else 'cannot_validate' if incomplete else 'passed', 'A duplicate blocks a new candidate; an unresolved current medicine cannot be treated as absent.'))
    checks.append(finding('interaction', 'cannot_validate' if incomplete or matches else 'passed', 'Current medicines require a separate comprehensive pair review; no interaction database is claimed.'))
    if snapshot['clinical']['excipient_assessment'] != 'acceptable':
        checks.append(finding('excipients', 'cannot_validate', 'Exact product/excipient suitability must be independently assessed.'))
    return checks


def target_checks(facts, targets, windows):
    checks = []
    present = set(facts['verified_symptoms']) & set(targets)
    if not facts['symptoms_reviewed']:
        checks.append(finding('symptom_relevance', 'cannot_validate', 'Verify relevant symptom targets; source observations are not verification.'))
    elif not present:
        checks.append(finding('symptom_relevance', 'cannot_validate', 'No verified symptom target requires this purpose.'))
    for name in present:
        duration = facts['symptom_durations'].get(name)
        if duration is None or Decimal(str(duration)) > windows[name]:
            checks.append(finding('symptom_duration', 'cannot_validate', 'Missing duration or outside the selected label reassessment window.'))
    return checks


def screen_candidate(snapshot, candidate, profiles, products, matches):
    policy, product = candidate['policy'], candidate['product']
    kind = policy['handler']
    facts, age = snapshot['clinical'], snapshot['patient']['age_years']
    adult = snapshot['diagnosis']['condition'] not in ('influenza', 'chickenpox')
    checks = common_checks(snapshot, policy, adult)
    checks.extend(candidate['gate_findings'])
    reference = None
    if kind == 'unresolved_ors':
        checks.append(finding('product_identity', 'blocked', 'Exact ORS label/composition/dilution remains unresolved; no regimen is generated.'))
    elif not product or kind == 'catalogue_only':
        checks.append(finding('product_rule_coverage', 'cannot_validate', 'Exact product or executable policy is incomplete; no fallback medicine/dose is substituted.'))
    elif kind in ('paracetamol', 'oseltamivir', 'acyclovir', 'calamine'):
        rule = candidate['reference_profile']
        reference, reason = reference_regimen(rule, age, facts, product['route'])
        medicine = SimpleNamespace(pk=policy['candidate_id'], content=product, content_hash=candidate['content_hash'])
        used_profiles = {k: SimpleNamespace(content=v, content_hash='reference') for k, v in profiles.items()}
        used_profiles[medicine.pk] = SimpleNamespace(content=rule, content_hash=candidate['rules_hash'])
        old = run_screening([medicine], used_profiles, snapshot, {medicine.pk: reference}, matches)['candidates'][0]
        checks.extend(old['checks'])
        structured = structured_allergy_check(snapshot, rule['allergy_names'])
        if structured is not None:
            checks = [structured if row['category'] == 'allergy' else row for row in checks]
        if reason:
            checks.append(finding('dose', 'cannot_validate', reason))
        if kind == 'oseltamivir':
            if facts['influenza_guideline'] != 'CDC_2026':
                checks.append(finding('guideline', 'cannot_validate', 'Select/review the CDC 2026 outpatient pathway explicitly. WHO 2024 differs for non-severe influenza; ML cannot resolve that difference.'))
            else:
                checks.append(finding('guideline', 'warning', 'Source-specific CDC outpatient pathway; WHO 2024 recommends against oseltamivir for non-severe influenza.'))
    elif kind in ('ophthalmic_lubricant', 'hypromellose', 'ibuprofen'):
        vocabulary = {name for rule in profiles.values() for name in rule['allergy_names']} | {'ibuprofen', 'aspirin', 'nsaid', 'nsaids', 'hypromellose', 'carboxymethylcellulose', 'carboxymethylcellulose sodium'}
        contraindicated = {'ibuprofen', 'aspirin', 'nsaid', 'nsaids'} if kind == 'ibuprofen' else {i['name'] for i in product['ingredients']}
        if kind == 'ophthalmic_lubricant':
            contraindicated.add('carboxymethylcellulose')
        checks.extend(identity_checks(snapshot, product, matches, vocabulary, contraindicated))
        if kind == 'ibuprofen':
            windows = {'fever': 72, 'body_aches': 240, 'jaw_pain': 240}
            checks.extend(target_checks(facts, policy['target_symptoms'], windows))
            for name, standard in (('renal_assessment', 'standard'), ('hepatic_assessment', 'standard'), ('nsaid_assessment', 'standard'), ('gi_bleeding_assessment', 'none'), ('cardiovascular_assessment', 'standard')):
                if facts[name] != standard:
                    checks.append(finding(name, 'blocked' if name == 'gi_bleeding_assessment' and facts[name] == 'present' else 'cannot_validate', 'A required NSAID product assessment is missing or outside the encoded context.'))
            reference = {'schedule_type': 'oral_prn', 'amount': '200', 'unit': 'mg', 'route': 'oral', 'interval_hours_range': [4, 6],
                'max_daily_amount_mg': 1200, 'duration_days': None, 'instructions': 'One 200 mg tablet as needed under the reviewed label; do not automatically escalate to two tablets. Seek review for worsening symptoms, fever over 3 days or pain over 10 days.'}
        else:
            checks.extend(target_checks(facts, policy['target_symptoms'], {name: 72 for name in policy['target_symptoms']}))
            if facts['ophthalmic_integrity'] != 'acceptable':
                checks.append(finding('ophthalmic_integrity', 'cannot_validate', 'Assess exact sterile product/dropper integrity before considering an eye regimen.'))
            reference = {'schedule_type': 'ophthalmic_prn', 'amount_range': [1, 2], 'unit': 'drop', 'route': 'ophthalmic',
                'frequency': 'as_needed', 'duration_days': None, 'reassessment_limit_hours': 72,
                'instructions': 'Affected eye(s), as needed under the reviewed label. No fixed daily schedule, course or drop-to-mL conversion. Reassess pain, vision changes, persistent redness or worsening symptoms.'}
    elif kind == 'unresolved_ors':
        checks.append(finding('product_identity', 'blocked', 'Exact ORS label/composition/dilution remains unresolved; no regimen is generated.'))
    else:
        checks.append(finding('handler', 'cannot_validate', 'No executable handler exists for this candidate.'))
    if snapshot['diagnosis']['condition'] == 'viral_gastroenteritis':
        if facts['dehydration_assessment'] not in ('none', 'mild') or facts['oral_fluid_tolerance'] != 'tolerated':
            checks.append(finding('hydration', 'blocked' if facts['dehydration_assessment'] in ('moderate', 'severe') or facts['oral_fluid_tolerance'] == 'not_tolerated' else 'cannot_validate', 'Hydration severity/oral tolerance is unknown or outside this pathway.'))
    checks.append(finding('coverage', 'warning', 'Selected source-based prototype checks only; no comprehensive safety clearance, local product equivalence or clinical validation is claimed.'))
    obstacles = [row for row in checks if row['status'] in BLOCKING or row['status'] == 'warning' and row['category'] not in ('coverage', 'topical_precaution', 'guideline')]
    return {'scope_id': candidate['scope_id'], 'medicine_id': policy['candidate_id'], 'generic_name': candidate['name'],
        'purpose': policy['purpose'], 'clinical_role': policy['clinical_role'], 'status': 'unavailable' if obstacles or reference is None else 'candidate_for_clinician_review',
        'screening_status': aggregate(checks), 'checks': checks, 'regimen': None if obstacles else reference,
        'product': product, 'sources': candidate['sources'], 'content_hash': candidate['content_hash'], 'rules_hash': candidate['rules_hash'],
        'approved': False, 'published': False, 'prescription_eligible': False}
