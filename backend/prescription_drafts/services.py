from zoneinfo import ZoneInfo
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import APIException, ValidationError
from accounts.models import User
from medicine_knowledge.models import MedicineEntry, content_digest
from medicine_knowledge.services import normalize_medicines
from prescription_context.models import (
    PrescriptionContextConsultation as Consultation, PrescriptionContextDiagnosisconfirmation as Diagnosis,
    PrescriptionContextPatientcontext as Context, PrescriptionContextConsultationanalysis as Analysis,
)
from prescription_context.patient_data import patient_age, context_snapshot
from .models import PrescriptionDraft, SafetyProfile
from .profiles import engine_digest, validate_profile
from .engine import run_screening, suggest_regimens, regimen_matches, ENGINE_VERSION


class DraftConflict(APIException):
    status_code = 409
    default_detail = 'Inputs or draft version have changed. Refresh and review before generating another version.'


def draft_queryset(doctor):
    links = Consultation.objects.filter(pk=OuterRef('consultation_id'), doctor=doctor, patient_id=OuterRef('patient_id'))
    return PrescriptionDraft.objects.filter(doctor=doctor, patient__is_active=True, patient__is_approved=True,
        patient__role='patient').filter(Exists(links))


def pilot_condition(diagnosis):
    code = diagnosis.condition_code.casefold()
    if code in ('influenza', 'chickenpox'):
        return code
    if code == 'manual' and diagnosis.condition_label.casefold() in ('influenza', 'chickenpox'):
        return diagnosis.condition_label.casefold()
    raise ValidationError({'diagnosis': 'The confirmed diagnosis is outside the influenza/chickenpox pilot.'})


def knowledge_versions(medicines, profiles):
    return [{'id': item.pk, 'content_hash': item.content_hash, 'updated_at': item.updated_at.isoformat(),
             'review_current': item.review_is_current,
             'profile_hash': profiles[item.pk].content_hash if item.pk in profiles else None,
             'profile_updated_at': profiles[item.pk].updated_at.isoformat() if item.pk in profiles else None,
             'profile_review_current': profiles[item.pk].review_is_current if item.pk in profiles else False}
            for item in medicines]


def condition_medicines(condition, *, lock=False):
    query = MedicineEntry.objects.select_related('reviewed_by').order_by('id')
    if lock:
        query = query.select_for_update(of=('self',))
    return [entry for entry in query if any(use['condition'] == condition for use in entry.content.get('uses', []))]


def get_profiles(medicines, *, lock=False):
    query = SafetyProfile.objects.filter(medicine_id__in=[entry.pk for entry in medicines]).select_related('medicine', 'reviewed_by', 'medicine__reviewed_by').order_by('medicine_id')
    if lock:
        query = query.select_for_update(of=('self',))
    return {item.pk: item for item in query}


def plan_digest(snapshot, suggestions):
    # Bind acknowledgement to the entire preview evidence, including exclusions,
    # DOB, date and review versions, rather than only the selected dose values.
    return content_digest({**snapshot, 'clinical': {**snapshot['clinical'], 'reviewed': False},
                           'proposals': [], 'suggestions': suggestions})


