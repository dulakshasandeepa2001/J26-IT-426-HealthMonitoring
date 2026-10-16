"""Assemble and validate pending knowledge without changing the live pilot bundle."""

from copy import deepcopy
from datetime import date
from pathlib import Path
import re
from urllib.parse import urlsplit

from prescription_research import dataset as ds

HERE = Path(__file__).resolve().parent
VERSION = 'six-condition-knowledge-2026-10-16-v1'
CONDITIONS = ('influenza', 'chickenpox', 'measles', 'mumps', 'viral_conjunctivitis', 'viral_gastroenteritis')
SYMPTOMS = ('fever', 'body_aches', 'itching', 'jaw_pain', 'ocular_dryness', 'ocular_irritation', 'diarrhoea', 'vomiting', 'recent_fluid_loss')
PARACETAMOL = 'paracetamol-500mg-tablet'
CMC = 'cmc-sodium-05pct-ophthalmic-solution'
ORS = 'ors-low-osmolarity-powder'
HANDLERS = {
    PARACETAMOL: 'paracetamol', 'oseltamivir-75mg-capsule': 'oseltamivir',
    'acyclovir-800mg-tablet': 'acyclovir', 'calamine-zinc-oxide-lotion': 'calamine',
    CMC: 'ophthalmic_lubricant', ORS: 'unresolved_ors',
}
SOURCE_HOSTS = {'dailymed.nlm.nih.gov', 'www.cdc.gov', 'www.fda.gov', 'www.nhs.uk', 'www.niddk.nih.gov', 'www.who.int'}
INPUT_PATHS = (
    'backend/medicine_knowledge/data/pilot_catalogue.json',
    'backend/prescription_drafts/data/safety_profiles.json',
    'backend/prescription_drafts/engine.py', 'backend/prescription_research/dataset.py',
    'backend/prescription_research/expansion/knowledge.py',
    'backend/prescription_research/expansion/changes.json',
    'backend/prescription_research/expansion/policies.json',
    'backend/prescription_research/expansion/catalogue.schema.json',
    'backend/prescription_research/expansion/case.schema.json',
    'backend/prescription_research/expansion/screening.py',
    'backend/prescription_research/expansion/check.py',
)


def load_knowledge():
    products = {entry['id']: deepcopy(entry) for entry in ds.read_json(ds.BACKEND / 'medicine_knowledge/data/pilot_catalogue.json')}
    changes = ds.read_json(HERE / 'changes.json')
    ds.require(set(changes) == {'version', 'clinical_review_status', 'paracetamol_additional_uses', 'paracetamol_additional_sources', 'new_product'}, 'Invalid changes envelope.')
    ds.require(changes['version'] == VERSION and changes['clinical_review_status'] == 'not_reviewed', 'Knowledge must remain versioned and not reviewed.')
    products[PARACETAMOL]['uses'].extend(changes['paracetamol_additional_uses'])
    products[PARACETAMOL]['sources'].extend(changes['paracetamol_additional_sources'])
    product = changes['new_product']
    ds.require(product['id'] == CMC and CMC not in products, 'Unexpected expansion product identity.')
    products[CMC] = deepcopy(product)
    for item in products.values():
        item.update(schema_version='2.0', catalogue_version=VERSION)
    policies = ds.read_json(HERE / 'policies.json')
    legacy = ds.read_json(ds.BACKEND / 'prescription_drafts/data/safety_profiles.json')
    validate_knowledge(products, policies)
    return products, policies, legacy


