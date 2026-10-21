"""Versioned RF adapter for explicitly enabled synthetic consultation drafts.

Unlike the frozen-fixture CLI, this adapter accepts current *synthetic* screening
snapshots. No live encounter, fitting, research writes or safety override.
"""
from copy import deepcopy
from functools import lru_cache
import hashlib

from prescription_drafts.engine import aggregate
from prescription_research.random_forest_200 import data as toy_data, experiment as toy
from prescription_research.rule_forest import dataset as rules_data, experiment as rules

VERSION = 'synthetic-screening-rf-adapter-2026-10-20-v2'
GENERIC = {'paracetamol-500mg-tablet': 'paracetamol', 'oseltamivir-75mg-capsule': 'oseltamivir',
    'acyclovir-800mg-tablet': 'acyclovir', 'calamine-zinc-oxide-lotion': 'calamine_zinc_oxide',
    'cmc-sodium-05pct-ophthalmic-solution': 'carboxymethylcellulose_sodium',
    'hypromellose-03pct-eye-drops': 'hypromellose', 'ibuprofen-200mg-tablet': 'ibuprofen',
    'ors-low-osmolarity-powder': 'ors'}
SYMPTOM_BRIDGE = {'eye_irritation': 'ocular_irritation', 'eye_dryness': 'ocular_dryness', 'diarrhea': 'diarrhoea'}


def integrity(output, expected_version, source_key, bindings, required):
    manifest = toy_data.read_json(output / 'manifest.json')
    toy_data.require(manifest['version'] == expected_version and manifest[source_key] == bindings
        and manifest['environment'] == toy.environment(), 'RF source/environment/version changed.')
    toy_data.require(required <= set(manifest['outputs']), 'Required RF artifacts are missing.')
    for name, expected in manifest['outputs'].items():
        path = (output / name).resolve()
        toy_data.require(path.is_relative_to(output.resolve()) and path.is_file() and toy_data.digest(path) == expected,
            'RF artifact integrity failed: ' + name)
    return toy_data.digest(output / 'manifest.json')


@lru_cache(maxsize=2)
def verified_load(rule_manifest, toy_manifest):
    # First use of this exact immutable bundle performs the full offline audits.
    # Every caller still checks all hashes/source bindings/environment above.
    rules.verify()
    toy.verify()
    import joblib
    rule_models = joblib.load(rules_data.OUTPUT / 'models.joblib')
    toy_model = joblib.load(toy_data.DEFAULT_OUTPUT / 'model.joblib')
    products, policies, _ = rules_data.knowledge()
    toy_data.require(set(rule_models) == set(rules_data.TASKS), 'Incomplete RF task bundle.')
    return rule_models, toy_model, products, policies


def bundle():
    rule_manifest = integrity(rules_data.OUTPUT, rules_data.criteria()['version'], 'source_bindings', rules_data.bindings(),
        {'models.joblib', 'dataset.jsonl', 'evaluation.json', 'criteria.json'})
    toy_manifest = integrity(toy_data.DEFAULT_OUTPUT, toy_data.plan()['version'], 'sources',
        {name: toy_data.digest(toy_data.HERE / name) for name in toy.SOURCE_FILES},
        {'model.joblib', 'candidate_rows.jsonl', 'evaluation.json', 'plan.json'})
    return verified_load(rule_manifest, toy_manifest)


def model_identity():
    bundle()
    return {'model_version': rules_data.criteria()['version'], 'adapter_version': VERSION,
        'model_hash': hashlib.sha256((toy_data.digest(rules_data.OUTPUT / 'models.joblib')
            + toy_data.digest(toy_data.DEFAULT_OUTPUT / 'model.joblib') + VERSION).encode()).hexdigest()}


def predict_features(model, values):
    """Inputs only: no reference outcomes, teacher checks or post-decision data."""
    toy_data.require(sorted(values) == model['feature_names'], 'RF feature allowlist mismatch.')
    unseen = [key for key, value in values.items() if isinstance(value, str) and value not in model['vocabulary'][key]]
    if unseen:
        return {'predicted': None, 'status': 'abstained', 'reason': 'unseen_training_category', 'unseen_features': unseen}
    return {'predicted': str(model['pipeline'].predict([values])[0]), 'status': 'experimental_prediction',
        'reason': 'selected_rule_imitation_only', 'unseen_features': []}


