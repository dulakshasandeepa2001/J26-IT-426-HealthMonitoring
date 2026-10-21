"""Authoritative six-condition encounter inputs, previews and immutable drafts."""
from copy import deepcopy
from collections import defaultdict
from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import APIException, ValidationError
from accounts.models import User
from prescription_context.models import PrescriptionContextConsultation as Consultation, PrescriptionContextConsultationanalysis as Analysis, PrescriptionContextDiagnosisconfirmation as Diagnosis, PrescriptionContextPatientcontext as Context
from prescription_context.patient_data import patient_age, context_snapshot
from prescription_context.member1_v21 import HANDOFF_CONDITIONS
from prescription_drafts.models import SafetyProfile
from prescription_drafts.profiles import validate_profile, engine_digest
from prescription_research import dataset as ds
from .models import MedicineEntry, ConditionKnowledge, PatientScreeningDraft, content_digest
from .additional_candidates import clinical_bindings
from .screening_engine import ENGINE_VERSION, normalize_history, screen_candidate, finding
from .screening_trace import review_trace, scope_trace, missing_review


class ScreeningConflict(APIException):
    status_code = 409
    default_detail = 'Patient, analysis, diagnosis, knowledge or draft version changed. Refresh and review the current plan.'


def authorized_visit(actor, identity, lock=False):
    query = Consultation.objects.filter(doctor=actor, doctor__is_active=True, doctor__is_approved=True, doctor__role='doctor', patient__role='patient', patient__is_active=True, patient__is_approved=True)
    if lock:
        query = query.select_for_update()
    return get_object_or_404(query, pk=identity)


def draft_queryset(actor):
    links = Consultation.objects.filter(pk=OuterRef('consultation_id'), doctor=actor, patient_id=OuterRef('patient_id'))
    return PatientScreeningDraft.objects.filter(doctor=actor, patient__is_active=True, patient__is_approved=True, patient__role='patient').filter(Exists(links))


def binding_snapshot(visit):
    patient = User.objects.get(pk=visit.patient_id)
    context = Context.objects.filter(patient=patient).first()
    analysis = Analysis.objects.filter(consultation=visit).first()
    diagnoses = list(Diagnosis.objects.filter(consultation=visit, doctor_id=visit.doctor_id).order_by('pk').values())
    medicines = list(MedicineEntry.objects.select_related('reviewed_by').order_by('pk'))
    profiles = list(SafetyProfile.objects.select_related('reviewed_by', 'medicine__reviewed_by').order_by('pk'))
    scopes = list(ConditionKnowledge.objects.order_by('pk').prefetch_related('reviews__reviewer'))
    return {'patient': {'id': patient.pk, 'birthday': patient.birthday.isoformat() if patient.birthday else None,
                        'age_years': patient_age(patient.birthday)[0], 'dob_status': patient_age(patient.birthday)[1]},
        'context': {**context_snapshot(context), 'updated_at': context.updated_at.isoformat(), 'provenance': context.provenance} if context else None,
        'analysis_hash': content_digest(analysis.payload if analysis else None), 'diagnoses_hash': digest_json(diagnoses),
        'as_of_date': timezone.localdate(timezone=ZoneInfo('Asia/Colombo')).isoformat(),
        'engine_bindings': clinical_bindings(), 'pilot_engine_hash': engine_digest(),
        'knowledge': {'medicines': [(r.pk, r.content_hash, content_digest(r.content), r.review_is_current, r.updated_at.isoformat()) for r in medicines],
            'profiles': [(r.pk, r.content_hash, content_digest(r.content), r.review_is_current, r.updated_at.isoformat()) for r in profiles],
            'scopes': [(r.pk, r.content_hash, content_digest(r.content), r.rules_hash, content_digest(r.rules), r.updated_at.isoformat(), r.review_state('content'), r.review_state('safety')) for r in scopes]}}


def digest_json(value):
    import json
    from django.core.serializers.json import DjangoJSONEncoder
    return content_digest(json.loads(json.dumps(value, cls=DjangoJSONEncoder)))


def source_observations(payload):
    member = (payload or {}).get('member1', {})
    return {'assessments': member.get('reported_assessments', {}),
        'red_flags': (payload or {}).get('severity', {}).get('red_flags', []),
        'severity': (payload or {}).get('severity', {}).get('level', 'unknown'),
        'symptoms': (payload or {}).get('symptoms', []), 'assessment_status': 'unverified'}


