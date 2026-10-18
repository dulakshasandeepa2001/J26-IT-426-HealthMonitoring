"""Versioned source-backed additions. Reference-only options never get fallback doses."""
from copy import deepcopy
from prescription_research import dataset as ds
from .models import content_digest
from prescription_context.history_identity import review_policy

VERSION = 'six-condition-backend-2026-10-16-v1'
SOURCES = {
    'cdc-flu-2026': ('CDC', 'Influenza antiviral medications: summary for clinicians', 'https://www.cdc.gov/flu/hcp/antivirals/summary-clinicians.html', '2026-03-10'),
    'who-flu-2024': ('WHO', 'Clinical practice guidelines for influenza', 'https://www.ncbi.nlm.nih.gov/sites/books/NBK607909/', '2024-09-12'),
    'cdc-varicella': ('CDC', 'Clinical guidance for people at risk for severe varicella', 'https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html', '2024-04-24'),
    'valacyclovir-label': ('DailyMed', 'Valacyclovir product label: pediatric chickenpox indication and limitations', 'https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=26a43531-c62a-9e7f-e063-6394a90a8d3f', None),
    'cdc-measles': ('CDC', 'Clinical overview of measles', 'https://www.cdc.gov/measles/hcp/clinical-overview/', None),
    'nhs-mumps': ('NHS', 'Mumps: symptom relief', 'https://www.nhs.uk/conditions/mumps/', None),
    'ibuprofen-label': ('DailyMed', 'Ibuprofen 200 mg coated tablet: NDC 63941-301', 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=36b95840-f621-437a-bf49-406d320964da', '2025-12-12'),
    'cdc-eye': ('CDC', 'How to treat pink eye', 'https://www.cdc.gov/conjunctivitis/treatment/index.html', '2024-04-15'),
    'hypromellose-label': ('DailyMed', 'HylaTears hypromellose 0.3%: NDC 72094-001-03', 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2b5fc4c4-843c-8d3d-e063-6394a90a5a1b', '2025-01-23'),
    'niddk-gi': ('NIDDK', 'Treatment of viral gastroenteritis', 'https://www.niddk.nih.gov/health-information/digestive-diseases/viral-gastroenteritis/treatment', None),
    'who-child-diarrhoea': ('WHO', 'Management of pneumonia and diarrhoea in children up to 10 years', 'https://www.who.int/publications/i/item/9789240103412', '2024-12-31'),
}


def source(identity):
    publisher, title, url, published = SOURCES[identity]
    return {'id': identity, 'publisher': publisher, 'title': title, 'url': url, 'published_date': published,
            'accessed_date': '2026-10-16', 'sections': ['Indications, scope, restrictions and treatment guidance']}


def clinical_bindings():
    return {name: ds.file_hash(ds.ROOT / ('backend/medicine_knowledge/' + name)) for name in (
        'additional_candidates.py', 'condition_knowledge.py', 'screening_contract.py', 'screening_engine.py', 'patient_screening.py',
        '../prescription_context/history_identity.py')}


def additional_definitions():
    rows = [
        ('flu-zanamivir', 'zanamivir-reference', 'Zanamivir', 'influenza', 'antiviral', 'influenza_antiviral', ['cdc-flu-2026', 'who-flu-2024'], 'Inhaled route; respiratory disease/milk-protein allergy, age and guideline selection require a separate product-specific pathway.'),
        ('flu-peramivir', 'peramivir-reference', 'Peramivir', 'influenza', 'antiviral', 'influenza_antiviral', ['cdc-flu-2026', 'who-flu-2024'], 'Intravenous administration and renal dosing require a separate monitored-care pathway; no outpatient fallback dose.'),
        ('flu-baloxavir', 'baloxavir-reference', 'Baloxavir marboxil', 'influenza', 'antiviral', 'influenza_antiviral', ['cdc-flu-2026', 'who-flu-2024'], 'Guideline/risk, age/weight, pregnancy and interaction scope need an exact reviewed product policy.'),
        ('varicella-valacyclovir', 'valacyclovir-reference', 'Valacyclovir', 'chickenpox', 'antiviral', 'varicella_antiviral', ['cdc-varicella', 'valacyclovir-label'], 'The referenced US chickenpox label is pediatric age 2 to under 18; adult guidance is not silently treated as the same labelled indication.'),
        ('measles-vitamin-a', 'vitamin-a-reference', 'Vitamin A', 'measles', 'supportive_management', 'supervised_vitamin_a', ['cdc-measles'], 'Clinician-supervised pediatric supportive management; not a fever-relief alternative or a blanket adult rule.'),
        ('mumps-ibuprofen', 'ibuprofen-200mg-tablet', 'Ibuprofen', 'mumps', 'symptom_relief', 'fever_or_pain_relief', ['nhs-mumps', 'ibuprofen-label'], 'Adult research scope, selected fever/pain relief, standard renal/GI/NSAID/cardiovascular context and full product/excipient assessment.'),
        ('conjunctivitis-hypromellose', 'hypromellose-03pct-eye-drops', 'Hypromellose', 'viral_conjunctivitis', 'symptom_relief', 'ocular_dryness_or_irritation_relief', ['cdc-eye', 'hypromellose-label'], 'Dryness/irritation lubrication mapping only; not a viral-label indication. Exact NDC reference; no RxNorm identifier is invented.'),
        ('gi-loperamide', 'loperamide-reference', 'Loperamide', 'viral_gastroenteritis', 'symptom_relief', 'diarrhoea_relief', ['niddk-gi'], 'Selected adult diarrhoea symptom relief only; fever/blood in stool and unresolved etiology prevent automatic selection.'),
        ('gi-bismuth', 'bismuth-subsalicylate-reference', 'Bismuth subsalicylate', 'viral_gastroenteritis', 'symptom_relief', 'diarrhoea_relief', ['niddk-gi'], 'Selected adult symptom relief only; exact salicylate product, contraindications and interaction rules remain unencoded.'),
        ('gi-zinc', 'zinc-reference', 'Zinc', 'viral_gastroenteritis', 'supportive_management', 'pediatric_zinc_supplementation', ['who-child-diarrhoea'], 'Separate pediatric diarrhoea pathway and current guideline version required; never infer an adult indication or dose.'),
    ]
    output = []
    for identity, medicine, name, condition, purpose, role, refs, scope in rows:
        resolved = medicine in ('ibuprofen-200mg-tablet', 'hypromellose-03pct-eye-drops')
        handler = 'ibuprofen' if medicine == 'ibuprofen-200mg-tablet' else 'hypromellose' if resolved else 'catalogue_only'
        targets = ['fever', 'body_aches', 'jaw_pain'] if handler == 'ibuprofen' else ['ocular_dryness', 'ocular_irritation'] if handler == 'hypromellose' else []
        sources = [source(key) for key in refs]
        product = None
        if resolved:
            ingredient = 'ibuprofen' if handler == 'ibuprofen' else 'hypromellose'
            label = refs[-1]
            product = {'schema_version': '3.0', 'catalogue_version': VERSION, 'id': medicine, 'generic_name': name,
                'strength': '200 mg' if handler == 'ibuprofen' else '0.3%', 'form': 'tablet' if handler == 'ibuprofen' else 'ophthalmic_solution',
                'route': 'oral' if handler == 'ibuprofen' else 'ophthalmic',
                'ingredients': [{'name': ingredient, 'strength': '200 mg' if handler == 'ibuprofen' else '0.3%'}],
                'aliases': [{'name': name, 'level': 'ingredient', 'source_id': label},
                    {'name': 'ibuprofen 200 mg tablet' if handler == 'ibuprofen' else 'hypromellose 0.3% eye drops', 'level': 'product', 'source_id': label}],
                'standard_concept': {'rxcui': '310965', 'name': 'ibuprofen 200 MG Oral Tablet', 'term_type': 'SCD', 'source_id': label} if handler == 'ibuprofen' else None,
                'reference_product_identifier': 'NDC 63941-301' if handler == 'ibuprofen' else 'NDC 72094-001-03',
                'uses': [{'condition': condition, 'purpose': purpose, 'basis': 'symptom_mapping', 'summary': scope, 'scope': scope, 'source_ids': refs}],
                'warnings': [{'category': 'precaution', 'summary': scope, 'source_ids': refs}], 'sources': sources}
        content = {'condition': condition, 'product': product, 'display_name': name,
            'identity_status': 'source_reference_product' if resolved else 'reference_incomplete',
            'purpose': purpose, 'knowledge_version': VERSION, 'sources': sources,
            'unresolved_product': {'id': medicine, 'gap': scope + ' Exact product and executable dose policy remain incomplete.',
                'source_ids': refs, 'source_urls': [s['url'] for s in sources], 'rxcui': None, 'strength': None, 'regimen': None} if not resolved else None}
        policy = {'id': identity, 'version': VERSION, 'condition': condition, 'candidate_id': medicine, 'purpose': purpose,
            'clinical_role': role, 'handler': handler, 'target_symptoms': targets, 'source_ids': refs,
            'scope': scope, 'concern_fields': ['intake_difficulty', 'abdominal_pain', 'testicular_pain_or_swelling'] if handler == 'ibuprofen' else
                ['eye_pain', 'photophobia', 'vision_change', 'marked_or_worsening_redness', 'contact_lens_use', 'suspected_herpetic_eye_disease'] if handler == 'hypromellose' else []}
        rules = {'policy': policy, 'reference_profile': None, 'implementation_bindings': {}, 'history_identity_policy': review_policy(),
            'clinical_implementation_bindings': clinical_bindings(), 'implementation_source': (ds.BACKEND / 'medicine_knowledge/screening_engine.py').read_text(encoding='utf-8'),
            'patient_screening_supported': resolved, 'scope': scope, 'live_screening_enabled': False, 'prescription_eligible': False}
        if resolved:
            rules['reference_profile'] = {'version': VERSION, 'kind': handler, 'scope': scope,
                'parameters': {'minimum_research_age_years': 18, 'dose_mg': 200, 'interval_hours_range': [4, 6],
                    'maximum_daily_amount_mg': 1200, 'automatic_escalation': False, 'symptom_review_hours': {'fever': 72, 'body_aches': 240, 'jaw_pain': 240}}
                    if handler == 'ibuprofen' else {'minimum_research_age_years': 18, 'amount_range': [1, 2],
                    'unit': 'drop', 'frequency': 'as_needed', 'fixed_duration_days': None, 'reassessment_limit_hours': 72,
                    'rxnorm_status': 'out_of_scope_in_reference_label', 'reference_ndc': '72094-001-03'}}
        output.append({'id': identity, 'medicine_id': medicine, 'condition': condition, 'content': content, 'rules': rules,
            'content_hash': content_digest(content), 'rules_hash': content_digest(rules)})
    return output
