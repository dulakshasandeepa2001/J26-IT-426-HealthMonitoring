import json
import hashlib
from pathlib import Path
from django.db import transaction
from rest_framework.exceptions import ValidationError
from medicine_knowledge.models import MedicineEntry, content_digest
from .models import SafetyProfile, SafetyReview


PROFILE_IDS = {
    'paracetamol-500mg-tablet': 'paracetamol', 'oseltamivir-75mg-capsule': 'oseltamivir',
    'acyclovir-800mg-tablet': 'acyclovir', 'calamine-zinc-oxide-lotion': 'calamine',
}


def engine_digest():
    root = Path(__file__).resolve().parent
    files = ('engine.py', 'profiles.py', 'contracts.py', 'services.py', 'models.py', 'data/safety_profiles.json',
             '../medicine_knowledge/services.py', '../prescription_context/patient_data.py')
    return hashlib.sha256(b''.join((root / name).read_bytes() for name in files)).hexdigest()


def validate_profile(content, medicine):
    if content.get('schema_version') != '1.0' or content.get('kind') != PROFILE_IDS.get(medicine.pk):
        raise ValidationError('Unsupported medicine safety profile identity/version.')
    source_ids = {item['id'] for item in medicine.content['sources']}
    if not content.get('source_ids') or set(content['source_ids']) - source_ids:
        raise ValidationError('Rules must reference evidence in the bound medicine entry.')
    allowed = {'schema_version', 'version', 'kind', 'scope', 'source_ids', 'source_sections', 'allergy_names', 'parameters'}
    if set(content) != allowed or not isinstance(content['scope'], str) or not content['scope']:
        raise ValidationError('Invalid rule content fields.')
    # Numerical policies are shipped as a fixed reviewed code/data pair. A direct
    # JSON edit cannot introduce a new executable threshold without a code version.
    bundled = bundled_profiles()[medicine.pk]
    if content != bundled:
        raise ValidationError('The executable profile must match this shipped rule version. Update and review the code/data pair together.')


def bundled_profiles():
    path = Path(__file__).resolve().parent / 'data' / 'safety_profiles.json'
    return json.loads(path.read_text(encoding='utf-8'))


@transaction.atomic
def seed_profiles():
    result = {'created': 0, 'updated': 0, 'unchanged': 0}
    for medicine_id, content in sorted(bundled_profiles().items()):
        medicine = MedicineEntry.objects.select_for_update().get(pk=medicine_id)
        validate_profile(content, medicine)
        profile = SafetyProfile.objects.select_for_update().filter(pk=medicine_id).first()
        digest = content_digest(content)
        if profile and profile.content_hash == digest and profile.content == content and profile.medicine_content_hash == medicine.content_hash:
            result['unchanged'] += 1
            continue
        result['created' if profile is None else 'updated'] += 1
        if profile is None:
            profile = SafetyProfile(medicine=medicine)
        profile.content, profile.content_hash = content, digest
        profile.medicine_content_hash = medicine.content_hash
        profile.review_status = 'pending'
        profile.reviewed_content_hash = ''
        profile.reviewed_engine_hash = ''
        profile.reviewed_by = profile.reviewed_at = None
        profile.review_notes = ''
        profile.save()
        SafetyReview.objects.create(profile=profile, decision='pending', notes='Imported executable rule profile; clinical review required.',
            content_snapshot=content, content_hash=digest, medicine_content_hash=medicine.content_hash, engine_hash=engine_digest())
    return result
