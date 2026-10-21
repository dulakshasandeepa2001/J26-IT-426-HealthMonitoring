"""Inference on explicit synthetic snapshots; saved RF models, no fitting/writes."""
from prescription_research.expansion import comparison, learners, knowledge
from prescription_research import dataset as io


def legacy_infer(draft):
    report = comparison.verify_run()
    model = io.read_json(comparison.DEFAULT_OUTPUT / 'selected_model.json')
    batch = io.read_json(comparison.rv.DEFAULT_OUTPUT / 'batch.json')
    # Frozen task coverage, not a teacher label or a live safety decision.
    mappings = {(row['condition'], row['candidate_id'], row['candidate_purpose'], row['clinical_role'])
                for row in batch['candidate_rows'] if row['mapping_status'] == 'mapped'}
    products = {row['candidate_id']: row for row in batch['candidate_definitions']}
    positives = set(draft.snapshot['clinical']['verified_symptoms'])
    result = []
    for candidate in draft.result['candidates']:
        identity = candidate['medicine_id']
        role = candidate['clinical_role']
        role_bridge = {('influenza', 'paracetamol-500mg-tablet'): ('fever_or_pain_relief', 'fever_or_aches_relief'),
                       ('chickenpox', 'paracetamol-500mg-tablet'): ('fever_or_pain_relief', 'fever_relief')}
        bridge = role_bridge.get((draft.result['condition'], identity))
        if bridge and role == bridge[0]:
            role = bridge[1]
        supported = (draft.result['condition'], identity, candidate['purpose'], role) in mappings
        expected = products.get(identity)
        product_supported = bool(expected and candidate['product'] and all(
            expected.get(name) == candidate['product'].get(name) for name in ('strength', 'form', 'route', 'standard_concept')))
        features = {'condition': draft.result['condition'], 'candidate_id': identity,
            'purpose': candidate['purpose'], 'clinical_role': role,
            **{name + '_present': True if name in positives else None for name in knowledge.SYMPTOMS}}
        if candidate['status'] != 'candidate_for_clinician_review' or not candidate['regimen']:
            prediction = {'label': None, 'status': 'withheld', 'reason': 'deterministic_screening_unavailable'}
        elif not supported:
            prediction = {'label': None, 'status': 'abstained', 'reason': 'outside_frozen_model_condition_purpose_coverage'}
        elif not product_supported:
            prediction = {'label': None, 'status': 'abstained', 'reason': 'outside_frozen_model_product_coverage'}
        else:
            prediction = learners.predict(model['learner'], features)
        result.append({'scope_id': candidate['scope_id'], 'medicine_id': identity,
            'purpose': candidate['purpose'], 'clinical_role': candidate['clinical_role'],
            'label': prediction['label'], 'status': prediction['status'], 'reason': prediction['reason'],
            'features': features, 'evidence': prediction.get('evidence', {}),
            'suggested': prediction['label'] == 'relevant' and prediction['status'] == 'predicted'})
    return {'presentation_label': 'Experimental ML', 'model_version': report['experiment_version'],
        'algorithm': report['selected_model'], 'model_hash': io.file_hash(comparison.DEFAULT_OUTPUT / 'selected_model.json'),
        'label_method': model['label_provenance']['label_method'], 'clinical_review_status': 'not_reviewed',
        'medical_confidence_calibrated': False, 'synthetic_only': True, 'predictions': result,
        'limits': ['Small rule-imitation relevance baseline; no clinically validated best-medicine ranking.',
            'Groups with one trained candidate have no meaningful within-group ranking.',
            'Only doctor-verified positive symptoms enter the model; other presences remain unknown.',
            'Untrained products abstain. Deterministic safety checks remain outside ML.',
            'No patient data is written to research artifacts and no training runs during requests.']}


def infer(draft):
    from .rf_inference import infer as infer_rf
    return infer_rf(draft)
