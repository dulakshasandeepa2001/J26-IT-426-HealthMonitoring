from rest_framework import serializers
from .models import LabRequest, LabReport, LabObservation, DiseaseSurveillanceEvent, LabAuditLog


class LabObservationSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabObservation
        fields = [
            'observation_id',
            'test_original_name',
            'test_standard_code',
            'standard_name',
            'result_value',
            'numeric_value',
            'unit',
            'reference_range_raw',
            'reference_min',
            'reference_max',
            'abnormal_flag',
            'extraction_confidence',
            'is_manually_edited',
            'original_extracted_value',
        ]


class LabAuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabAuditLog
        fields = ['log_id', 'action', 'actor_name', 'actor_role', 'details', 'timestamp']


class LabRequestSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source='patient.username', read_only=True)
    doctor_name = serializers.CharField(source='doctor.username', read_only=True)

    class Meta:
        model = LabRequest
        fields = [
            'request_id',
            'patient',
            'patient_name',
            'doctor',
            'doctor_name',
            'test_type',
            'clinical_notes',
            'lab_feedback',
            'priority',
            'status',
            'requested_at',
            'updated_at',
        ]


class LabReportSerializer(serializers.ModelSerializer):
    observations = LabObservationSerializer(many=True, read_only=True)
    audit_logs = LabAuditLogSerializer(many=True, read_only=True)
    patient_name = serializers.CharField(source='patient.username', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.username', read_only=True)
    lab_status = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = LabReport
        fields = [
            'report_id',
            'lab_request',
            'patient',
            'patient_name',
            'lab_name',
            'report_title',
            'test_date',
            'report_file',
            'file_url',
            'file_name',
            'file_type',
            'image_quality_status',
            'ocr_raw_text',
            'overall_confidence',
            'has_low_confidence_flag',
            'approval_status',
            'reviewed_by',
            'reviewed_by_name',
            'physician_notes',
            'reviewed_at',
            'lab_feedback',
            'lab_completed_at',
            'lab_status',
            'is_dispatched_to_patient',
            'contributed_to_surveillance',
            'model_rule_version',
            'created_at',
            'updated_at',
            'observations',
            'audit_logs',
        ]

    def get_lab_status(self, obj):
        if obj.lab_request:
            return obj.lab_request.status
        if obj.lab_completed_at:
            return 'completed'
        return 'processing' if obj.approval_status == 'approved' else 'requested'

    def get_file_url(self, obj):
        if obj.report_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.report_file.url)
            url = obj.report_file.url
            if url.startswith('/'):
                return f"http://127.0.0.1:8000{url}"
            return url
        return None

    def get_file_name(self, obj):
        if obj.report_file:
            import os
            return os.path.basename(obj.report_file.name)
        return None


class DiseaseSurveillanceEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiseaseSurveillanceEvent
        fields = '__all__'
