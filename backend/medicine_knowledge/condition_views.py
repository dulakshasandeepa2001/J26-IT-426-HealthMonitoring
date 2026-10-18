from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from prescription_context.views import DoctorAccess
from .condition_knowledge import definitions
from .additional_candidates import additional_definitions
from .contracts import ReviewRequestSerializer
from .models import ConditionKnowledge, ConditionKnowledgeReview


class ConditionKnowledgeSerializer(serializers.ModelSerializer):
    content_review = serializers.SerializerMethodField()
    safety_review = serializers.SerializerMethodField()
    live_screening_enabled = serializers.SerializerMethodField()

    def get_content_review(self, obj):
        return obj.review_state('content')

    def get_safety_review(self, obj):
        return obj.review_state('safety')

    def get_live_screening_enabled(self, obj):
        return False

    class Meta:
        model = ConditionKnowledge
        fields = ('id', 'medicine_id', 'condition', 'content', 'rules', 'content_hash', 'rules_hash',
                  'updated_at', 'content_review', 'safety_review', 'live_screening_enabled')


class ConditionKnowledgeViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = ConditionKnowledgeSerializer
    lookup_value_regex = '[a-z0-9-]+'

    def get_queryset(self):
        return ConditionKnowledge.objects.order_by('id').prefetch_related('reviews__reviewer')

    @action(detail=True, methods=['post'], url_path='review/(?P<kind>content|safety)')
    def review(self, request, pk=None, kind=None):
        contract = ReviewRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        data = contract.validated_data
        try:
            shipped = {row['id']: row for row in definitions() + additional_definitions()}
        except (OSError, ValueError, KeyError, TypeError) as error:
            failure = APIException('The versioned knowledge bundle changed or is unavailable. Refresh the imported scope before reviewing.')
            failure.status_code = 503
            raise failure from error
        with transaction.atomic():
            row = self.get_queryset().select_for_update(of=('self',)).get(pk=self.get_object().pk)
            expected = shipped.get(row.pk)
            key = 'content_hash' if kind == 'content' else 'rules_hash'
            if not expected or any(getattr(row, name) != expected[name] for name in ('content', 'rules', 'content_hash', 'rules_hash')):
                return Response({'detail': 'Imported knowledge changed. Refresh the current condition scope.'}, status=409)
            if data['expected_content_hash'] != getattr(row, key) or data['expected_updated_at'] != row.updated_at:
                return Response({'detail': 'This condition scope or review changed. Refresh before saving.'}, status=409)
            if kind == 'safety' and data['decision'] == 'reviewed' and (row.content['identity_status'] in ('unresolved', 'reference_incomplete') or row.rules['policy']['handler'] == 'catalogue_only'):
                raise ValidationError('Product identity or executable policy is unresolved. Safety rules cannot be marked reviewed until an exact product and appropriate rules are available.')
            state = row.review_state(kind)
            if data['decision'] == 'reviewed' and state['is_current'] and data['notes'] == state['notes']:
                return Response(self.get_serializer(row).data)  # Reuse real current review, no duplicate attestation.
            ConditionKnowledgeReview.objects.create(entry=row, kind=kind, decision=data['decision'], reviewer=request.user,
                notes=data['notes'], binding_hash=row.binding_hash(kind), snapshot={'content': row.content, 'rules': row.rules if kind == 'safety' else None})
            row.save(update_fields=['updated_at'])
        return Response(self.get_serializer(self.get_queryset().get(pk=row.pk)).data)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        row = self.get_object()
        return Response([{'id': review.pk, 'kind': review.kind, 'decision': review.decision, 'notes': review.notes,
            'reviewer_name': review.reviewer.get_full_name().strip() or review.reviewer.username,
            'recorded_at': review.recorded_at.isoformat(), 'binding_hash': review.binding_hash} for review in row.reviews.all()])
