"""Patient identity comes from registration, not a submitted clinical form."""

from zoneinfo import ZoneInfo
from django.utils import timezone


def patient_age(birthday):
    today = timezone.localdate(timezone=ZoneInfo('Asia/Colombo'))
    if birthday is None:
        return None, 'missing'
    if birthday > today:
        return None, 'future'
    years = today.year - birthday.year - ((today.month, today.day) < (birthday.month, birthday.day))
    return years, 'valid'


def context_snapshot(context):
    return {
        'date_of_birth': context.date_of_birth.isoformat() if context.date_of_birth else None,
        'allergy_status': context.allergy_status,
        'allergies': context.allergies,
        'medicine_status': context.medicine_status,
        'current_medicines': context.current_medicines,
    }
