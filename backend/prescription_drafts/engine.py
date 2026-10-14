"""Reviewed pilot checks and guarded regimen suggestions for clinician review."""

import re
from decimal import Decimal

ENGINE_VERSION = 'pp1-screening-2026-10-14-v3'
STATUS_ORDER = {'passed': 0, 'warning': 1, 'cannot_validate': 2, 'blocked': 3}


def number(value):
    return Decimal(str(value)) if value is not None else None


def aggregate(checks):
    return max((item['status'] for item in checks), key=STATUS_ORDER.get)


def allergy_identity(text, vocabulary):
    key = ' '.join(text.casefold().split())
    if key in vocabulary:
        return key
    # Only a known exact name followed by a reaction annotation is accepted.
    match = re.fullmatch(r'([^()]+)\s*\([^()]+\)', key)
    return match[1].strip() if match and match[1].strip() in vocabulary else None


def run_screening(medicines, profiles, snapshot, proposals, medication_matches):
    facts = snapshot['clinical']
    context = snapshot['context']
    age = snapshot['patient']['age_years']
    condition = snapshot['diagnosis']['condition']
    analysis = snapshot.get('analysis') or {}
    symptoms = {item['code'] for item in analysis.get('payload', {}).get('symptoms', []) if item.get('present') is True}
    voice_flags = analysis.get('payload', {}).get('severity', {}).get('red_flags', [])
    vocabulary = {name for profile in profiles.values() for name in profile.content['allergy_names']}
    identified = [allergy_identity(item, vocabulary) for item in context['allergies']]
    unmatched_medicines = [item['input'] for item in medication_matches if item['status'] != 'recognized']
    medicine_incomplete = (context['medicine_status'] not in ('confirmed', 'none')
                           or (context['medicine_status'] == 'confirmed' and not context['current_medicines'])
                           or (context['medicine_status'] == 'none' and bool(context['current_medicines'])))
    ingredients = {ingredient for item in medication_matches for match in item['matches'] for ingredient in match['ingredients']}
    candidates = []
    for medicine in medicines:
        profile = profiles[medicine.pk]
        policy = profile.content
        parameters = policy['parameters']
        dose = proposals.get(medicine.pk)
        checks = []

        def check(category, status, message, evidence=True):
            checks.append({'category': category, 'status': status, 'message': message,
                           'source_ids': policy['source_ids'] if evidence else []})

        if facts['red_flags'] == 'present' or voice_flags:
            check('clinical_scope', 'blocked', 'A red flag is reported. This limited outpatient screening cannot clear the candidate.')
        elif facts['red_flags'] == 'unknown':
            check('clinical_scope', 'cannot_validate', 'A clinician red-flag assessment is missing.')
        else:
            check('clinical_scope', 'passed', 'The doctor reported no red flags for this screening; this is not an independent examination.')
        if facts['special_population'] != 'standard':
            check('special_population', 'cannot_validate', 'Pregnancy/breastfeeding, immunocompromise or other specialist-context assessment is unknown or outside the standard pilot.')
        else:
            check('special_population', 'passed', 'The doctor documented standard pilot context.')
        if age is None:
            check('age', 'cannot_validate', 'Valid registered DOB is needed; cached or guessed ages are not used.', False)
        else:
            check('age', 'passed', f'Registered completed age used for this screening: {age} years.', False)
        if context['allergy_status'] not in ('confirmed', 'none') or (context['allergy_status'] == 'none' and context['allergies']):
            check('allergy', 'cannot_validate', 'Allergy history remains unknown.')
        elif context['allergy_status'] == 'confirmed' and not context['allergies']:
            check('allergy', 'cannot_validate', 'Known allergy status has no recorded items.')
        elif set(filter(None, identified)) & set(policy['allergy_names']):
            check('allergy', 'blocked', 'A documented ingredient or label-linked cross-hypersensitivity match requires exclusion from this draft candidate set.')
        elif None in identified:
            check('allergy', 'cannot_validate', 'An allergy identity is unresolved. Clarify the recorded allergy before clearing this check.')
        else:
            check('allergy', 'passed', 'No matching supported ingredient allergy was found in doctor-reviewed information. Excipients are outside this matcher.')
        current_ingredients = {item['name'] for item in medicine.content['ingredients']}
        if current_ingredients & ingredients:
            check('duplicate_ingredient', 'blocked', 'The candidate duplicates an ingredient in reported current medicines. Continuation/replacement needs a separate clinician decision.')
        elif medicine_incomplete or unmatched_medicines:
            check('duplicate_ingredient', 'cannot_validate', 'Current medicine identities/status are incomplete; duplicate ingredients cannot be ruled out.')
        else:
            check('duplicate_ingredient', 'passed', 'No duplicate ingredient found among supported current medicine identities.')
        if medicine_incomplete:
            check('interaction', 'cannot_validate', 'Current medicines are unknown; interactions cannot be checked.')
        elif unmatched_medicines:
            check('interaction', 'cannot_validate', 'Unresolved current medicines prevent interaction clearance. The pilot has no comprehensive interaction database.')
        elif context['current_medicines']:
            check('interaction', 'warning', 'Only selected label cautions are screened. Other medicine pairs need clinician interaction review.')
        else:
            check('interaction', 'passed', 'The doctor reported no current medicines. This does not establish comprehensive interaction safety.')
        if policy['kind'] == 'paracetamol':
            if any(' '.join(item.casefold().split()) == 'warfarin' for item in context['current_medicines']):
                check('interaction', 'warning', 'The acetaminophen label calls for doctor/pharmacist review with warfarin.')
            if facts['hepatic_assessment'] != 'standard':
                check('hepatic', 'cannot_validate', 'Hepatic/alcohol-risk assessment is unknown or needs individualized review.')
            else:
                check('hepatic', 'passed', 'The doctor documented standard hepatic/alcohol-risk context for this limited check.')
        if policy['kind'] in ('oseltamivir', 'acyclovir'):
            if facts['renal_assessment'] != 'standard':
                check('renal', 'cannot_validate', 'Renal assessment is unknown or needs adjusted dosing outside this rule profile.')
            else:
                check('renal', 'passed', 'The doctor documented standard renal context; adjusted-dose rules are not applied.')
            onset = number(facts['onset_hours'])
            if onset is None:
                check('onset', 'cannot_validate', 'Doctor-verified symptom/rash onset hours are required; voice duration is not substituted.')
            elif onset > number(parameters['onset_limit_hours']):
                check('onset', 'cannot_validate', 'Onset is outside this selected label/guidance window. Broader indications are not assessed here.')
            else:
                check('onset', 'passed', 'Doctor-verified onset is within the selected treatment-window rule.')
        if policy['kind'] == 'oseltamivir':
            if facts['laiv_timing'] != 'no_conflict':
                check('vaccine_interaction', 'cannot_validate' if facts['laiv_timing'] == 'unknown' else 'warning', 'Live attenuated intranasal influenza vaccine timing needs label-based review.')
            else:
                check('vaccine_interaction', 'passed', 'The doctor documented no timing conflict with the label LAIV precaution.')
        if policy['kind'] == 'acyclovir':
            if facts['varicella_risk'] == 'typical_uncomplicated_child':
                check('indication_scope', 'blocked', 'CDC guidance does not recommend routine oral antiviral treatment for typical uncomplicated varicella in otherwise healthy children.')
            elif facts['varicella_risk'] != 'risk_group_confirmed':
                check('indication_scope', 'cannot_validate', 'The clinician has not confirmed an applicable varicella risk-group indication.')
            else:
                check('indication_scope', 'passed', 'The doctor confirmed the applicable varicella indication context.')
        relevant = parameters.get('relevant_symptoms')
        if relevant:
            if not facts.get('symptoms_reviewed'):
                check('symptom_relevance', 'cannot_validate', 'Review the symptom targets and their durations for this visit.')
            elif not set(facts.get('verified_symptoms', [])).intersection(relevant):
                check('symptom_relevance', 'cannot_validate', 'No clinician-verified target symptom requires this symptom-relief medicine.')
            else:
                check('symptom_relevance', 'passed', 'The doctor confirmed the applicable symptom-relief target.')
        if policy['kind'] == 'calamine':
            if facts.get('topical_assessment') != 'standard':
                check('topical_scope', 'cannot_validate', 'External-use/eye-area suitability is unknown or needs individualized review.')
            check('topical_precaution', 'warning', 'External use only; eyes and worsening/persistent symptoms require product-label review.')
        validate_dose(policy, age, facts, dose, medicine.content['route'], check)
        check('coverage', 'warning', 'Selected pilot rules only: excipients, full interaction coverage and local product suitability still require clinician review.')
        candidates.append({'medicine_id': medicine.pk, 'generic_name': medicine.content['generic_name'],
            'strength': medicine.content['strength'], 'form': medicine.content['form'], 'route': medicine.content['route'],
            'ingredients': medicine.content['ingredients'], 'standard_concept': medicine.content['standard_concept'],
            'purpose': next(use['purpose'] for use in medicine.content['uses'] if use['condition'] == condition),
            'screening_status': aggregate(checks), 'checks': checks, 'proposed_dose': dose,
            'sources': [source for source in medicine.content['sources'] if source['id'] in policy['source_ids']],
            'scope': policy['scope'], 'source_sections': policy['source_sections'], 'rule_version': policy['version'], 'medicine_content_hash': medicine.content_hash,
            'rule_content_hash': profile.content_hash})
    return {'engine_version': ENGINE_VERSION, 'mode': 'rules_only_unranked', 'status': 'draft',
            'approved': False, 'published': False, 'candidates': candidates,
            'normalization': medication_matches,
            'omitted_unreviewed': snapshot['omitted_unreviewed'],
            'limitations': 'Selected rules are screening support. This is not a complete safety clearance, a trained ML ranking or a prescription.'}


