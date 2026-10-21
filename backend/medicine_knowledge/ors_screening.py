"""Prospective deterministic exact-ORS scope; frozen research rules unchanged."""
from copy import deepcopy
from decimal import Decimal
from .models import ConditionKnowledge
from .ors_reference import policy, definition, implementation_binding
from .screening_engine import common_checks, identity_checks, normalize_history, finding, aggregate


def apply_reference_ors(snapshot, result):
    if snapshot['diagnosis']['condition'] != 'viral_gastroenteritis':
        return
    p = policy()
    snapshot['ors_implementation'] = implementation_binding()
    row = next((row for row in result['candidates'] if row['scope_id'] == p['scope_id']), None)
    if row is None:
        return  # The pending exact product must first be explicitly imported.
    stored = ConditionKnowledge.objects.prefetch_related('reviews__reviewer').get(pk=p['scope_id'])
    expected = definition()
    product = expected['content']['product']
    facts = snapshot['clinical']
    checks = common_checks(snapshot, expected['rules']['policy'], True)
    def check(category, status, message):
        checks.append(finding(category, status, message, [p['source']['id']]))
    if snapshot.get('is_demo') is not True:
        check('research_scope', 'cannot_validate', 'This exact ORS extension is limited to synthetic adult research consultations.')
    if any(getattr(stored, key) != expected[key] for key in ('content', 'rules', 'content_hash', 'rules_hash')):
        check('implementation_binding', 'cannot_validate', 'The imported exact ORS product/rule version differs from the shipped reference. Refresh that scope before review.')
    if not all(stored.review_state(kind)['is_current'] for kind in ('content', 'safety')):
        check('knowledge_review', 'cannot_validate', 'The exact ORS content and executable rules need current genuine doctor reviews.')
    vocabulary = {item['name'] for item in product['ingredients']} | set(p['excipients'])
    matches = normalize_history(snapshot['context']['current_medicines'], {p['medicine_id']: product}, snapshot['context'])
    checks.extend(identity_checks(snapshot, product, matches, vocabulary, vocabulary))
    for name, required in (('renal_assessment', 'standard'), ('hepatic_assessment', 'standard'),
        ('ors_product_assessment', 'exact_reference_confirmed'), ('ors_metabolic_assessment', 'standard'),
        ('ors_dietary_assessment', 'no_restrictions'), ('ors_obstruction_assessment', 'none')):
        if facts.get(name, 'unknown') != required:
            check(name, 'blocked' if name == 'ors_obstruction_assessment' and facts.get(name) == 'suspected' else 'cannot_validate',
                'An independent exact-product, renal/hepatic, diabetes/metabolic, salt-diet or obstruction assessment is missing or outside the encoded standard context.')
    duration = facts.get('symptom_durations', {}).get('diarrhoea')
    if not facts.get('symptoms_reviewed') or 'diarrhoea' not in facts.get('verified_symptoms', []) or duration is None or Decimal(str(duration)) > 24:
        check('symptom_scope', 'cannot_validate', 'Confirm acute diarrhoea and its duration. This prototype covers up to 24 hours only; that is a research scope, not a universal product restriction.')
    if facts.get('dehydration_assessment') not in ('none', 'mild') or facts.get('oral_fluid_tolerance') != 'tolerated':
        check('hydration', 'blocked' if facts.get('dehydration_assessment') in ('moderate', 'severe') or facts.get('oral_fluid_tolerance') == 'not_tolerated' else 'cannot_validate',
            'Only independently assessed no/mild dehydration with tolerated oral fluids is covered; no fluid-deficit or intravenous plan is generated.')
    check('coverage', 'warning', 'Exact UK reference scope only; generic ORS and local substitutes are not equivalent by assumption. This is not comprehensive safety clearance or clinical validation.')
    for item in checks:
        item['blocks_availability'] = item['status'] in ('blocked', 'cannot_validate')
        item['trace'] = {'backend_rule': 'medicine_knowledge.ors_screening.apply_reference_ors',
            'inputs': {'clinical': deepcopy(facts), 'context': deepcopy(snapshot['context']), 'registered_age_years': snapshot['patient']['age_years'],
                'product_identifier': p['reference_product_identifier'], 'implementation': implementation_binding()}}
    blocked = any(item['blocks_availability'] for item in checks)
    # Always retain the actual imported identity/hash for immutable audit. A
    # changed import stays unavailable; never silently substitute expected data.
    row.update(checks=checks, screening_status=aggregate(checks),
        status='unavailable' if blocked else 'candidate_for_clinician_review',
        regimen=None if blocked else deepcopy(p['regimen']))
