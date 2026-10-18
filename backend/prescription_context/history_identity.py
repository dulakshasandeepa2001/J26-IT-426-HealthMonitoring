"""Explicit patient-history identities; no fuzzy matching or safety override.

Raw history is retained. A doctor's recorded resolution is separate from the
catalogue's product identity and from candidate-specific safety decisions.
"""
import re
from copy import deepcopy
from rest_framework.exceptions import ValidationError

VERSION = 'doctor-history-identities-2026-10-17-v1'
SOURCES = [
    {'title': 'NICE CG183: documenting drug allergy', 'url': 'https://www.nice.org.uk/guidance/cg183/chapter/recommendations'},
    {'title': 'CDC: clinical features of penicillin allergy', 'url': 'https://www.cdc.gov/antibiotic-use/hcp/clinical-signs/'},
]


def review_policy():
    return {'version': VERSION, 'scope': 'Doctor-confirmed recorded identities only. Raw allergy/medicine text is retained. Penicillin is a supported recorded identity, not delabelling. Only selected ingredient/cross-hypersensitivity checks are performed; excipients, comprehensive cross-reactivity and interaction clearance remain outside scope. Duplicate current ingredients remain blocked.',
            'sources': SOURCES, 'allergen_identities': allergy_options()}


def key(value):
    return ' '.join(value.casefold().split())


def allergy_options():
    from prescription_drafts.profiles import bundled_profiles
    names = {name for rule in bundled_profiles().values() for name in rule['allergy_names']}
    # Penicillin is an identity only, not allergy delabelling or a claim that
    # unrelated products are safe. Additional handlers retain their own cautions.
    return sorted(names | {'penicillin', 'ibuprofen', 'aspirin', 'nsaid', 'nsaids',
                           'hypromellose', 'carboxymethylcellulose', 'carboxymethylcellulose sodium'})


def allergy_parts(text):
    value = key(text)
    match = re.fullmatch(r'([^()]+)\s*\(([^()]+)\)', value)
    identity, reaction = (match[1].strip(), match[2].strip()) if match else (value, '')
    return (identity if identity in allergy_options() else '', reaction)


def products():
    from medicine_knowledge.models import MedicineEntry, ConditionKnowledge
    result = {row.pk: deepcopy(row.content) for row in MedicineEntry.objects.all()}
    for scope in ConditionKnowledge.objects.all():
        if scope.content.get('product'):
            result.setdefault(scope.medicine_id, deepcopy(scope.content['product']))
    return result


def product_hash(product):
    from medicine_knowledge.models import content_digest
    return content_digest({name: product.get(name) for name in
        ('id', 'generic_name', 'strength', 'form', 'route', 'ingredients', 'aliases', 'standard_concept', 'reference_product_identifier')})


def options():
    return {'version': VERSION, 'allergens': allergy_options(), 'sources': SOURCES,
        'products': [{'id': identity, 'name': value['generic_name'], 'strength': value['strength'],
                      'form': value['form'], 'route': value['route'], 'identity_hash': product_hash(value),
                      'aliases': [alias['name'] for alias in value['aliases'] if alias['level'] == 'product']}
                     for identity, value in sorted(products().items())],
        'instructions': 'Identity only. Preserve reported text and unknowns. Confirm selections with the patient; matching does not establish safety or remove an allergy.'}


def validate_details(details, data):
    """Strict positional bindings to submitted raw text, with server-derived hashes."""
    catalogue = products()
    for group, raw_field in (('allergies', 'allergies'), ('medicines', 'current_medicines')):
        rows, raw = details[group], data[raw_field]
        if len(rows) != len(raw) or any(row['recorded_text'] != text for row, text in zip(rows, raw)):
            raise ValidationError({'history_details': 'Every identity row must match the recorded history in order. Refresh and resolve the current text.'})
        for row in rows:
            if group == 'allergies':
                if row['identity'] and row['identity'] not in allergy_options():
                    raise ValidationError({'history_details': 'Unsupported allergen identity; retain it as unresolved.'})
                existing, _ = allergy_parts(row['recorded_text'])
                if existing and row['identity'] and existing != row['identity']:
                    raise ValidationError({'history_details': 'The selected allergen contradicts a recognized recorded identity. Correct the recorded history explicitly first.'})
                exact = bool(existing and existing == row['identity'])
                selected = bool(row['identity'])
            else:
                product = catalogue.get(row['catalogue_id'])
                if row['catalogue_id'] and (not product or row['expected_identity_hash'] != product_hash(product)):
                    raise ValidationError({'history_details': 'Selected medicine identity changed or is unsupported. Reload the identity choices and verify the product.'})
                matching = {identity for identity, value in catalogue.items() if any(key(alias['name']) == key(row['recorded_text']) for alias in value['aliases'])}
                if matching and row['catalogue_id'] and row['catalogue_id'] not in matching:
                    raise ValidationError({'history_details': 'The selected product contradicts the recorded medicine name. Correct the recorded history explicitly first.'})
                exact = bool(product and any(alias['level'] == 'product' and key(alias['name']) == key(row['recorded_text']) for alias in product['aliases']))
                selected = bool(row['catalogue_id'])
            if selected and not exact and len(row['clarification_note'].strip()) < 10:
                raise ValidationError({'history_details': 'Record at least 10 characters explaining how you clarified an unrecognized identity with the patient.'})
    return details


def bound_details(context):
    value = context.get('provenance', {}).get('history_identity', {})
    if value.get('version') != VERSION or not value.get('reviewed_by') or not value.get('reviewed_at'):
        return None
    details = value.get('details', {})
    for group, raw in (('allergies', context['allergies']), ('medicines', context['current_medicines'])):
        rows = details.get(group, [])
        if len(rows) != len(raw) or any(row.get('recorded_text') != text for row, text in zip(rows, raw)):
            return None
    return details


def resolved_allergies(context):
    details = bound_details(context)
    if details is None:
        return None  # Keep legacy behavior until explicitly resolved by a doctor.
    return [row['identity'] if row['identity'] in allergy_options() else None for row in details['allergies']]


def resolve_medicines(context, catalogue, fallback):
    details = bound_details(context)
    if details is None:
        return fallback
    result = []
    for row, old in zip(details['medicines'], fallback):
        identity = row['catalogue_id']
        if not identity:
            result.append({'input': row['recorded_text'], 'status': 'unrecognized', 'matches': []})
            continue
        product = catalogue.get(identity)
        if not product or product_hash(product) != row['expected_identity_hash']:
            result.append({'input': row['recorded_text'], 'status': 'unrecognized', 'matches': []})
            continue
        result.append({'input': row['recorded_text'], 'status': 'recognized', 'resolution_method': 'doctor_confirmed',
            'matches': [{'entry_id': identity, 'ingredients': [item['name'] for item in product['ingredients']],
                         'match_level': 'product', 'standard_concept': product.get('standard_concept')}]})
    return result
