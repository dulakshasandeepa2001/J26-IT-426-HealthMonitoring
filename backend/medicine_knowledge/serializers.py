from rest_framework import serializers
from .models import MedicineEntry, MedicineReview


class MedicineEntrySerializer(serializers.ModelSerializer):
    review_status = serializers.CharField(source='effective_review_status', read_only=True)
    review_is_current = serializers.BooleanField(read_only=True)
    reviewer_name = serializers.SerializerMethodField()

    def get_reviewer_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.get_full_name().strip() or obj.reviewed_by.username

    class Meta:
        model = MedicineEntry
        fields = ('id', 'content', 'content_hash', 'review_status', 'review_is_current',
                  'reviewed_by', 'reviewer_name', 'reviewed_at', 'review_notes', 'updated_at')


class MedicineReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.SerializerMethodField()
    catalogue_version = serializers.SerializerMethodField()

    def get_catalogue_version(self, obj):
        return obj.content_snapshot['catalogue_version']

    def get_reviewer_name(self, obj):
        if not obj.reviewer:
            return 'Catalogue import'
        return obj.reviewer.get_full_name().strip() or obj.reviewer.username

    class Meta:
        model = MedicineReview
        fields = ('id', 'reviewer', 'reviewer_name', 'decision', 'previous_status', 'notes', 'content_hash', 'catalogue_version', 'recorded_at')
