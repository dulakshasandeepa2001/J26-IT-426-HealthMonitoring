"""Immutable research-demo proposals and independently recorded doctor decisions."""
import uuid
from django.conf import settings
from django.db import models


class MedicineProposal(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    draft = models.ForeignKey('medicine_knowledge.PatientScreeningDraft', models.PROTECT)
    consultation_id = models.UUIDField(db_index=True)
    revision = models.PositiveIntegerField()
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    request_key = models.UUIDField()
    snapshot = models.JSONField()
    result = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at', '-revision']
        constraints = [models.UniqueConstraint(fields=['consultation_id', 'revision'], name='unique_proposal_visit_revision'),
            models.UniqueConstraint(fields=['consultation_id', 'request_key'], name='unique_proposal_request')]


class DoctorDecision(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    proposal = models.ForeignKey(MedicineProposal, models.PROTECT, related_name='decisions')
    revision = models.PositiveIntegerField()
    request_key = models.UUIDField()
    request_hash = models.CharField(max_length=64)
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, models.PROTECT)
    action = models.CharField(max_length=10, choices=[('edited', 'Edited'), ('approved', 'Approved'), ('rejected', 'Rejected')])
    selection = models.JSONField()
    reason = models.TextField()
    snapshot = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-revision']
        constraints = [models.UniqueConstraint(fields=['proposal', 'revision'], name='unique_proposal_decision_revision'),
            models.UniqueConstraint(fields=['proposal', 'request_key'], name='unique_proposal_decision_request')]
