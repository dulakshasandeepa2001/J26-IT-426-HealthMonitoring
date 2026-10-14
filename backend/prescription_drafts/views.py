from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from medicine_knowledge.models import MedicineEntry, content_digest
from medicine_knowledge.contracts import ReviewRequestSerializer
from prescription_context.views import DoctorAccess, filter_query
from .contracts import DraftRequestSerializer, RegimenRequestSerializer
from .models import PrescriptionDraft, SafetyProfile, SafetyReview
from .profiles import validate_profile, engine_digest
from .engine import ENGINE_VERSION
from .services import generate_draft, propose_regimens, draft_queryset, freshness_reason


class SafetyProfileSerializer(serializers.ModelSerializer):
    review_status = serializers.CharField(source='effective_review_status', read_only=True)
    review_is_current = serializers.BooleanField(read_only=True)
    catalogue_review_current = serializers.BooleanField(source='medicine.review_is_current', read_only=True)
    generic_name = serializers.CharField(source='medicine.content.generic_name', read_only=True)
    reviewer_name = serializers.SerializerMethodField()
    sources = serializers.SerializerMethodField()
    product = serializers.SerializerMethodField()
    conditions = serializers.SerializerMethodField()
    engine_version = serializers.SerializerMethodField()

    def get_engine_version(self, obj):
        return ENGINE_VERSION

    def get_product(self, obj):
        return {key: obj.medicine.content[key] for key in ('strength', 'form', 'route', 'standard_concept')}

    def get_conditions(self, obj):
        return [item['condition'] for item in obj.medicine.content['uses']]

    def get_reviewer_name(self, obj):
        return (obj.reviewed_by.get_full_name().strip() or obj.reviewed_by.username) if obj.reviewed_by else None

    def get_sources(self, obj):
        return [source for source in obj.medicine.content['sources'] if source['id'] in obj.content['source_ids']]

    class Meta:
        model = SafetyProfile
        fields = ('medicine', 'generic_name', 'content', 'content_hash', 'medicine_content_hash', 'review_status',
                  'review_is_current', 'catalogue_review_current', 'reviewer_name', 'reviewed_at', 'review_notes', 'updated_at', 'sources', 'product', 'conditions', 'engine_version')


class SafetyProfileViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = SafetyProfileSerializer
    lookup_value_regex = '[a-z0-9-]+'

    def get_queryset(self):
        query = SafetyProfile.objects.select_related('medicine', 'reviewed_by', 'medicine__reviewed_by').order_by('medicine_id')
        return filter_query(query, self.request, 'medicine', 'medicine_id', serializers.SlugField(max_length=100))

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        contract = ReviewRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        data = contract.validated_data
        with transaction.atomic():
            medicine = get_object_or_404(MedicineEntry.objects.select_for_update(), pk=pk)
            profile = get_object_or_404(self.get_queryset().select_for_update(of=('self',)), pk=pk)
            if data['expected_content_hash'] != profile.content_hash or data['expected_updated_at'] != profile.updated_at or profile.content_hash != content_digest(profile.content) or profile.medicine_content_hash != medicine.content_hash:
                return Response({'detail': 'Rules or bound medicine content changed. Refresh and review the current profile.'}, status=409)
            validate_profile(profile.content, medicine)
            profile.review_status = data['decision']
            profile.reviewed_content_hash = profile.content_hash
            profile.reviewed_engine_hash = engine_digest()
            profile.reviewed_by = request.user
            profile.reviewed_at = timezone.now()
            profile.review_notes = data['notes']
            profile.save()
            SafetyReview.objects.create(profile=profile, reviewer=request.user, decision=data['decision'], notes=data['notes'],
                content_snapshot=profile.content, content_hash=profile.content_hash,
                medicine_content_hash=profile.medicine_content_hash, engine_hash=profile.reviewed_engine_hash)
        return Response(self.get_serializer(profile).data)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        profile = self.get_object()
        return Response([{'id': row.pk, 'decision': row.decision, 'notes': row.notes,
            'reviewer_name': (row.reviewer.get_full_name().strip() or row.reviewer.username) if row.reviewer else 'Rule import',
            'recorded_at': row.recorded_at.isoformat(), 'version': row.content_snapshot['version'],
            'content_hash': row.content_hash, 'engine_hash': row.engine_hash} for row in profile.reviews.select_related('reviewer')])


class PrescriptionDraftSerializer(serializers.ModelSerializer):
    current_state = serializers.SerializerMethodField()

    def get_current_state(self, obj):
        reason = freshness_reason(obj)
        return {'is_current': reason is None, 'reason': reason}

    class Meta:
        model = PrescriptionDraft
        fields = ('id', 'consultation_id', 'patient', 'doctor', 'revision', 'request_key', 'snapshot', 'result', 'created_at', 'current_state')


class PrescriptionDraftViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = PrescriptionDraftSerializer

    def get_queryset(self):
        return filter_query(draft_queryset(self.request.user), self.request, 'consultation', 'consultation_id', serializers.UUIDField())

    @action(detail=False, methods=['post'], url_path='regimens/(?P<consultation_id>[0-9a-fA-F-]{36})')
    def regimens(self, request, consultation_id=None):
        contract = RegimenRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        return Response(propose_regimens(consultation_id, request.user, dict(contract.data)))

    @action(detail=False, methods=['post'], url_path='generate/(?P<consultation_id>[0-9a-fA-F-]{36})')
    def generate(self, request, consultation_id=None):
        contract = DraftRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        # Serialize dates/Decimals/UUIDs to stable JSON forms before fingerprinting.
        data = dict(contract.data)
        draft, created = generate_draft(consultation_id, request.user, data)
        return Response(self.get_serializer(draft).data, status=201 if created else 200)
