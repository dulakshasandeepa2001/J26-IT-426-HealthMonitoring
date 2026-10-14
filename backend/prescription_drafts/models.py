import uuid
from django.conf import settings
from django.db import models
from medicine_knowledge.models import content_digest


class SafetyProfile(models.Model):
    medicine = models.OneToOneField('medicine_knowledge.MedicineEntry', models.PROTECT, primary_key=True)
    content = models.JSONField()
    content_hash = models.CharField(max_length=64)
    medicine_content_hash = models.CharField(max_length=64)
    review_status = models.CharField(max_length=10, default='pending')
    reviewed_content_hash = models.CharField(max_length=64, blank=True)
    reviewed_engine_hash = models.CharField(max_length=64, blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, blank=True, null=True)
    reviewed_at = models.DateTimeField(blank=True, null=True)
    review_notes = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def review_is_current(self):
        from .profiles import engine_digest
        reviewer = self.reviewed_by
        return bool(self.review_status == 'reviewed' and self.reviewed_at and reviewer
                    and reviewer.role == 'doctor' and reviewer.is_active and reviewer.is_approved
                    and self.content_hash == self.reviewed_content_hash == content_digest(self.content)
                    and self.reviewed_engine_hash == engine_digest()
                    and self.medicine_content_hash == self.medicine.content_hash == content_digest(self.medicine.content))

    @property
    def effective_review_status(self):
        return 'pending' if self.review_status == 'reviewed' and not self.review_is_current else self.review_status


class SafetyReview(models.Model):
    profile = models.ForeignKey(SafetyProfile, models.PROTECT, related_name='reviews')
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, blank=True, null=True)
    decision = models.CharField(max_length=10)
    notes = models.TextField()
    content_snapshot = models.JSONField()
    content_hash = models.CharField(max_length=64)
    medicine_content_hash = models.CharField(max_length=64)
    engine_hash = models.CharField(max_length=64)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-recorded_at', '-id']


class PrescriptionDraft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Existing consultation tables belong to an unmigrated app. Binding/locking
    # is enforced by the service and scoped queries, without altering that schema.
    consultation_id = models.UUIDField(db_index=True)
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, related_name='screened_drafts')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, related_name='generated_drafts')
    revision = models.PositiveIntegerField()
    request_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)
    snapshot = models.JSONField()
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-revision']
        constraints = [
            models.UniqueConstraint(fields=['consultation_id', 'revision'], name='unique_draft_visit_revision'),
            models.UniqueConstraint(fields=['consultation_id', 'request_key'], name='unique_draft_visit_request'),
        ]
