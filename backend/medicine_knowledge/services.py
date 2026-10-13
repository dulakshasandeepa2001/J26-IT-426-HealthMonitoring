import json
from pathlib import Path

from django.db import transaction
from rest_framework.exceptions import ValidationError

from .contracts import EntryContentSerializer, normalize_name
from .models import MedicineEntry, MedicineReview, content_digest


def bundled_entries():
    path = Path(__file__).resolve().parent / 'data' / 'pilot_catalogue.json'
    raw = json.loads(path.read_text(encoding='utf-8'))
    entries = []
    for item in raw:
        contract = EntryContentSerializer(data=item)
        contract.is_valid(raise_exception=True)
        # Dates must be JSON strings, never Python date objects in JSONField.
        entries.append(dict(contract.data))
    ids = [item['id'] for item in entries]
    if len(ids) != len(set(ids)):
        raise ValidationError('Duplicate catalogue entry IDs.')
    return entries


@transaction.atomic
def seed_catalogue():
    created = updated = unchanged = 0
    for content in bundled_entries():
        digest = content_digest(content)
        entry = MedicineEntry.objects.select_for_update().filter(pk=content['id']).first()
        if entry and entry.content_hash == digest and entry.content == content:
            unchanged += 1
            continue
        if entry is None:
            entry = MedicineEntry(id=content['id'])
            created += 1
        else:
            updated += 1
        previous_status = entry.review_status
        entry.content, entry.content_hash = content, digest
        entry.review_status = 'pending'
        entry.reviewed_by = entry.reviewed_at = None
        entry.reviewed_content_hash = ''
        entry.review_notes = ''
        entry.save()
        MedicineReview.objects.create(
            entry=entry, reviewer=None, decision='pending', previous_status=previous_status,
            notes='Imported catalogue content; clinician review required.',
            content_hash=digest, content_snapshot=content,
        )
    return {'created': created, 'updated': updated, 'unchanged': unchanged}


def reviewed_entries():
    """Content gate for later candidate generation; never a patient safety decision."""
    return [entry for entry in MedicineEntry.objects.select_related('reviewed_by').filter(review_status='reviewed')
            if entry.review_is_current]


def normalize_medicines(names):
    entries = list(MedicineEntry.objects.select_related('reviewed_by').all())
    results = []
    for name in names:
        key = normalize_name(name)
        matches = []
        for entry in entries:
            for alias in entry.content['aliases']:
                if normalize_name(alias['name']) == key:
                    product = alias['level'] == 'product'
                    matches.append({
                        'entry_id': entry.pk, 'generic_name': entry.content['generic_name'],
                        'match_level': alias['level'], 'matched_alias': alias['name'],
                        'ingredients': [item['name'] for item in entry.content['ingredients']],
                        # Ingredient-only input cannot establish strength, form, route or product RxCUI.
                        'standard_concept': entry.content['standard_concept'] if product else None,
                        'review_status': entry.effective_review_status,
                    })
        status = 'recognized' if len(matches) == 1 else 'ambiguous' if matches else 'unrecognized'
        reason = ('Strength and formulation must be clarified.' if len(matches) == 1 and matches[0]['match_level'] == 'ingredient'
                  else 'No exact supported alias; check the full product name and ingredients.' if not matches
                  else 'Multiple catalogue matches; choose the exact product.' if len(matches) > 1
                  else 'Identity match only; clinical safety has not been assessed.')
        results.append({'input': name, 'status': status, 'requires_clarification':
                        status != 'recognized' or matches[0]['match_level'] == 'ingredient',
                        'reason': reason, 'matches': matches})
    return results