def candidate_definitions(condition):
    medicines = {row.pk: row for row in MedicineEntry.objects.select_related('reviewed_by').order_by('pk')}
    profiles = {row.pk: row for row in SafetyProfile.objects.select_related('reviewed_by', 'medicine__reviewed_by').order_by('pk')}
    products = {identity: row.content for identity, row in medicines.items()}
    candidates = []
    for identity, row in medicines.items():
        use = next((use for use in row.content['uses'] if use['condition'] == condition), None)
        if not use:
            continue
        profile = profiles.get(identity)
        gates = []
        reviews = {'content': review_trace(row), 'safety': review_trace(profile, safety=True) if profile else missing_review()}
        if not row.review_is_current or not profile or not profile.review_is_current:
            reasons = [kind + ': ' + ' '.join(state['reasons']) for kind, state in reviews.items() if not state['is_current']]
            gates.append(finding('knowledge_review', 'cannot_validate', 'Current reviews are required. ' + ' '.join(reasons)))
        if profile:
            validate_profile(profile.content, row)
        rule = profile.content if profile else None
        candidates.append({'scope_id': 'pilot:' + identity, 'name': row.content['generic_name'], 'product': row.content,
            'policy': {'candidate_id': identity, 'handler': rule['kind'] if rule else 'catalogue_only', 'purpose': use['purpose'],
                'clinical_role': 'influenza_antiviral' if identity.startswith('oseltamivir') else 'varicella_antiviral' if identity.startswith('acyclovir') else 'itching_relief' if identity.startswith('calamine') else 'fever_or_pain_relief',
                'target_symptoms': rule['parameters'].get('relevant_symptoms', []) if rule else []},
            'reference_profile': rule, 'content_hash': row.content_hash, 'rules_hash': profile.content_hash if profile else '',
            'sources': row.content['sources'], 'gate_findings': gates, 'review_trace': reviews})
    for row in ConditionKnowledge.objects.order_by('pk').prefetch_related('reviews__reviewer'):
        product = row.content['product']
        if product:
            products[row.medicine_id] = product
        if row.condition != condition:
            continue
        gates = []
        reviews = scope_trace(row)
        if not row.review_state('content')['is_current'] or not row.review_state('safety')['is_current']:
            reasons = [kind + ': ' + (reviews[kind]['reason'] or 'Recorded decision is ' + reviews[kind]['status'] + '.') for kind in ('content', 'safety') if not reviews[kind]['is_current']]
            gates.append(finding('knowledge_review', 'cannot_validate', 'This condition scope requires current reviews. ' + ' '.join(reasons)))
        if row.rules.get('clinical_implementation_bindings') != clinical_bindings():
            gates.append(finding('implementation_binding', 'cannot_validate', 'The condition scope is not bound to this patient-screening implementation.'))
        if row.medicine_id in medicines and (not medicines[row.medicine_id].review_is_current or row.medicine_id not in profiles or not profiles[row.medicine_id].review_is_current):
            gates.append(finding('base_product_review', 'cannot_validate', 'The underlying pilot product/rule review must remain current.'))
        if row.medicine_id in medicines:
            base = profiles.get(row.medicine_id)
            reviews['base_product'] = {'content': review_trace(medicines[row.medicine_id]), 'safety': review_trace(base, safety=True) if base else missing_review()}
        candidates.append({'scope_id': row.pk, 'name': product['generic_name'] if product else row.content.get('display_name', 'ORS'),
            'product': product, 'policy': row.rules['policy'], 'reference_profile': row.rules.get('reference_profile'),
            'content_hash': row.content_hash, 'rules_hash': row.rules_hash,
            'sources': product['sources'] if product else row.content.get('sources', row.content.get('unresolved_product', {}).get('source_urls', [])), 'gate_findings': gates, 'review_trace': reviews})
    return candidates, {k: row.content for k, row in profiles.items()}, products


