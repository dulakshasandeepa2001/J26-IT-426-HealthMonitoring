from rest_framework import serializers
from prescription_context.analysis_contract import StrictSerializer


class ProposalRequest(StrictSerializer):
    draft_id = serializers.UUIDField()
    request_key = serializers.UUIDField()
    synthetic_demo = serializers.BooleanField()

    def validate_synthetic_demo(self, value):
        if value is not True:
            raise serializers.ValidationError('Explicit synthetic demo opt-in is required.')
        return value


class DecisionRequest(StrictSerializer):
    request_key = serializers.UUIDField()
    expected_revision = serializers.IntegerField(min_value=0)
    expected_proposal_hash = serializers.RegexField(r'^[a-f0-9]{64}$')
    action = serializers.ChoiceField(choices=('edited', 'approved', 'rejected'))
    selected_ids = serializers.ListField(child=serializers.CharField(max_length=100), max_length=16)
    reason = serializers.CharField(min_length=10, max_length=2000)
    reviewed = serializers.BooleanField()
    combination_reviewed = serializers.BooleanField(default=False)

    def validate(self, data):
        if data['reviewed'] is not True:
            raise serializers.ValidationError('Explicit doctor review is required.')
        if len(data['selected_ids']) != len(set(data['selected_ids'])):
            raise serializers.ValidationError('Duplicate medicine selections are not permitted.')
        if data['action'] == 'rejected' and data['selected_ids']:
            raise serializers.ValidationError('A rejected proposal has no selected medicines.')
        if data['action'] == 'approved' and not data['selected_ids']:
            raise serializers.ValidationError('Select at least one screened medicine before approval.')
        return data
