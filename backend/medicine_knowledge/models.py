import hashlib
import json

from django.conf import settings
from django.db import models


def content_digest(content):
    canonical = json.dumps(content, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(canonical.encode('utf-8')).hexdigest()


class MedicineEntry(models.Model):
    id = models.SlugField(max_length=100, primary_key=True)
    content = models.JSONField()
    content_hash = models.CharField(max_length=64)
    review_status = models.CharField(max_length=10, default='pending', choices=[
        ('pending', 'Pending'), ('reviewed', 'Reviewed'), ('rejected', 'Rejected'),
    ])
    reviewed_content_hash = models.CharField(max_length=64, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def review_is_current(self):
        reviewer = self.reviewed_by
        return bool(
            self.review_status == 'reviewed' and self.reviewed_at and reviewer
            and reviewer.is_active and reviewer.is_approved and reviewer.role == 'doctor'
            and self.reviewed_content_hash == self.content_hash == content_digest(self.content)
        )

    @property
    def effective_review_status(self):
        if self.review_status == 'reviewed' and not self.review_is_current:
            return 'pending'
        return self.review_status


class MedicineReview(models.Model):
    entry = models.ForeignKey(MedicineEntry, models.PROTECT, related_name='reviews')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, null=True, blank=True)
    decision = models.CharField(max_length=10)
    previous_status = models.CharField(max_length=10)
    notes = models.TextField()
    content_hash = models.CharField(max_length=64)
    content_snapshot = models.JSONField()
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-recorded_at', '-id']
