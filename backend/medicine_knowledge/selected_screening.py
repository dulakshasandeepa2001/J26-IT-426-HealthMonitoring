"""Active screening service: frozen core plus a separately reviewed pair rule.

Core catalogue/profile reviews keep their original bindings. Pair review is an
additional explicit per-visit decision saved with the immutable assessment.
"""
from collections import defaultdict
from django.db import transaction
from accounts.models import User
from . import patient_screening as core
from .models import PatientScreeningDraft
from .selected_interactions import apply_selected_pair, implementation_binding


def prepare(visit, actor, data):
    snapshot, result, _ = core.prepare(visit, actor, data)
    snapshot['selected_interaction_implementation'] = implementation_binding()
    apply_selected_pair(snapshot, result)
    groups = defaultdict(list)
    for row in result['candidates']:
        if row['status'] == 'candidate_for_clinician_review' and row['regimen']:
            groups[(row['purpose'], row['clinical_role'])].append(row['medicine_id'])
    result['purpose_groups'] = [{'purpose': purpose, 'clinical_role': role, 'candidate_ids': ids,
        'selection': 'clinician_choice_required' if len(ids) > 1 else 'single_candidate_applicability_only'}
        for (purpose, role), ids in groups.items()]
    return snapshot, result, core.digest_json({'snapshot': snapshot, 'result': result})


@transaction.atomic
def preview(actor, identity, data):
    visit = core.authorized_visit(actor, identity, lock=True)
    User.objects.select_for_update().get(pk=visit.patient_id)
    snapshot, result, plan_hash = prepare(visit, actor, data)
    latest = PatientScreeningDraft.objects.filter(consultation_id=visit.pk).order_by('-revision').first()
    return {'consultation_id': str(visit.pk), 'diagnosis_id': data['diagnosis_id'], 'plan_hash': plan_hash,
        'expected_latest_revision': latest.revision if latest else 0, 'result': result,
        'patient_age_years': snapshot['patient']['age_years'], 'age_source': 'registered_dob'}


@transaction.atomic
def save(actor, identity, data):
    visit = core.authorized_visit(actor, identity, lock=True)
    User.objects.select_for_update().get(pk=visit.patient_id)
    fingerprint = core.digest_json(data)
    existing = PatientScreeningDraft.objects.filter(consultation_id=visit.pk, request_key=data['request_key']).first()
    if existing:
        if existing.request_hash != fingerprint:
            raise core.ScreeningConflict('This request key was used with different inputs.')
        return existing, False
    latest = PatientScreeningDraft.objects.filter(consultation_id=visit.pk).order_by('-revision').first()
    if data['expected_latest_revision'] != (latest.revision if latest else 0):
        raise core.ScreeningConflict()
    snapshot, result, plan_hash = prepare(visit, actor, data)
    if plan_hash != data['expected_plan_hash']:
        raise core.ScreeningConflict('The reviewed plan changed; preview and acknowledge current inputs again.')
    return PatientScreeningDraft.objects.create(consultation_id=visit.pk, doctor=actor, patient_id=visit.patient_id,
        request_key=data['request_key'], request_hash=fingerprint, revision=latest.revision + 1 if latest else 1,
        snapshot=snapshot, result=result), True


def freshness(row, actor):
    state = core.freshness(row, actor)
    if not state['is_current']:
        return state
    # Historical drafts stay readable; new decisions require the active adapter.
    if row.snapshot.get('selected_interaction_implementation') != implementation_binding():
        return {'is_current': False, 'reason': 'Selected interaction implementation changed. Preview and save a current assessment.'}
    return state