def prepare(visit, actor, data):
    # Both callers hold visit/patient locks; bind knowledge and clinical rows
    # consistently while another doctor reviews or imports them.
    for model in (MedicineEntry, SafetyProfile, ConditionKnowledge):
        list(model.objects.select_for_update().order_by('pk').values_list('pk', flat=True))
    list(Context.objects.select_for_update().filter(patient_id=visit.patient_id))
    list(Analysis.objects.select_for_update().filter(consultation=visit))
    list(Diagnosis.objects.select_for_update().filter(consultation=visit))
    snapshot = binding_snapshot(visit)
    diagnosis = get_object_or_404(Diagnosis, pk=data['diagnosis_id'], consultation=visit, doctor=actor)
    condition = diagnosis.condition_code.casefold()
    if condition == 'manual':
        condition = diagnosis.condition_label.casefold().replace(' ', '_')
    if condition not in HANDOFF_CONDITIONS:
        raise ValidationError('Confirm a supported canonical six-condition diagnosis; differential diagnoses do not select medicines.')
    context = snapshot['context']
    if not context or parse_datetime(context['updated_at']) != parse_datetime(data['expected_context_updated_at']):
        raise ScreeningConflict('Patient context is missing or changed. Review/save the current history for this visit.')
    if context['provenance'].get('last_reviewed_consultation') != str(visit.pk) or context['provenance'].get('last_reviewed_by') != actor.pk:
        raise ValidationError('Review/save allergies and current medicines for this visit first.')
    analysis = Analysis.objects.filter(consultation=visit).first()
    if diagnosis.analysis_reference != (analysis.analysis_reference if analysis else None) or data['expected_analysis_hash'] != snapshot['analysis_hash']:
        raise ScreeningConflict('The confirmed diagnosis or expected analysis does not match current evidence.')
    snapshot.update(clinical=deepcopy(data['clinical']), diagnosis={'id': diagnosis.pk, 'condition': condition},
        source_observations=source_observations(analysis.payload if analysis else None),
        analysis={'payload': analysis.payload} if analysis else None, is_demo=visit.is_demo, omitted_unreviewed=[])
    candidates, profiles, products = candidate_definitions(condition)
    if not candidates:
        raise ValidationError('Medicine knowledge has not been imported for this condition.')
    matches = normalize_history(context['current_medicines'], products, context)
    results = [screen_candidate(snapshot, candidate, profiles, products, matches) for candidate in candidates]
    groups = defaultdict(list)
    for result in results:
        if result['status'] == 'candidate_for_clinician_review':
            groups[(result['purpose'], result['clinical_role'])].append(result['medicine_id'])
    result = {'mode': 'deterministic_six_condition_draft', 'engine_version': ENGINE_VERSION,
        'condition': condition, 'candidates': results, 'purpose_groups': [{'purpose': purpose, 'clinical_role': role, 'candidate_ids': identities,
            'selection': 'clinician_choice_required' if len(identities) > 1 else 'single_candidate_applicability_only'} for (purpose, role), identities in groups.items()],
        'normalization': matches, 'model_used': False, 'clinical_validation_status': 'not_validated',
        'input_trace': {'clinical': deepcopy(snapshot['clinical']), 'registered_age_years': snapshot['patient']['age_years'],
            'source_observations': snapshot['source_observations'], 'context_updated_at': context['updated_at'],
            'regimen_workflow': 'Automatic server rule reference before safety/dose validation; manual proposed-regimen entry is not part of this screen.'},
        'approved': False, 'published': False, 'prescription_eligible': False,
        'limitations': 'Unranked source-based candidates for clinician review. No automatic combination of alternatives, comprehensive interaction clearance or patient-facing prescription publication.'}
    plan_hash = digest_json({'snapshot': snapshot, 'result': result})
    return snapshot, result, plan_hash


@transaction.atomic
def preview(actor, identity, data):
    visit = authorized_visit(actor, identity, lock=True)
    User.objects.select_for_update().get(pk=visit.patient_id)
    snapshot, result, plan_hash = prepare(visit, actor, data)
    latest = PatientScreeningDraft.objects.filter(consultation_id=visit.pk).order_by('-revision').first()
    return {'consultation_id': str(visit.pk), 'diagnosis_id': data['diagnosis_id'], 'plan_hash': plan_hash,
        'expected_latest_revision': latest.revision if latest else 0, 'result': result,
        'patient_age_years': snapshot['patient']['age_years'], 'age_source': 'registered_dob'}


@transaction.atomic
def save(actor, identity, data):
    visit = authorized_visit(actor, identity, lock=True)
    User.objects.select_for_update().get(pk=visit.patient_id)
    fingerprint = digest_json(data)
    existing = PatientScreeningDraft.objects.filter(consultation_id=visit.pk, request_key=data['request_key']).first()
    if existing:
        if existing.request_hash != fingerprint:
            raise ScreeningConflict('This request key was used with different inputs.')
        return existing, False
    latest = PatientScreeningDraft.objects.filter(consultation_id=visit.pk).order_by('-revision').first()
    if data['expected_latest_revision'] != (latest.revision if latest else 0):
        raise ScreeningConflict()
    snapshot, result, plan_hash = prepare(visit, actor, data)
    if plan_hash != data['expected_plan_hash']:
        raise ScreeningConflict('The reviewed plan changed; preview and acknowledge current inputs again.')
    row = PatientScreeningDraft.objects.create(consultation_id=visit.pk, doctor=actor, patient_id=visit.patient_id,
        request_key=data['request_key'], request_hash=fingerprint, revision=(latest.revision + 1) if latest else 1,
        snapshot=snapshot, result=result)
    return row, True


def freshness(row, actor):
    visit = authorized_visit(actor, row.consultation_id)
    latest = PatientScreeningDraft.objects.filter(consultation_id=visit.pk).order_by('-revision').first()
    if latest.pk != row.pk:
        return {'is_current': False, 'reason': 'A newer immutable version exists.'}
    binding = binding_snapshot(visit)
    if digest_json(binding) != digest_json({key: row.snapshot[key] for key in binding}):
        return {'is_current': False, 'reason': 'Patient, date, evidence, knowledge, review or implementation changed.'}
    return {'is_current': True, 'reason': None}
