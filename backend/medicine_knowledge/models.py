import hashlib
import json
import uuid

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


class ConditionKnowledge(models.Model):
    """Additional condition scope, independent of an already-reviewed pilot entry."""

    id = models.SlugField(max_length=100, primary_key=True)
    medicine_id = models.SlugField(max_length=100)
    condition = models.SlugField(max_length=100)
    content = models.JSONField()
    rules = models.JSONField()
    content_hash = models.CharField(max_length=64)
    rules_hash = models.CharField(max_length=64)
    updated_at = models.DateTimeField(auto_now=True)

    def binding_hash(self, kind):
        return self.content_hash if kind == 'content' else content_digest({
            'content_hash': self.content_hash, 'rules_hash': self.rules_hash,
        })

    def review_state(self, kind):
        from .condition_knowledge import rule_bindings
        from .reference_reviews import reference_only_scope
        latest = next((row for row in self.reviews.all() if row.kind == kind), None)
        reference_only = bool(kind == 'safety' and latest and latest.snapshot.get('review_scope') == 'reference_only')
        intact = self.content_hash == content_digest(self.content)
        if kind == 'safety':
            intact = intact and self.rules_hash == content_digest(self.rules)
            if not reference_only and self.rules.get('implementation_bindings'):
                intact = intact and self.rules['implementation_bindings'] == rule_bindings()
            if not reference_only and 'clinical_implementation_bindings' in self.rules:
                from .additional_candidates import clinical_bindings
                intact = intact and self.rules['clinical_implementation_bindings'] == clinical_bindings()
        reason = None
        if not latest:
            reason = 'This condition scope has not been reviewed.'
        elif latest.binding_hash != self.binding_hash(kind) or not intact:
            reason = 'The reviewed content or rule implementation has changed.'
        elif not (latest.reviewer.is_active and latest.reviewer.is_approved and latest.reviewer.role == 'doctor'):
            reason = 'The previous reviewer is no longer an active approved doctor.'
        current = reason is None and latest.decision == 'reviewed'
        # A genuine review of reference evidence/gaps is saved and reused, but
        # can never satisfy the executable safety gate used by screening.
        executable_gap = kind == 'safety' and reference_only_scope(self)
        display_reason = reason
        if not reason and reference_only:
            display_reason = 'Reference scope decision only; executable safety coverage remains incomplete.'
        elif not reason and executable_gap:
            display_reason = 'Exact product or executable rules remain incomplete.'
        return {
            'status': latest.decision if latest and reason is None else 'pending',
            'is_current': current and not reference_only and not executable_gap, 'reason': display_reason,
            'review_scope': 'reference_only' if reference_only else 'executable' if kind == 'safety' else 'content',
            'reference_review_is_current': current and reference_only,
            'reviewer_name': (latest.reviewer.get_full_name().strip() or latest.reviewer.username) if latest else None,
            'reviewed_at': latest.recorded_at.isoformat() if latest else None,
            'notes': latest.notes if latest else '',
        }


class ConditionKnowledgeReview(models.Model):
    entry = models.ForeignKey(ConditionKnowledge, models.PROTECT, related_name='reviews')
    kind = models.CharField(max_length=10, choices=[('content', 'Content'), ('safety', 'Safety rules')])
    decision = models.CharField(max_length=10, choices=[('pending', 'Pending'), ('reviewed', 'Reviewed'), ('rejected', 'Rejected')])
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    notes = models.TextField()
    binding_hash = models.CharField(max_length=64)
    snapshot = models.JSONField()
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-recorded_at', '-id']


class PatientScreeningDraft(models.Model):
    """Private encounter draft. Never an ML training row or published prescription."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation_id = models.UUIDField(db_index=True)
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, related_name='six_condition_drafts')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT, related_name='six_condition_authored_drafts')
    request_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)
    revision = models.PositiveIntegerField()
    snapshot = models.JSONField()
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-revision']
        constraints = [
            models.UniqueConstraint(fields=['consultation_id', 'revision'], name='unique_six_condition_revision'),
            models.UniqueConstraint(fields=['consultation_id', 'request_key'], name='unique_six_condition_request'),
        ]