def adapt_features(snapshot, candidate, task):
    facts, history = snapshot['clinical'], snapshot['context']
    positives = set(facts.get('verified_symptoms', [])) if facts.get('symptoms_reviewed') is True else set()
    patient = {key: facts.get(key) for key in ('care_setting', 'condition_severity', 'red_flags', 'special_population',
        'onset_hours', 'influenza_guideline', 'varicella_risk', 'weight_kg', 'renal_assessment', 'hepatic_assessment', 'topical_assessment')}
    patient.update(age_years=snapshot['patient']['age_years'], allergy_status=history['allergy_status'],
        allergies=deepcopy(history['allergies']), medicine_status=history['medicine_status'],
        current_medicines=deepcopy(history['current_medicines']), laiv_timing=facts.get('laiv_timing'),
        symptoms_reviewed=facts.get('symptoms_reviewed', False), verified_symptoms=sorted(positives),
        symptom_durations={name: facts.get('symptom_durations', {}).get(name) if name in positives else None for name in rules_data.SYMPTOMS})
    row = {'candidate_id': candidate['medicine_id'], 'condition': snapshot['diagnosis']['condition'],
        'patient_features': patient, 'proposed_regimen': deepcopy(candidate.get('regimen'))}
    values = rules_data.features(row, task)
    # The screening contract stores confirmed positives, not confirmed negatives.
    # Absence from that list must never silently become an absent symptom.
    for name in rules_data.SYMPTOMS:
        key = 'symptom_' + name
        if key in values:
            values[key] = 'True' if name in positives else '__unknown__'
    return values


def deterministic_reference(candidate, task):
    if task == 'purpose_applicability':
        return None  # Purpose is a provisional ML task; no invented teacher label.
    if task == 'dose' and not candidate.get('regimen'):
        return None  # No proposed regimen is available for a comparison.
    categories = {task, 'vaccine_interaction'} if task == 'interaction' else {task}
    checks = [row for row in candidate['checks'] if row['category'] in categories]
    if not checks:
        return None
    status = aggregate(checks)
    return {'passed': 'matches_selected_rule', 'blocked': 'mismatch', 'cannot_validate': 'cannot_validate'}.get(status) if task == 'dose' else rules_data.STATUS[status]


def toy_prediction(snapshot, candidate, model):
    condition, generic = snapshot['diagnosis']['condition'], GENERIC.get(candidate['medicine_id'])
    settings = toy_data.plan()
    purpose = settings['conditions'].get(condition, {}).get('candidates', {}).get(generic)
    if not generic or not purpose:
        return {'label': None, 'status': 'abstained', 'reason': 'outside_toy_task_mapping'}
    positives = set(snapshot['clinical'].get('verified_symptoms', [])) if snapshot['clinical'].get('symptoms_reviewed') is True else set()
    features = {'condition': condition, 'candidate_key': generic, 'purpose': purpose,
        **{name: 'present' if SYMPTOM_BRIDGE.get(name[8:], name[8:]) in positives else 'unknown' for name in toy_data.symptoms()}}
    return toy.predict_one(model, {'model_features': features}, settings)


