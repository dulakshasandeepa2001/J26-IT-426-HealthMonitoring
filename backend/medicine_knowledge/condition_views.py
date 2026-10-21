from django.db import transaction
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response

from prescription_context.views import DoctorAccess
from .condition_knowledge import definitions
from .additional_candidates import additional_definitions
from .contracts import ReviewRequestSerializer
from prescription_context.analysis_contract import StrictSerializer
from .models import ConditionKnowledge, ConditionKnowledgeReview, content_digest
from .reference_reviews import reference_only_scope
from .ors_reference import definition as ors_definition


def shipped_definitions():
    return definitions() + additional_definitions() + [ors_definition()]


class ScopeReviewRequestSerializer(ReviewRequestSerializer):
    review_scope = serializers.ChoiceField(choices=('executable', 'reference_only'), default='executable')


class ScopeVersionRequestSerializer(StrictSerializer):
    expected_content_hash = serializers.RegexField(r'^[a-f0-9]{64}$')
    expected_rules_hash = serializers.RegexField(r'^[a-f0-9]{64}$')
    expected_updated_at = serializers.DateTimeField()


class ConditionKnowledgeSerializer(serializers.ModelSerializer):
    content_review = serializers.SerializerMethodField()
    safety_review = serializers.SerializerMethodField()
    live_screening_enabled = serializers.SerializerMethodField()
    safety_review_mode = serializers.SerializerMethodField()

    def get_safety_review_mode(self, obj):
        return 'reference_only' if reference_only_scope(obj) else 'executable'

    def get_content_review(self, obj):
        return obj.review_state('content')

    def get_safety_review(self, obj):
        return obj.review_state('safety')

    def get_live_screening_enabled(self, obj):
        return False

    class Meta:
        model = ConditionKnowledge
        fields = ('id', 'medicine_id', 'condition', 'content', 'rules', 'content_hash', 'rules_hash',
                  'updated_at', 'content_review', 'safety_review', 'live_screening_enabled', 'safety_review_mode')


class ConditionKnowledgeViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = ConditionKnowledgeSerializer
    lookup_value_regex = '[a-z0-9-]+'

    def get_queryset(self):
        return ConditionKnowledge.objects.order_by('id').prefetch_related('reviews__reviewer')

    @action(detail=True, methods=['post'], url_path='refresh-version')
    def refresh_version(self, request, pk=None):
        contract = ScopeVersionRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        data = contract.validated_data
        existing_id = self.get_object().pk
        try:
            shipped = next((item for item in shipped_definitions() if item['id'] == existing_id), None)
        except (OSError, ValueError, KeyError, TypeError) as error:
            failure = APIException('The verified knowledge bundle is unavailable; no scope version was changed.')
            failure.status_code = 503
            raise failure from error
        if not shipped:
            raise ValidationError('No shipped version exists for this scope.')
        with transaction.atomic():
            row = self.get_queryset().select_for_update(of=('self',)).get(pk=existing_id)
            if any(data['expected_' + key] != getattr(row, key) for key in ('content_hash', 'rules_hash', 'updated_at')):
                return Response({'detail': 'Scope changed. Refresh the catalogue before updating its version.'}, status=409)
            if any(getattr(row, key) != value for key, value in shipped.items()):
                for key, value in shipped.items():
                    setattr(row, key, value)
                row.save()  # Preserve the audit history; never create an acceptance.
        return Response(self.get_serializer(self.get_queryset().get(pk=row.pk)).data)

    @action(detail=True, methods=['post'], url_path='review/(?P<kind>content|safety)')
    def review(self, request, pk=None, kind=None):
        contract = ScopeReviewRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        data = contract.validated_data
        reference_only = data['review_scope'] == 'reference_only'
        if reference_only and kind != 'safety':
            raise ValidationError('Reference safety acknowledgement is separate from content review.')
        try:
            # Reference acknowledgement concerns the exact stored evidence/gaps,
            # never approval of the current executable implementation.
            shipped = {} if reference_only else {row['id']: row for row in shipped_definitions()}
        except (OSError, ValueError, KeyError, TypeError) as error:
            failure = APIException('The versioned knowledge bundle changed or is unavailable. Refresh the imported scope before reviewing.')
            failure.status_code = 503
            raise failure from error
        with transaction.atomic():
            row = self.get_queryset().select_for_update(of=('self',)).get(pk=self.get_object().pk)
            expected = shipped.get(row.pk)
            key = 'content_hash' if kind == 'content' else 'rules_hash'
            if row.content_hash != content_digest(row.content) or row.rules_hash != content_digest(row.rules):
                return Response({'detail': 'Stored knowledge integrity changed. Refresh before reviewing.'}, status=409)
            if not reference_only and (not expected or any(getattr(row, name) != expected[name] for name in ('content', 'rules', 'content_hash', 'rules_hash'))):
                return Response({'detail': 'Imported knowledge changed. Refresh the current condition scope.'}, status=409)
            if data['expected_content_hash'] != getattr(row, key) or data['expected_updated_at'] != row.updated_at:
                return Response({'detail': 'This condition scope or review changed. Refresh before saving.'}, status=409)
            if reference_only and not reference_only_scope(row):
                raise ValidationError('This product has executable coverage. Review the executable safety scope instead.')
            if kind == 'safety' and data['decision'] == 'reviewed' and reference_only_scope(row) and not reference_only:
                raise ValidationError('Product identity or executable policy is unresolved. Safety rules cannot be marked reviewed until an exact product and appropriate rules are available.')
            state = row.review_state(kind)
            current = state['reference_review_is_current'] if reference_only else state['is_current']
            if data['decision'] == 'reviewed' and current and data['notes'] == state['notes']:
                return Response(self.get_serializer(row).data)  # Reuse real current review, no duplicate attestation.
            ConditionKnowledgeReview.objects.create(entry=row, kind=kind, decision=data['decision'], reviewer=request.user,
                notes=data['notes'], binding_hash=row.binding_hash(kind), snapshot={'content': row.content, 'rules': row.rules if kind == 'safety' else None,
                    'review_scope': data['review_scope'] if kind == 'safety' else 'content', 'executable_approval': not reference_only and kind == 'safety' and data['decision'] == 'reviewed'})
            row.save(update_fields=['updated_at'])
        return Response(self.get_serializer(self.get_queryset().get(pk=row.pk)).data)

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        row = self.get_object()
        return Response([{'id': review.pk, 'kind': review.kind, 'decision': review.decision, 'notes': review.notes,
            'reviewer_name': review.reviewer.get_full_name().strip() or review.reviewer.username,
            'recorded_at': review.recorded_at.isoformat(), 'binding_hash': review.binding_hash,
            'review_scope': review.snapshot.get('review_scope', 'executable' if review.kind == 'safety' else 'content')} for review in row.reviews.all()])