def validate_dose(policy, age, facts, dose, route, check):
    params = policy['parameters']
    if dose is None:
        check('dose', 'cannot_validate', 'No reviewed proposed regimen. Use an available rule suggestion or enter a clinician proposal.')
        return
    if dose['route'] != route:
        check('dose', 'blocked', 'Proposed route does not match this catalogue product.')
        return
    reference, reason = reference_regimen(policy, age, facts, route)
    if reference is None:
        check('dose', 'cannot_validate', reason)
        return
    kind = reference.get('schedule_type', 'scheduled')
    if dose.get('schedule_type', 'scheduled') != kind:
        check('dose', 'blocked', 'The proposed schedule does not match this product rule: fixed course and as-needed use are different regimens.')
        return
    if kind != 'scheduled':
        if regimen_matches(dose, reference):
            check('dose', 'passed', 'As-needed instructions and limits match the selected product rule; clinician review remains required.')
        else:
            check('dose', 'blocked', 'The as-needed amount, spacing, daily limits or instructions do not match the selected product rule.')
        return
    if dose['unit'] == 'mL':
        check('dose', 'cannot_validate', 'Volume cannot be converted to mass without a reviewed concentration/formulation.')
        return
    proposed = number(dose['amount']) * (1000 if dose['unit'] == 'g' else 1)
    if proposed != number(reference['amount']) or dose['doses_per_day'] != reference['doses_per_day'] or dose['duration_days'] != reference['duration_days']:
        check('dose', 'blocked', 'The doctor-proposed amount, frequency or duration does not match the applicable selected treatment rule.')
    else:
        check('dose', 'passed', 'Proposed mass, frequency and duration match this selected standard-context rule; clinical suitability is a separate decision.')


