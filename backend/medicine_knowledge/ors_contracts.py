"""Independent facts for the new exact ORS scope; missing is never normal."""
from rest_framework import serializers
from .selected_interactions import SelectedClinicalSerializer, SelectedPreviewSerializer, SelectedSaveSerializer


class CompleteClinicalSerializer(SelectedClinicalSerializer):
    ors_product_assessment = serializers.ChoiceField(choices=('unknown', 'exact_reference_confirmed', 'different_or_unverified'), default='unknown')
    ors_metabolic_assessment = serializers.ChoiceField(choices=('unknown', 'standard', 'requires_review'), default='unknown')
    ors_dietary_assessment = serializers.ChoiceField(choices=('unknown', 'no_restrictions', 'requires_review'), default='unknown')
    ors_obstruction_assessment = serializers.ChoiceField(choices=('unknown', 'none', 'suspected'), default='unknown')


class CompletePreviewSerializer(SelectedPreviewSerializer):
    clinical = CompleteClinicalSerializer()


class CompleteSaveSerializer(SelectedSaveSerializer):
    clinical = CompleteClinicalSerializer()
