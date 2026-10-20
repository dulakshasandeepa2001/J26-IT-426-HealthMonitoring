"""Read-only explanations of the exact inputs and reviews used by screening.

These diagnostics never create a review, resolve history or change a finding.
"""
from copy import deepcopy
from .models import content_digest


def review_trace(row, *, safety=False):
    from prescription_drafts.profiles import engine_digest
    reasons = []
    if row.review_status != 'reviewed':
        reasons.append('No accepted review is recorded (stored decision: ' + row.review_status + ').')
    if not row.reviewed_at or not row.reviewed_by_id:
        reasons.append('Review author or timestamp is missing.')
    elif not (row.reviewed_by.is_active and row.reviewed_by.is_approved and row.reviewed_by.role == 'doctor'):
        reasons.append('The reviewer is not an active approved doctor.')
    if row.content_hash != content_digest(row.content):
        reasons.append('Stored content hash does not match the actual content.')
    if row.reviewed_content_hash != row.content_hash:
        reasons.append('The review is bound to a different content hash.')
    result = {'stored_status': row.review_status, 'effective_status': row.effective_review_status,
        'is_current': row.review_is_current, 'reasons': reasons,
        'version': row.content.get('version' if safety else 'catalogue_version'),
        'content_hash': row.content_hash, 'reviewed_content_hash': row.reviewed_content_hash,
        'reviewed_at': row.reviewed_at.isoformat() if row.reviewed_at else None}
    if safety:
        result.update(reviewed_engine_hash=row.reviewed_engine_hash, current_engine_hash=engine_digest(),
            medicine_content_hash=row.medicine_content_hash, current_medicine_content_hash=row.medicine.content_hash)
        if row.reviewed_engine_hash != result['current_engine_hash']:
            reasons.append('The executable engine changed since this review; the stored acceptance is stale.')
        if row.medicine_content_hash != row.medicine.content_hash or row.medicine.content_hash != content_digest(row.medicine.content):
            reasons.append('The bound medicine content changed or its content hash is invalid.')
    return result


def missing_review():
    return {'stored_status': None, 'effective_status': 'pending', 'is_current': False,
        'reasons': ['No executable safety profile is installed.']}


def scope_trace(row):
    result = {'scope_id': row.pk, 'content_hash': row.content_hash, 'rules_hash': row.rules_hash,
        'version': row.rules.get('policy', {}).get('version')}
    for kind in ('content', 'safety'):
        state = row.review_state(kind)
        result[kind] = {key: state[key] for key in ('status', 'is_current', 'reason', 'reviewed_at')}
    return result


def explain_findings(checks, snapshot, candidate, matches):
    """Attach evidence already authorized for this consultation, without inference."""
    facts, context = snapshot['clinical'], snapshot['context']
    for check in checks:
        category = check['category']
        values = {}
        rule = 'medicine_knowledge.screening_engine.screen_candidate'
        if category in ('knowledge_review', 'base_product_review', 'implementation_binding'):
            rule = 'medicine_knowledge.patient_screening.candidate_definitions'
            values = {'candidate.review_trace': candidate['review_trace']}
        elif category in ('clinical_scope', 'red_flags'):
            values = {**{'clinical.' + key: facts[key] for key in ('care_setting', 'condition_severity', 'red_flags')},
                'source.severity': snapshot['source_observations']['severity'], 'source.red_flags': snapshot['source_observations']['red_flags']}
        elif category in ('age', 'age_scope'):
            values = {'registered_patient.age_years': snapshot['patient']['age_years']}
        elif category == 'special_population':
            values = {'clinical.special_population': facts['special_population']}
        elif category.startswith('condition_scope:'):
            name = category.split(':', 1)[1]
            values = {'clinical.condition_assessments.' + name: facts['condition_assessments'][name],
                'source.assessments.' + name: snapshot['source_observations']['assessments'].get(name)}
        elif category == 'allergy':
            values = {'context.allergy_status': context['allergy_status'], 'context.allergies': context['allergies'],
                'context.history_identity': context.get('provenance', {}).get('history_identity')}
        elif category in ('duplicate_ingredient', 'interaction'):
            rule = 'prescription_drafts.engine.run_screening / prescription_context.history_identity.resolve_medicines'
            values = {'context.medicine_status': context['medicine_status'], 'normalized_current_medicines': matches}
        elif category in ('guideline', 'guideline_coverage'):
            values = {'clinical.influenza_guideline': facts['influenza_guideline'],
                'clinical.condition_severity': facts['condition_severity'], 'clinical.care_setting': facts['care_setting'],
                'source.severity': snapshot['source_observations']['severity']}
        elif category in ('onset', 'renal', 'hepatic', 'vaccine_interaction', 'indication_scope', 'topical_scope'):
            rule = 'prescription_drafts.engine.run_screening'
            name = {'onset': 'onset_hours', 'renal': 'renal_assessment', 'hepatic': 'hepatic_assessment',
                'vaccine_interaction': 'laiv_timing', 'indication_scope': 'varicella_risk', 'topical_scope': 'topical_assessment'}[category]
            values = {'clinical.' + name: facts[name]}
        elif category in ('dose', 'symptom_relevance', 'symptom_duration'):
            rule = 'prescription_drafts.engine.reference_regimen / validate_dose'
            values = {**{'clinical.' + name: facts.get(name) for name in ('verified_symptoms', 'symptoms_reviewed', 'symptom_durations', 'weight_kg', 'renal_assessment', 'hepatic_assessment')},
                'registered_patient.age_years': snapshot['patient']['age_years'], 'regimen_mode': 'server_rule_reference; no manual proposal gate'}
        elif category in ('product_rule_coverage', 'product_identity', 'handler'):
            values = {'candidate.handler': candidate['policy']['handler'], 'candidate.product_present': candidate['product'] is not None}
        elif category in facts:
            values = {'clinical.' + category: facts[category]}
        elif category == 'excipients':
            values = {'clinical.excipient_assessment': facts['excipient_assessment']}
        elif category == 'hydration':
            values = {name: facts[name] for name in ('dehydration_assessment', 'oral_fluid_tolerance')}
        check['trace'] = {'backend_rule': rule, 'inputs': deepcopy(values)}