def reference_regimen(policy, age, facts, route):
    """One dose expression shared by validation and suggestions, never a clearance."""
    params = policy['parameters']
    if age is None or age < params['minimum_age_years']:
        return None, 'Age/formulation is outside this encoded product scope; specialized dose review is required.'
    if params.get('dose_policy') in ('oral_prn', 'topical_prn'):
        targets = set(facts.get('verified_symptoms', [])).intersection(params['relevant_symptoms'])
        if not facts.get('symptoms_reviewed'):
            return None, 'Review the symptom targets and their durations for this visit.'
        if not targets:
            return None, 'No clinician-verified target symptom requires this symptom-relief medicine.'
        durations = facts.get('symptom_durations', {})
        if any(durations.get(target) is None for target in targets):
            return None, 'A verified duration is required for each selected symptom-relief target.'
        if any(number(durations[target]) > params['symptom_review_days'][target] * 24 for target in targets):
            return None, 'A symptom exceeds the selected label review window; individualized reassessment is required.'
        if policy['kind'] == 'paracetamol':
            if facts['hepatic_assessment'] != 'standard' or facts['renal_assessment'] != 'standard':
                return None, 'Standard assessed hepatic/alcohol and renal context is required for this oral pilot regimen.'
            review_days = min(params['symptom_review_days'][target] for target in targets)
            return {'schedule_type': 'oral_prn', 'amount': str(params['dose_mg']), 'unit': 'mg', 'doses_per_day': None,
                    'duration_days': None, 'route': route, 'interval_hours': params['interval_hours'],
                    'max_doses_per_day': params['max_doses_per_day'], 'max_daily_amount_mg': params['max_daily_amount_mg'],
                    'review_after_days': review_days, 'instructions':
                    'For verified fever or aches, use only while symptoms need relief. Space doses by at least 6 hours; '
                    'limit to 3 doses (3000 mg) per 24 hours. Seek review for worsening fever or fever beyond 3 days, '
                    'or worsening pain or pain beyond 10 days. This is not a fixed treatment course.'}, None
        if facts.get('topical_assessment') != 'standard':
            return None, 'External-use/eye-area suitability is unknown or needs individualized review.'
        return {'schedule_type': 'topical_prn', 'amount': None, 'unit': None, 'doses_per_day': None, 'duration_days': None,
                'route': route, 'interval_hours': None, 'max_doses_per_day': None, 'max_daily_amount_mg': None,
                'review_after_days': 7, 'instructions':
                'Shake the container before use; apply to affected skin only when itching needs relief. Keep away from eyes. '
                'Get clinician advice for worsening symptoms, symptoms persisting beyond 7 days, or recurring symptoms. '
                'External use; no fixed amount, daily frequency or course is specified by this label.'}, None
    if facts['renal_assessment'] != 'standard':
        return None, 'This dose policy covers the doctor-verified standard renal context only.'
    weight = number(facts['weight_kg'])
    if policy['kind'] == 'oseltamivir':
        if age >= params['adult_band_age_years']:
            expected = number(params['adult_dose_mg'])
        elif weight is None:
            return None, 'Measured weight is required for this pediatric dose-band rule.'
        else:
            expected = next(number(band['dose_mg']) for band in params['weight_bands'] if band['max_kg'] is None or weight <= number(band['max_kg']))
    else:
        if age >= params['adult_policy_age_years']:
            expected = number(params['adult_dose_mg'])
        elif weight is None:
            return None, 'Measured weight is required for this pediatric mg/kg rule.'
        elif weight > number(params['adult_weight_threshold_kg']):
            expected = number(params['adult_dose_mg'])
        else:
            expected = weight * number(params['pediatric_mg_per_kg'])
    if expected != number(params['product_strength_mg']):
        return None, 'The applicable dose requires a different reviewed strength/formulation; this product cannot be cleared.'
    return {'amount': format(expected, 'f'), 'unit': 'mg', 'doses_per_day': params['doses_per_day'],
            'duration_days': params['duration_days'], 'route': route}, None