def validate_knowledge(products, policies):
    schema = ds.read_json(HERE / 'catalogue.schema.json')
    ds.check_schema(list(products.values()), schema)
    ds.require(set(products) == set(HANDLERS) - {ORS}, 'Expected five resolved catalogue products; no placeholder ORS.')
    originals = {item['id']: item for item in ds.read_json(ds.BACKEND / 'medicine_knowledge/data/pilot_catalogue.json')}
    for identity, product in products.items():
        ds.require(identity == product['id'] and product['catalogue_version'] == VERSION, 'Catalogue identity/version mismatch.')
        if identity in originals:
            for key in ('generic_name', 'form', 'route', 'strength', 'ingredients', 'standard_concept', 'aliases'):
                ds.require(product[key] == originals[identity][key], 'An existing product identity cannot be silently repurposed.')
            ds.require(all(source in product['sources'] for source in originals[identity]['sources']), 'Preserve original source metadata; a new import date is not a new review.')
        sources = {s['id']: s for s in product['sources']}
        ds.require(len(sources) == len(product['sources']), 'Duplicate source IDs.')
        for source in sources.values():
            parsed = urlsplit(source['url'])
            ds.require(parsed.scheme == 'https' and parsed.hostname in SOURCE_HOSTS and not parsed.username and not parsed.password and parsed.port in (None, 443), 'Untrusted primary-source URL.')
            for key in ('accessed_date', 'published_date'):
                if source[key] is not None:
                    ds.require(date.fromisoformat(source[key]).isoformat() == source[key], 'Use an exact ISO source date.')
        refs = [product['standard_concept']['source_id']] + [alias['source_id'] for alias in product['aliases']]
        for item in product['uses'] + product['warnings']:
            refs.extend(item['source_ids'])
        ds.require(set(refs) <= set(sources), 'Dangling evidence reference.')
        ds.require(re.fullmatch(r'[0-9]{1,20}', product['standard_concept']['rxcui']) is not None, 'A resolved SCD identifier is required; never invent one for ORS.')
        names = [' '.join(a['name'].casefold().split()) for a in product['aliases']]
        ds.require(len(set(names)) == len(names), 'Duplicate normalized aliases.')
        pairs = [(use['condition'], use['purpose']) for use in product['uses']]
        ds.require(len(set(pairs)) == len(pairs), 'Duplicate condition/purpose mappings.')
        purpose = 'antiviral' if HANDLERS[identity] in ('oseltamivir', 'acyclovir') else 'symptom_relief'
        ds.require(all(use['purpose'] == purpose for use in product['uses']), 'Product treatment purpose cannot become an interchangeable alternative.')
        ds.require((product['form'], product['route']) in {('tablet', 'oral'), ('capsule', 'oral'), ('lotion', 'topical'), ('ophthalmic_solution', 'ophthalmic')}, 'Unsupported formulation/route pairing.')
    cmc = products[CMC]
    ds.require((cmc['route'], cmc['form'], cmc['strength'], cmc['standard_concept']['rxcui']) == ('ophthalmic', 'ophthalmic_solution', '0.5% (5 mg/mL)', '1188426'), 'CMC identity must bind the documented source solution, not a kit or skin product.')
    ds.require(cmc['ingredients'] == [{'name': 'carboxymethylcellulose sodium', 'strength': '0.5% (5 mg/mL)'}], 'Unexpected CMC active ingredient.')
    ds.require(isinstance(policies, list) and len(policies) == 9, 'Expected nine purpose groups.')
    pairs = set()
    required = {'id', 'version', 'condition', 'candidate_id', 'purpose', 'clinical_role', 'handler', 'target_symptoms', 'source_ids', 'scope', 'clinical_review_status', 'concern_fields'}
    for policy in policies:
        ds.require(isinstance(policy, dict) and set(policy) == required, 'Invalid policy fields; actors/approvals/threshold overrides are forbidden.')
        candidate = policy['candidate_id']
        ds.require(policy['condition'] in CONDITIONS and candidate in HANDLERS and policy['handler'] == HANDLERS[candidate], 'Unknown condition/handler identity; there is no fallback handler.')
        ds.require(policy['version'] == VERSION and policy['clinical_review_status'] == 'not_reviewed', 'Policy provenance/status mismatch.')
        ds.require(isinstance(policy['id'], str) and re.fullmatch(r'[a-z0-9-]+', policy['id']) and isinstance(policy['scope'], str) and policy['scope'], 'Invalid policy identity/scope.')
        ds.require(isinstance(policy['target_symptoms'], list) and len(set(policy['target_symptoms'])) == len(policy['target_symptoms']) and set(policy['target_symptoms']) <= set(SYMPTOMS), 'Invalid symptom targets.')
        ds.require(isinstance(policy['concern_fields'], list) and len(set(policy['concern_fields'])) == len(policy['concern_fields']) and set(policy['concern_fields']) <= set(CONCERN_FIELDS), 'Invalid selected assessment concepts.')
        ds.require(policy['source_ids'] and len(set(policy['source_ids'])) == len(policy['source_ids']), 'Missing/duplicate rule sources.')
        key = (policy['condition'], policy['purpose'], policy['clinical_role'])
        ds.require(key not in pairs, 'Duplicate purpose group.')
        pairs.add(key)
        if candidate == ORS:
            ds.require(policy['condition'] == 'viral_gastroenteritis' and policy['purpose'] == 'rehydration_support', 'ORS scope mismatch.')
            ds.require(set(policy['source_ids']) <= {'niddk-gastroenteritis', 'who-ors'}, 'Unknown unresolved-ORS guidance reference.')
        else:
            item = products[candidate]
            ds.require(set(policy['source_ids']) <= {s['id'] for s in item['sources']}, 'Rule evidence is not bound to the product.')
            ds.require(any(u['condition'] == policy['condition'] and u['purpose'] == policy['purpose'] for u in item['uses']), 'Rule/use purpose mismatch.')
    ds.require(len({p['id'] for p in policies}) == 9, 'Duplicate policy IDs.')
    resolved_pairs = {(p['candidate_id'], p['condition'], p['purpose']) for p in policies if p['candidate_id'] != ORS}
    ds.require(resolved_pairs == {(key, use['condition'], use['purpose']) for key, product in products.items() for use in product['uses']}, 'Catalogue and policy coverage differ.')


CONCERN_FIELDS = ('respiratory_concern', 'neurological_concern', 'hydration_concern', 'intake_difficulty',
    'abdominal_pain', 'testicular_pain_or_swelling', 'eye_pain', 'photophobia', 'vision_change',
    'marked_or_worsening_redness', 'contact_lens_use', 'suspected_herpetic_eye_disease',
    'blood_in_stool', 'severe_abdominal_pain', 'fluid_restriction', 'immunocompromised', 'pregnant_or_breastfeeding')
