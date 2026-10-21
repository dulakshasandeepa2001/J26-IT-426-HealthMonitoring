"""Prospective, explicitly acknowledged pair evidence; never a general override.

Kept separate from the frozen research teacher and existing reviewed core rules.
Only the blanket interaction-gap finding can be replaced for the exact pair.
"""
import hashlib
import json
import re
from copy import deepcopy
from pathlib import Path
from rest_framework import serializers
from prescription_context.analysis_contract import StrictSerializer
from prescription_context.history_identity import product_hash, bound_details
from prescription_drafts.engine import aggregate, reference_regimen
from .models import content_digest, MedicineEntry
from .screening_engine import normalize_history
from .screening_contract import SixConditionClinicalSerializer, SixConditionPreviewSerializer, SixConditionSaveSerializer

ROOT = Path(__file__).resolve().parent


def policy():
    return json.loads((ROOT / 'data/selected_interactions.json').read_text(encoding='utf-8'))


def implementation_binding():
    return {'version': policy()['version'], 'hash': hashlib.sha256(b''.join((ROOT / name).read_bytes()
        for name in ('selected_interactions.py', 'selected_screening.py', 'data/selected_interactions.json'))).hexdigest()}


class PairReviewSerializer(StrictSerializer):
    reviewed = serializers.BooleanField(default=False)
    expected_binding = serializers.CharField(max_length=64, allow_blank=True, default='')
    note = serializers.CharField(max_length=1000, allow_blank=True, default='')

    def validate(self, data):
        if data['reviewed'] and (len(data['note'].strip()) < 10 or not re.fullmatch(r'[a-f0-9]{64}', data['expected_binding'])):
            raise serializers.ValidationError('An explicit pair review needs the current binding and at least 10 characters explaining applicability.')
        return data


class SelectedClinicalSerializer(SixConditionClinicalSerializer):
    selected_pair_review = PairReviewSerializer(required=False)


class SelectedPreviewSerializer(SixConditionPreviewSerializer):
    clinical = SelectedClinicalSerializer()


class SelectedSaveSerializer(SixConditionSaveSerializer):
    clinical = SelectedClinicalSerializer()


def pair_scope(snapshot, products):
    p = policy()
    available, reason = True, 'Exact current product and selected candidate are covered by this limited evidence rule.'
    context = snapshot.get('context')
    details = bound_details(context) if context else None
    matches = normalize_history(context['current_medicines'], products, context) if context else []
    if (snapshot.get('is_demo') is not True or (snapshot.get('diagnosis') or {}).get('condition') != 'influenza'
            or snapshot['patient']['age_years'] is None or snapshot['patient']['age_years'] < 18):
        available, reason = False, 'This selected pair pathway is limited to synthetic adult influenza assessments.'
    elif (not context or context['medicine_status'] != 'confirmed' or details is None
            or len(matches) != 1 or len(details['medicines']) != 1 or matches[0]['status'] != 'recognized'
            or len(matches[0]['matches']) != 1 or matches[0]['matches'][0]['entry_id'] != p['current_product_id']
            or matches[0]['matches'][0]['match_level'] != 'product'):
        available, reason = False, 'Exactly one doctor-confirmed current reference paracetamol product is required. Unknown, ingredient-only, additional or ambiguous medicines remain outside this pair coverage.'
    elif any(identity not in products or product_hash(products[identity]) != expected for identity, expected in p['product_hashes'].items()):
        available, reason = False, 'An exact reference product changed or is absent; this evidence binding cannot be reused.'
    binding = content_digest({'implementation': implementation_binding(), 'patient': snapshot['patient'],
        'context': context, 'analysis_hash': snapshot.get('analysis_hash'), 'diagnosis': snapshot.get('diagnosis'),
        'products': {identity: product_hash(products[identity]) if identity in products else None for identity in p['product_hashes']}})
    return {'available': available, 'reason': reason, 'binding': binding, 'version': p['version'],
        'source': p['source'], 'summary': p['evidence_summary'], 'scope': p['scope'], 'candidate_id': p['candidate_id']}


def apply_selected_pair(snapshot, result):
    """Replace only a known generic gap; all actual exclusions remain intact."""
    from .patient_screening import ScreeningConflict
    from prescription_drafts.models import SafetyProfile
    p = policy()
    products = {row.pk: row.content for row in MedicineEntry.objects.filter(pk__in=p['product_hashes'])}
    scope = pair_scope(snapshot, products)
    review = snapshot['clinical'].get('selected_pair_review', {})
    if review.get('reviewed') and (not scope['available'] or review.get('expected_binding') != scope['binding']):
        raise ScreeningConflict('The selected interaction evidence or patient/product binding changed. Refresh and explicitly review the current scope again.')
    if not scope['available']:
        return
    row = next((row for row in result['candidates'] if row['medicine_id'] == p['candidate_id']), None)
    if not row:
        return
    # A new or specific warning is never assumed to be this generic coverage gap.
    gap = next((check for check in row['checks'] if check['category'] == 'interaction'
        and check['status'] == 'warning' and check['message'] ==
        'Only selected label cautions are screened. Other medicine pairs need clinician interaction review.'), None)
    if gap is None:
        return
    original = deepcopy(gap)
    gap.update(status='passed' if review.get('reviewed') else 'cannot_validate',
        blocks_availability=not review.get('reviewed', False), source_ids=[p['source']['id']],
        message=('Explicit visit review applied the selected TAMIFLU–acetaminophen label evidence. No pair-related dose adjustment is specified; this is not comprehensive interaction safety or prescription approval.'
            if review.get('reviewed') else 'Selected evidence exists for this exact pair. Review the linked evidence in Patient information and record its limited applicability for this visit before screening again.'))
    gap['trace'] = {'backend_rule': 'medicine_knowledge.selected_interactions.apply_selected_pair',
        'inputs': {**original.get('trace', {}).get('inputs', {}), 'selected_pair_review': deepcopy(review),
            'policy_version': scope['version'], 'policy_binding': scope['binding']}, 'superseded_generic_gap': original}
    row['sources'].append(deepcopy(p['source']))
    obstacles = [check for check in row['checks'] if check['blocks_availability']]
    if not obstacles:
        profile = SafetyProfile.objects.get(pk=p['candidate_id'])
        regimen, reason = reference_regimen(profile.content, snapshot['patient']['age_years'], snapshot['clinical'], row['product']['route'])
        if regimen is not None and reason is None:
            row['status'], row['regimen'] = 'candidate_for_clinician_review', regimen
    row['screening_status'] = aggregate(row['checks'])
    result['selected_pair_policy'] = {**implementation_binding(), 'applied': bool(review.get('reviewed')),
        'source': deepcopy(p['source']), 'scope': p['scope']}