@transaction.atomic
def generate_draft(consultation_id, actor, request_data):
    consultation = get_object_or_404(Consultation.objects.select_for_update().select_related('doctor'), pk=consultation_id, doctor=actor)
    patient = User.objects.select_for_update().get(pk=consultation.patient_id)
    if not (patient.role == 'patient' and patient.is_active and patient.is_approved
            and consultation.doctor.is_active and consultation.doctor.is_approved and consultation.doctor.role == 'doctor'):
        raise ValidationError('An active approved doctor and patient are required.')
    fingerprint = content_digest(request_data)
    existing = PrescriptionDraft.objects.filter(consultation_id=consultation.pk, request_key=request_data['request_key']).first()
    if existing:
        if existing.request_hash != fingerprint:
            raise DraftConflict('This request key was already used with different inputs.')
        return existing, False
    latest = PrescriptionDraft.objects.filter(consultation_id=consultation.pk).order_by('-revision').first()
    if request_data['expected_latest_revision'] != (latest.revision if latest else 0):
        raise DraftConflict()
    eligible, profiles, snapshot, matches = prepare_screening_inputs(consultation, patient, actor, request_data)
    selection_mode = request_data.get('selection_mode', 'manual')
    suggestions = suggest_regimens(eligible, profiles, snapshot, matches)
    if selection_mode == 'automatic':
        reviewed_plan = plan_digest(snapshot, suggestions)
        if request_data.get('expected_plan_hash') != reviewed_plan:
            raise DraftConflict('The automatic plan or its patient/evidence inputs changed. Refresh suggestions and review the current plan before saving.')
        snapshot['reviewed_plan_hash'] = reviewed_plan
        request_data = {**request_data, 'proposals': [{'medicine_id': row['medicine_id'], 'origin': 'rule_suggestion', 'dose': row['dose']}
                        for row in suggestions if row['status'] == 'suggested']}
        snapshot['proposals'] = request_data['proposals']
    snapshot['selection_mode'] = selection_mode
    proposals = {item['medicine_id']: item['dose'] for item in request_data['proposals']}
    automatic = [item for item in request_data['proposals'] if item['origin'] == 'rule_suggestion']
    if automatic:
        for proposal in automatic:
            reference = next(item['dose'] for item in suggestions if item['medicine_id'] == proposal['medicine_id'])
            dose = proposal['dose']
            if not regimen_matches(dose, reference):
                raise DraftConflict('The automatic regimen no longer matches current clinical inputs. Refresh suggestions and review the regimen.')
        snapshot['regimen_suggestions'] = suggestions
    result = run_screening(eligible, profiles, snapshot, proposals, matches)
    if selection_mode == 'automatic':
        result['candidates'] = [row for row in result['candidates'] if row['medicine_id'] in proposals]
        result['excluded_candidates'] = [row for row in suggestions if row['status'] != 'suggested']
        snapshot['regimen_suggestions'] = suggestions
    result['selection_mode'] = selection_mode
    origins = {item['medicine_id']: item['origin'] for item in request_data['proposals']}
    for candidate in result['candidates']:
        candidate['regimen_origin'] = origins.get(candidate['medicine_id'], 'manual')
    draft = PrescriptionDraft.objects.create(consultation_id=consultation.pk, doctor=actor, patient=patient,
        revision=(latest.revision + 1) if latest else 1, request_key=request_data['request_key'], request_hash=fingerprint,
        snapshot=snapshot, result=result)
    return draft, True


def prepare_screening_inputs(consultation, patient, actor, request_data):
    """Shared authoritative inputs; caller holds visit/patient transaction locks."""
    diagnosis = Diagnosis.objects.filter(consultation=consultation, doctor=actor, pk=request_data['diagnosis_id']).first()
    if diagnosis is None:
        raise ValidationError({'diagnosis_id': 'Confirm this visit diagnosis before generating a draft.'})
    condition = pilot_condition(diagnosis)
    context = Context.objects.filter(patient=patient).first()
    if context is None or context.updated_at != parse_datetime(request_data['expected_context_updated_at']):
        raise DraftConflict('Patient information has changed or is missing. Refresh and review it for this visit.')
    if context.provenance.get('last_reviewed_consultation') != str(consultation.pk) or context.provenance.get('last_reviewed_by') != actor.pk:
        raise ValidationError({'patient_context': 'Review/save allergies and current medicines for this visit first.'})
    analysis = Analysis.objects.filter(consultation=consultation).first()
    if diagnosis.analysis_reference != (analysis.analysis_reference if analysis else None):
        raise DraftConflict('The saved diagnosis reference does not match the current analysis.')
    medicines = condition_medicines(condition, lock=True)
    profiles = get_profiles(medicines, lock=True)
    eligible = [entry for entry in medicines if entry.review_is_current and entry.pk in profiles and profiles[entry.pk].review_is_current]
    if not eligible:
        raise ValidationError({'knowledge': 'Review at least one relevant medicine catalogue entry and its executable safety profile first.'})
    for entry in eligible:
        validate_profile(profiles[entry.pk].content, entry)
    proposed_rows = request_data.get('proposals', [])
    proposals = {item['medicine_id']: item['dose'] for item in proposed_rows}
    if set(proposals) - {entry.pk for entry in eligible}:
        raise ValidationError({'proposals': 'Dose proposals must belong to currently reviewed candidates for this confirmed condition.'})
    age, dob_status = patient_age(patient.birthday)
    snapshot = {
        'as_of_date': timezone.localdate(timezone=ZoneInfo('Asia/Colombo')).isoformat(),
        'engine_hash': engine_digest(), 'is_demo': consultation.is_demo,
        'patient': {'id': patient.pk, 'birthday': patient.birthday.isoformat() if patient.birthday else None,
                    'age_years': age, 'dob_status': dob_status},
        'context': {**context_snapshot(context), 'updated_at': context.updated_at.isoformat(), 'provenance': context.provenance},
        'diagnosis': {'id': diagnosis.pk, 'condition': condition, 'condition_code': diagnosis.condition_code,
                      'condition_label': diagnosis.condition_label, 'analysis_reference': diagnosis.analysis_reference},
        'analysis': {'id': analysis.pk, 'analysis_reference': analysis.analysis_reference, 'payload': analysis.payload} if analysis else None,
        'clinical': request_data['clinical'], 'proposals': proposed_rows,
        'knowledge_versions': knowledge_versions(medicines, profiles),
        'identity_versions': list(MedicineEntry.objects.order_by('id').values('id', 'content_hash')),
        'used_knowledge': [{'medicine': entry.content, 'profile': profiles[entry.pk].content} for entry in eligible],
        'omitted_unreviewed': [{'medicine_id': entry.pk, 'generic_name': entry.content['generic_name'],
                               'reason': 'Catalogue content or executable rule review is missing/outdated.'}
                              for entry in medicines if entry not in eligible],
    }
    matches = normalize_medicines(context.current_medicines) if context.medicine_status == 'confirmed' else []
    return eligible, profiles, snapshot, matches