def suggest_regimens(medicines, profiles, snapshot, medication_matches):
    """Withhold autofill on missing/blocked checks or unresolved selected cautions."""
    reference_results = {entry.pk: reference_regimen(profiles[entry.pk].content, snapshot['patient']['age_years'],
                         snapshot['clinical'], entry.content['route']) for entry in medicines}
    references = {key: value[0] for key, value in reference_results.items()}
    screening = run_screening(medicines, profiles, snapshot, references, medication_matches)
    suggestions = []
    for candidate in screening['candidates']:
        reason = reference_results[candidate['medicine_id']][1]
        if reason:
            next(item for item in candidate['checks'] if item['category'] == 'dose')['message'] = reason
        obstacles = [item for item in candidate['checks'] if item['status'] in ('blocked', 'cannot_validate')
                     or (item['status'] == 'warning' and item['category'] not in ('coverage', 'topical_precaution'))]
        relevant = profiles[candidate['medicine_id']].content['parameters'].get('relevant_symptoms')
        not_needed = bool(relevant and snapshot['clinical'].get('symptoms_reviewed') and not set(snapshot['clinical'].get('verified_symptoms', [])).intersection(relevant))
        suggestions.append({'medicine_id': candidate['medicine_id'], 'generic_name': candidate['generic_name'],
            'status': 'not_needed' if not_needed else 'unavailable' if obstacles else 'suggested',
            'dose': None if obstacles else references[candidate['medicine_id']], 'reasons': obstacles,
            'review_required': True, 'sources': candidate['sources'], 'source_sections': candidate['source_sections'],
            'rule_version': candidate['rule_version'], 'rule_content_hash': candidate['rule_content_hash'],
            'medicine_content_hash': candidate['medicine_content_hash'],
            'message': 'Rule-based regimen suggestion; clinician review and full clinical suitability assessment remain required.' if not obstacles
                       else 'Automatic regimen unavailable for these inputs. Review the findings before proposing a regimen.'})
    return suggestions


def regimen_matches(dose, reference):
    if not dose or not reference or number(dose.get('amount')) != number(reference.get('amount')):
        return False
    defaults = {'schedule_type': 'scheduled', 'interval_hours': None, 'max_doses_per_day': None,
                'max_daily_amount_mg': None, 'review_after_days': None, 'instructions': ''}
    return all(dose.get(key, default) == reference.get(key, default) for key, default in defaults.items()) and all(
        dose.get(key) == reference.get(key) for key in ('unit', 'doses_per_day', 'duration_days', 'route'))
