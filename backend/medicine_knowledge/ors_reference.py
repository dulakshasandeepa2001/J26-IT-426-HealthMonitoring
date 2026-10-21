"""A separate exact reference scope; never resolves the generic ORS placeholder."""
import hashlib
import json
from pathlib import Path
from .models import content_digest

ROOT = Path(__file__).resolve().parent


def policy():
    return json.loads((ROOT / 'data/ors_reference.json').read_text(encoding='utf-8'))


def implementation_binding():
    names = ('ors_reference.py', 'ors_screening.py', 'ors_contracts.py', 'complete_screening.py', 'reference_reviews.py', 'data/ors_reference.json')
    return {'version': policy()['version'], 'hash': hashlib.sha256(b''.join((ROOT / name).read_bytes() for name in names)).hexdigest()}


def definition():
    from .additional_candidates import clinical_bindings
    p = policy()
    source = p['source']
    identity = p['medicine_id']
    product = {'schema_version': '3.0', 'catalogue_version': p['version'], 'id': identity,
        'generic_name': 'Dioralyte Natural (exact UK reference)',
        'strength': 'Glucose 3.56 g / sodium chloride 0.47 g / potassium chloride 0.30 g / disodium hydrogen citrate 0.53 g per sachet',
        'form': 'powder_for_oral_solution', 'route': 'oral', 'ingredients': p['ingredients'], 'excipients': p['excipients'],
        'aliases': [{'name': 'Dioralyte Natural GSL sachet UK PL 35104/0044', 'level': 'product', 'source_id': source['id']}],
        'standard_concept': None, 'reference_product_identifier': p['reference_product_identifier'],
        'uses': [{'condition': 'viral_gastroenteritis', 'purpose': 'rehydration', 'basis': 'symptom_mapping',
            'summary': 'Replacement of diarrhoea-associated fluid/electrolyte loss in the limited reference scope.',
            'scope': p['scope'], 'source_ids': [source['id']]}],
        'warnings': [{'category': 'precaution', 'summary': p['scope'], 'source_ids': [source['id']]}], 'sources': [source]}
    content = {'condition': 'viral_gastroenteritis', 'product': product, 'identity_status': 'source_reference_product',
        'purpose': 'rehydration', 'knowledge_version': p['version'], 'clinical_review_status': 'not_reviewed'}
    rules = {'policy': {'id': p['scope_id'], 'version': p['version'], 'condition': 'viral_gastroenteritis',
        'candidate_id': identity, 'purpose': 'rehydration', 'clinical_role': 'fluid_and_electrolyte_replacement',
        'handler': 'exact_reference_ors', 'target_symptoms': ['diarrhoea'],
        'concern_fields': ['blood_in_stool', 'severe_abdominal_pain', 'fluid_restriction'], 'scope': p['scope'],
        'source_ids': [source['id']]}, 'reference_profile': {'regimen': p['regimen']},
        'clinical_implementation_bindings': clinical_bindings(), 'ors_implementation': implementation_binding(),
        'implementation_source': (ROOT / 'ors_screening.py').read_text(encoding='utf-8')
            + '\n# Request contract\n' + (ROOT / 'ors_contracts.py').read_text(encoding='utf-8'),
        'research_gate_parameters': {'minimum_age_years': 18, 'maximum_diarrhoea_hours': 24,
            'dehydration': ['none', 'mild'], 'oral_fluids': 'tolerated', 'synthetic_only': True,
            'current_medicine_combinations': 'not_covered', 'local_product_equivalence': 'not_assumed'},
        'patient_screening_supported': True, 'live_screening_enabled': False, 'prescription_eligible': False,
        'clinical_review_status': 'not_reviewed', 'scope': p['scope']}
    return {'id': p['scope_id'], 'medicine_id': identity, 'condition': 'viral_gastroenteritis',
        'content': content, 'rules': rules, 'content_hash': content_digest(content), 'rules_hash': content_digest(rules)}
