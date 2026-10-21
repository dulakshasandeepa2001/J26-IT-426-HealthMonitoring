from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db import transaction
from prescription_context.views import DoctorAccess
from .models import MedicineProposal, DoctorDecision
from .contracts import ProposalRequest, DecisionRequest
from . import services


def decision_data(row):
    return {'id': str(row.pk), 'revision': row.revision, 'action': row.action, 'selected_ids': row.selection,
            'reason': row.reason, 'doctor': row.doctor_id, 'created_at': row.created_at.isoformat(),
            'synthetic_only': True, 'published': False}


def proposal_data(row, actor, *, just_validated=False):
    # Only a newly validated service transition may reuse its own validation,
    # while the outer transaction still holds the clinical/authorization locks.
    # Reads and idempotent replays always calculate freshness again.
    return {'id': str(row.pk), 'consultation_id': str(row.consultation_id), 'draft_id': str(row.draft_id), 'revision': row.revision,
        'snapshot': row.snapshot, 'result': row.result, 'proposal_hash': services.proposal_hash(row),
        'current_state': {'is_current': True, 'reason': None} if just_validated else services.current_state(row, actor), 'created_at': row.created_at.isoformat(),
        'decisions': [decision_data(item) for item in sorted(row.decisions.all(), key=lambda item: item.revision, reverse=True)]}


class ProposalListView(DoctorAccess, APIView):
    def get(self, request, consultation_id):
        services.demo_scope(request.user, consultation_id)
        rows = MedicineProposal.objects.filter(consultation_id=consultation_id, doctor=request.user).select_related('draft').prefetch_related('decisions')
        if 'draft_id' in request.query_params:
            # The workspace needs only its newest proposal, not expensive
            # freshness checks for every historical proposal on every opening.
            draft_id = serializers.UUIDField().run_validation(request.query_params['draft_id'])
            rows = rows.filter(draft_id=draft_id).order_by('-revision')[:1]
        return Response([proposal_data(row, request.user) for row in rows])

    @transaction.atomic
    def post(self, request, consultation_id):
        contract = ProposalRequest(data=request.data)
        contract.is_valid(raise_exception=True)
        row, created = services.create_proposal(request.user, consultation_id, contract.validated_data)
        return Response(proposal_data(row, request.user, just_validated=created), status=201 if created else 200)


class ProposalDecisionView(DoctorAccess, APIView):
    @transaction.atomic
    def post(self, request, proposal_id):
        contract = DecisionRequest(data=request.data)
        contract.is_valid(raise_exception=True)
        row, created = services.decide(request.user, proposal_id, dict(contract.data))
        return Response({'decision': decision_data(row), 'proposal': proposal_data(row.proposal, request.user, just_validated=created)}, status=201 if created else 200)


class PrescriptionSlipView(DoctorAccess, APIView):
    def get(self, request, decision_id):
        row = services.slip(request.user, decision_id)
        return Response({'decision_id': str(row.pk), 'proposal_id': str(row.proposal_id),
            'consultation_id': str(row.proposal.consultation_id), 'approved_at': row.created_at.isoformat(),
            **row.snapshot, 'print_size': 'A6', 'valid_for_dispensing': False, 'published': False})


class DecisionHistoryView(DoctorAccess, APIView):
    def get(self, request):
        from django.conf import settings
        from rest_framework.exceptions import PermissionDenied
        if getattr(settings, 'PRESCRIPTION_EXPERIMENTAL_ML_ENABLED', False) is not True:
            raise PermissionDenied('Synthetic doctor-decision history is disabled.')
        result = []
        for row in DoctorDecision.objects.filter(doctor=request.user).select_related('proposal__draft').order_by('-created_at', '-revision'):
            state = services.current_state(row.proposal, request.user)
            latest = row.proposal.decisions.order_by('-revision').first()
            result.append({**decision_data(row), 'proposal_id': str(row.proposal_id), 'proposal_revision': row.proposal.revision,
                'patient': row.snapshot['patient'], 'condition': row.snapshot['condition'], 'current_state': state,
                'can_open_slip': row.action == 'approved' and state['is_current'] and latest.pk == row.pk
                    and row.snapshot['doctor'] == services.doctor_identity(request.user)})
        return Response(result)