def infer(draft):
    # Both this adapter and its API caller enforce synthetic scope. No caller
    # can activate it by supplying feature dictionaries in a request.
    toy_data.require(draft.snapshot.get('is_demo') is True, 'RF inference accepts synthetic screening snapshots only.')
    models, toy_model, products, policies = bundle()
    identity = model_identity()
    mapped = {(p['condition'], p['candidate_id'], p['purpose']) for p in policies}
    snapshot = draft.snapshot
    condition = snapshot['diagnosis']['condition']
    positives = set(snapshot['clinical'].get('verified_symptoms', [])) if snapshot['clinical'].get('symptoms_reviewed') is True else set()
    result = []
    for candidate in draft.result['candidates']:
        medicine = candidate['medicine_id']
        expected, product = products.get(medicine), candidate.get('product')
        supported = (condition, medicine, candidate['purpose']) in mapped
        exact = bool(expected and product and all(expected.get(name) == product.get(name) for name in ('strength', 'form', 'route', 'standard_concept', 'ingredients')))
        eligible = candidate['status'] == 'candidate_for_clinician_review' and bool(candidate.get('regimen'))
        outputs = {}
        if supported and exact:
            for task, model in models.items():
                prediction = predict_features(model, adapt_features(snapshot, candidate, task))
                if task == 'interaction' and any(check.get('trace', {}).get('backend_rule') == 'medicine_knowledge.selected_interactions.apply_selected_pair' for check in candidate['checks']):
                    prediction = {'predicted': None, 'status': 'abstained', 'reason': 'selected_pair_extension_not_in_frozen_training_scope', 'unseen_features': []}
                reference = deterministic_reference(candidate, task)
                outputs[task] = {**prediction, 'deterministic_reference': reference,
                    'agrees_with_selected_check': prediction['predicted'] == reference if reference is not None and prediction['predicted'] is not None else None}
        purpose = outputs.get('purpose_applicability', {})
        disagreements = [task for task, value in outputs.items() if task != 'purpose_applicability' and
            (value['predicted'] is None or value['agrees_with_selected_check'] is False)]
        if not eligible:
            label, status, reason = None, 'withheld', 'deterministic_screening_unavailable'
        elif not exact:
            label, status, reason = None, 'abstained', 'outside_frozen_model_product_coverage'
        elif not supported:
            label, status, reason = None, 'abstained', 'outside_frozen_model_condition_purpose_coverage'
        elif purpose.get('predicted') is None:
            label, status, reason = None, 'abstained', purpose.get('reason', 'unsupported_rf_input')
        else:
            label = {'provisional_relevance': 'relevant', 'not_relevant': 'not_relevant'}.get(purpose['predicted'], 'undetermined')
            status, reason = 'predicted', 'experimental_rf_purpose_applicability_only'
        result.append({'scope_id': candidate['scope_id'], 'medicine_id': medicine, 'purpose': candidate['purpose'],
            'clinical_role': candidate['clinical_role'], 'label': label, 'status': status, 'reason': reason,
            'suggested': bool(eligible and label == 'relevant' and not disagreements),
            'features': {'condition': condition, 'candidate_id': medicine, **{name + '_present': True if name in positives else None for name in rules_data.SYMPTOMS}},
            'rule_predictions': outputs, 'rule_disagreements_or_abstentions': disagreements,
            'symptom_match_rf': toy_prediction(snapshot, candidate, toy_model), 'ml_can_override_rules': False})
    return {'presentation_label': 'Experimental ML', 'algorithm': 'random_forest', **identity,
        'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed', 'medical_confidence_calibrated': False,
        'synthetic_only': True, 'predictions': result,
        'supporting_models': [{'version': rules_data.criteria()['version'], 'role': 'five selected-rule imitation classifiers', 'hash': toy_data.digest(rules_data.OUTPUT / 'models.joblib')},
            {'version': toy_data.plan()['version'], 'role': 'toy symptom-match classifier; not clinical relevance', 'hash': toy_data.digest(toy_data.DEFAULT_OUTPUT / 'model.joblib')}],
        'limits': ['Synthetic consultation inference only; no live-patient inputs, retraining or research-data writes.',
            'New adapter scope: saved synthetic screening inputs, distinct from the frozen-fictional research viewer.',
            'RF purpose applicability is provisional; single-candidate role groups have no meaningful within-group ranking.',
            'Four trained source-reference products; other condition/product scopes abstain.',
            'Only confirmed positive symptoms are inputs. Unlisted symptoms remain unknown.',
            'Safety predictions imitate selected rules and can be wrong. Deterministic blocks, unknowns and review gates prevail.',
            'The prospective selected-pair interaction extension is outside the frozen RF training scope; its interaction prediction abstains and the doctor must independently select any available candidate.',
            'Dose output compares the existing proposed regimen; numeric doses are never generated by ML.',
            'The 200-case RF learns toy symptom match and lacks antiviral targets. Its output is supplementary.',
            'No clinical validation, comprehensive interaction safety, calibrated medical confidence or patient publication.']}
