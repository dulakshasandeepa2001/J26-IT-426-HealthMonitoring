"""Research-only clinician decisions; never a patient publication endpoint."""
from copy import deepcopy
import hashlib
from pathlib import Path
from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError, APIException
from medicine_knowledge.models import PatientScreeningDraft
from medicine_knowledge.patient_screening import authorized_visit, digest_json
from medicine_knowledge.selected_screening import freshness, prepare
from prescription_context.experimental_ml import ExperimentUnavailable
from .models import MedicineProposal, DoctorDecision
from .inference import infer

VERSION = 'synthetic-doctor-review-2026-10-18-v1'


class ReviewConflict(APIException):
    status_code = 409
    default_detail = 'Proposal, source inputs or decision changed. Refresh and review again.'


def implementation_hash():
    root = Path(__file__).resolve().parent
    return hashlib.sha256(b''.join((root / name).read_bytes() for name in ('services.py', 'inference.py', 'rf_inference.py', 'models.py', 'contracts.py'))).hexdigest()


def demo_scope(actor, visit_id, lock=False):
    visit = authorized_visit(actor, visit_id, lock=lock)
    if not visit.is_demo or getattr(settings, 'PRESCRIPTION_EXPERIMENTAL_ML_ENABLED', False) is not True:
        raise PermissionDenied('This Experimental ML → doctor-review workflow requires an enabled synthetic demo visit. Real-patient prescribing/publication is unavailable.')
    return visit


def doctor_identity(actor):
    return {'id': actor.pk, 'name': actor.get_full_name().strip() or actor.username,
            'qualifications': actor.degrees or '', 'university': actor.university or '',
            'hospital': actor.working_hospital or '', 'credentials_verified': False}


def proposal_hash(proposal):
    return digest_json({'id': str(proposal.pk), 'snapshot': proposal.snapshot, 'result': proposal.result})


def revalidate(draft, actor, visit):
    from accounts.models import User
    User.objects.select_for_update().get(pk=visit.patient_id)
    _, result, _ = prepare(visit, actor, {'diagnosis_id': draft.snapshot['diagnosis']['id'],
        'expected_context_updated_at': draft.snapshot['context']['updated_at'],
        'expected_analysis_hash': draft.snapshot['analysis_hash'], 'clinical': draft.snapshot['clinical']})
    if digest_json(result) != digest_json(draft.result):
        raise ReviewConflict('Current deterministic screening differs from the saved draft. Regenerate the screening draft first.')


def current_state(proposal, actor):
    visit = demo_scope(actor, proposal.consultation_id)
    if proposal.snapshot['patient']['name'] != (visit.patient.get_full_name().strip() or visit.patient.username):
        return {'is_current': False, 'reason': 'Registered patient name changed. Generate a new proposal.'}
    latest = MedicineProposal.objects.filter(consultation_id=proposal.consultation_id).order_by('-revision').first()
    if latest.pk != proposal.pk:
        return {'is_current': False, 'reason': 'A newer medicine proposal exists.'}
    if proposal.snapshot['implementation_hash'] != implementation_hash():
        return {'is_current': False, 'reason': 'The decision implementation changed. Generate a new proposal.'}
    state = freshness(proposal.draft, actor)
    if not state['is_current']:
        return state
    try:
        from .rf_inference import model_identity
        identity = model_identity()
        if proposal.result['ml']['model_hash'] != identity['model_hash'] or proposal.result['ml']['model_version'] != identity['model_version']:
            return {'is_current': False, 'reason': 'The saved RF model bundle changed.'}
    except (OSError, ValueError, KeyError, TypeError, ImportError):
        return {'is_current': False, 'reason': 'Frozen Experimental ML artifacts cannot be verified.'}
    return {'is_current': True, 'reason': None}


