from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from prescription_context.views import DoctorAccess
from .contracts import EntryContentSerializer, NormalizeRequestSerializer, ReviewRequestSerializer
from .models import MedicineEntry, MedicineReview, content_digest
from .serializers import MedicineEntrySerializer, MedicineReviewSerializer
from .services import normalize_medicines


class MedicineEntryViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = MedicineEntrySerializer
    lookup_value_regex = '[a-z0-9-]+'

    def get_queryset(self):
        return MedicineEntry.objects.select_related('reviewed_by').order_by('id')

    @action(detail=True, methods=['get'])
    def history(self, request, pk=None):
        entry = self.get_object()
        return Response(MedicineReviewSerializer(entry.reviews.select_related('reviewer'), many=True).data)

    @action(detail=True, methods=['post'])
    def review(self, request, pk=None):
        contract = ReviewRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        data = contract.validated_data
        with transaction.atomic():
            entry = self.get_queryset().select_for_update(of=('self',)).get(pk=self.get_object().pk)
            if (data['expected_content_hash'] != entry.content_hash
                    or data['expected_updated_at'] != entry.updated_at
                    or entry.content_hash != content_digest(entry.content)):
                return Response({'detail': 'Catalogue content or review has changed. Refresh and review the latest entry.'}, status=409)
            content = EntryContentSerializer(data=entry.content)
            content.is_valid(raise_exception=True)
            previous_status = entry.review_status
            entry.review_status = data['decision']
            entry.reviewed_by = request.user
            entry.reviewed_at = timezone.now()
            entry.reviewed_content_hash = entry.content_hash
            entry.review_notes = data['notes']
            entry.save()
            MedicineReview.objects.create(
                entry=entry, reviewer=request.user, decision=data['decision'],
                previous_status=previous_status, notes=data['notes'],
                content_hash=entry.content_hash, content_snapshot=entry.content,
            )
        return Response(self.get_serializer(entry).data)

    @action(detail=False, methods=['post'], url_path='normalize')
    def normalize(self, request):
        contract = NormalizeRequestSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        return Response({'results': normalize_medicines(contract.validated_data['names']), 'safety_assessed': False})