@transaction.atomic
def propose_regimens(consultation_id, actor, request_data):
    consultation = get_object_or_404(Consultation.objects.select_for_update().select_related('doctor'), pk=consultation_id, doctor=actor)
    patient = User.objects.select_for_update().get(pk=consultation.patient_id)
    if not (patient.role == 'patient' and patient.is_active and patient.is_approved
            and consultation.doctor.role == 'doctor' and consultation.doctor.is_active and consultation.doctor.is_approved):
        raise ValidationError('An active approved doctor and patient are required.')
    eligible, profiles, snapshot, matches = prepare_screening_inputs(consultation, patient, actor, request_data)
    suggestions = suggest_regimens(eligible, profiles, snapshot, matches)
    return {'mode': 'rules_only_unranked', 'engine_version': ENGINE_VERSION, 'engine_hash': snapshot['engine_hash'],
            'consultation_id': str(consultation.pk), 'diagnosis_id': snapshot['diagnosis']['id'],
            'context_updated_at': snapshot['context']['updated_at'], 'approved': False, 'published': False,
            'suggestions': suggestions, 'plan_hash': plan_digest(snapshot, suggestions),
            'omitted_unreviewed': snapshot['omitted_unreviewed']}


def freshness_reason(draft):
    try:
        latest = PrescriptionDraft.objects.filter(consultation_id=draft.consultation_id).order_by('-revision').values_list('revision', flat=True).first()
        if latest != draft.revision:
            return 'A newer draft version exists. This immutable version remains available as history.'
        consultation = Consultation.objects.select_related('patient', 'doctor').get(pk=draft.consultation_id, doctor_id=draft.doctor_id, patient_id=draft.patient_id)
        patient = consultation.patient
        context = Context.objects.filter(patient=patient).first()
        diagnosis = Diagnosis.objects.filter(pk=draft.snapshot['diagnosis']['id'], consultation=consultation).first()
        if not (patient.is_active and patient.is_approved and consultation.doctor.is_active and consultation.doctor.is_approved and consultation.doctor.role == 'doctor'):
            return 'The linked patient or doctor is no longer approved/active.'
        birthday = patient.birthday.isoformat() if patient.birthday else None
        if birthday != draft.snapshot['patient']['birthday'] or context is None or context.updated_at.isoformat() != draft.snapshot['context']['updated_at']:
            return 'Registered DOB or patient information changed; regenerate after reviewing current inputs.'
        if diagnosis is None or diagnosis.analysis_reference != draft.snapshot['diagnosis']['analysis_reference'] or diagnosis.condition_code != draft.snapshot['diagnosis']['condition_code'] or diagnosis.condition_label != draft.snapshot['diagnosis']['condition_label']:
            return 'Confirmed diagnosis changed; regenerate after review.'
        analysis = Analysis.objects.filter(consultation=consultation).first()
        archived_analysis = draft.snapshot.get('analysis')
        if (analysis.pk if analysis else None) != (archived_analysis['id'] if archived_analysis else None) or (analysis and analysis.payload != archived_analysis['payload']):
            return 'Analysis evidence changed; regenerate after review.'
        today = timezone.localdate(timezone=ZoneInfo('Asia/Colombo')).isoformat()
        if today != draft.snapshot['as_of_date']:
            return 'Screening date changed; reassess current patient context and onset.'
        medicines = condition_medicines(draft.snapshot['diagnosis']['condition'])
        if list(MedicineEntry.objects.order_by('id').values('id', 'content_hash')) != draft.snapshot['identity_versions']:
            return 'Medicine identity knowledge changed; regenerate after reviewing current inputs.'
        if engine_digest() != draft.snapshot['engine_hash'] or knowledge_versions(medicines, get_profiles(medicines)) != draft.snapshot['knowledge_versions']:
            return 'Catalogue, rule code or clinician review changed; regenerate with current knowledge.'
        return None
    except (Consultation.DoesNotExist, KeyError, TypeError):
        return 'Saved inputs cannot be verified against the current encounter.'