@transaction.atomic
def create_proposal(actor, visit_id, data):
    visit = demo_scope(actor, visit_id, lock=True)
    draft = get_object_or_404(PatientScreeningDraft.objects.select_for_update(), pk=data['draft_id'], consultation_id=visit.pk, doctor=actor)
    existing = MedicineProposal.objects.filter(consultation_id=visit.pk, request_key=data['request_key']).first()
    if existing:
        if existing.draft_id != draft.pk:
            raise ReviewConflict('This request key belongs to another draft.')
        return existing, False
    state = freshness(draft, actor)
    if not state['is_current']:
        raise ReviewConflict(state['reason'])
    revalidate(draft, actor, visit)
    try:
        ml = infer(draft)
    except (OSError, ValueError, KeyError, TypeError, ImportError) as error:
        raise ExperimentUnavailable() from error
    candidates = deepcopy(draft.result['candidates'])
    eligible = [row for row in candidates if row['status'] == 'candidate_for_clinician_review' and row['regimen']]
    suggested = {row['medicine_id'] for row in ml['predictions'] if row['suggested']}
    default_ids = []
    for group in {(row['purpose'], row['clinical_role']) for row in eligible}:
        ids = [row['medicine_id'] for row in eligible if (row['purpose'], row['clinical_role']) == group and row['medicine_id'] in suggested]
        if len(ids) == 1:
            default_ids.extend(ids)
    latest = MedicineProposal.objects.filter(consultation_id=visit.pk).order_by('-revision').first()
    return MedicineProposal.objects.create(draft=draft, consultation_id=visit.pk, doctor=actor,
        revision=latest.revision + 1 if latest else 1, request_key=data['request_key'],
        snapshot={'version': VERSION, 'implementation_hash': implementation_hash(), 'draft_id': str(draft.pk),
            'patient': {'id': visit.patient_id, 'name': visit.patient.get_full_name().strip() or visit.patient.username,
                        'age_years': draft.snapshot['patient']['age_years'], 'birthday': draft.snapshot['patient']['birthday']},
            'condition': draft.result['condition'], 'synthetic_only': True},
        result={'ml': ml, 'candidates': candidates, 'default_ids': sorted(default_ids),
                'approved': False, 'published': False, 'clinical_validation_status': 'not_validated'}), True


def selected_candidates(proposal, ids, combined):
    allowed = {row['medicine_id']: row for row in proposal.result['candidates'] if row['status'] == 'candidate_for_clinician_review' and row['regimen']}
    if set(ids) - set(allowed):
        raise ValidationError('Selections must come from currently available screened candidates. No blocked medicine or custom regimen can be substituted.')
    groups, ingredients, rows = set(), set(), []
    for identity in ids:
        row = allowed[identity]
        group = (row['purpose'], row['clinical_role'])
        if group in groups:
            raise ValidationError('Choose at most one alternative for each treatment purpose/role.')
        present = {item['name'].casefold() for item in row['product']['ingredients']}
        if present & ingredients:
            raise ValidationError('Selected medicines duplicate an ingredient.')
        groups.add(group); ingredients.update(present); rows.append(deepcopy(row))
    if len(rows) > 1 and not combined:
        raise ValidationError('Independently review the selected combination, including interactions, before saving a multi-medicine decision.')
    return rows


@transaction.atomic
def decide(actor, proposal_id, data):
    proposal = get_object_or_404(MedicineProposal, pk=proposal_id, doctor=actor)
    visit = demo_scope(actor, proposal.consultation_id, lock=True)
    proposal = MedicineProposal.objects.select_for_update().select_related('draft').get(pk=proposal.pk)
    existing = proposal.decisions.filter(request_key=data['request_key']).first()
    request_hash = digest_json(data)
    if existing:
        if existing.request_hash != request_hash:
            raise ReviewConflict('This decision key was used with different inputs.')
        return existing, False
    latest = proposal.decisions.order_by('-revision').first()
    if data['expected_revision'] != (latest.revision if latest else 0) or data['expected_proposal_hash'] != proposal_hash(proposal):
        raise ReviewConflict()
    if latest and latest.action in ('approved', 'rejected'):
        raise ReviewConflict('This proposal has a final doctor decision. Generate a new proposal to revise it.')
    state = current_state(proposal, actor)
    if not state['is_current']:
        raise ReviewConflict(state['reason'])
    revalidate(proposal.draft, actor, visit)
    rows = selected_candidates(proposal, data['selected_ids'], data['combination_reviewed'])
    return DoctorDecision.objects.create(proposal=proposal, doctor=actor, request_key=data['request_key'], request_hash=request_hash,
        revision=latest.revision + 1 if latest else 1, action=data['action'], selection=data['selected_ids'], reason=data['reason'],
        snapshot={'version': VERSION, 'proposal_hash': proposal_hash(proposal), 'patient': proposal.snapshot['patient'],
            'doctor': doctor_identity(actor), 'condition': proposal.snapshot['condition'], 'medicines': rows,
            'combination_reviewed': data['combination_reviewed'], 'synthetic_only': True,
            'research_demo_only': True, 'published': False, 'valid_for_dispensing': False}), True


def slip(actor, decision_id):
    decision = get_object_or_404(DoctorDecision.objects.select_related('proposal__draft'), pk=decision_id, doctor=actor)
    if decision.action != 'approved':
        raise PermissionDenied('Only an approved doctor decision has a prescription demo slip.')
    state = current_state(decision.proposal, actor)
    latest = decision.proposal.decisions.order_by('-revision').first()
    if not state['is_current'] or latest.pk != decision.pk or decision.snapshot['doctor'] != doctor_identity(actor):
        raise ReviewConflict(state.get('reason') or 'Doctor identity or decision changed.')
    return decision
