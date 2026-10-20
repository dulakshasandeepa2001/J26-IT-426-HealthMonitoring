from django.db import models
from django.conf import settings
import uuid


class LabRequest(models.Model):
    """
    FHIR ServiceRequest equivalent:
    Digital requisition lifecycle for laboratory tests.
    """
    PRIORITY_CHOICES = [
        ('routine', 'Routine'),
        ('urgent', 'Urgent'),
        ('stat', 'Emergency / STAT'),
    ]

    STATUS_CHOICES = [
        ('requested', 'Requested'),
        ('sample_collected', 'Sample Collected'),
        ('processing', 'Processing in Lab'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    request_id = models.AutoField(primary_key=True)
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='lab_requests'
    )
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prescribed_lab_requests'
    )
    test_type = models.CharField(max_length=150, help_text="e.g., Full Blood Count (CBC), Influenza PCR, Dengue Antigen")
    clinical_notes = models.TextField(blank=True, null=True, help_text="Symptoms, clinical suspicion, or indication")
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='requested')
    requested_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lab_requests'
        ordering = ['-requested_at']

    def __str__(self):
        return f"Req #{self.request_id} - {self.test_type} for {self.patient.username}"


class LabReport(models.Model):
    """
    FHIR DiagnosticReport equivalent:
    Represents an uploaded or structured lab test document with extraction metadata,
    safety gates, and mandatory physician review.
    """
    APPROVAL_STATUS_CHOICES = [
        ('draft', 'AI Draft (Needs Review)'),
        ('edited', 'Edited by Physician'),
        ('approved', 'Approved by Physician'),
        ('rejected', 'Rejected by Physician'),
    ]

    QUALITY_STATUS_CHOICES = [
        ('pass', 'Pass'),
        ('fail_blur', 'Failed (Image Blurred)'),
        ('fail_low_res', 'Failed (Low Resolution)'),
        ('not_checked', 'Not Checked'),
    ]

    report_id = models.AutoField(primary_key=True)
    lab_request = models.ForeignKey(
        LabRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reports'
    )
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='lab_reports'
    )
    lab_name = models.CharField(max_length=200, help_text="e.g., Asiri Central Lab, Lanka Hospitals, Durdans")
    report_title = models.CharField(max_length=200, help_text="e.g., Full Blood Count (FBC/CBC), Viral Panel")
    test_date = models.DateField(help_text="Date sample was taken")
    report_file = models.FileField(upload_to='lab_reports/%Y/%m/%d/', blank=True, null=True)
    file_type = models.CharField(max_length=20, default='image', choices=[('image', 'Image'), ('pdf', 'PDF')])
    
    # Image Quality Gate & OCR Extraction
    image_quality_status = models.CharField(max_length=30, choices=QUALITY_STATUS_CHOICES, default='not_checked')
    ocr_raw_text = models.TextField(blank=True, null=True, help_text="Raw OCR text extracted from report")
    overall_confidence = models.FloatField(default=0.0, help_text="Average OCR confidence score (0.0 to 1.0)")
    has_low_confidence_flag = models.BooleanField(default=False)

    # Physician-in-the-Loop Review Gate (FR11, Safety boundary)
    approval_status = models.CharField(max_length=20, choices=APPROVAL_STATUS_CHOICES, default='draft')
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_lab_reports'
    )
    physician_notes = models.TextField(blank=True, null=True, help_text="Physician clinical interpretation & advice")
    reviewed_at = models.DateTimeField(null=True, blank=True)

    # Downstream release gates
    is_dispatched_to_patient = models.BooleanField(default=False)
    contributed_to_surveillance = models.BooleanField(default=False)
    model_rule_version = models.CharField(max_length=50, default='v1.0.0-rules-2026')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'lab_reports'
        ordering = ['-test_date', '-created_at']

    def __str__(self):
        return f"Report #{self.report_id} - {self.report_title} ({self.get_approval_status_display()})"


class LabObservation(models.Model):
    """
    Atomic test parameter matching Table 15 Data Dictionary & LOINC:
    Stores individual parameters (Hemoglobin, Platelets, WBC, etc.)
    with confidence and reference range flags.
    """
    FLAG_CHOICES = [
        ('NORMAL', 'Normal'),
        ('LOW', 'Low'),
        ('HIGH', 'High'),
        ('CRITICAL_LOW', 'Critical Low'),
        ('CRITICAL_HIGH', 'Critical High'),
        ('ABNORMAL', 'Abnormal / Positive'),
        ('INDETERMINATE', 'Indeterminate'),
    ]

    observation_id = models.AutoField(primary_key=True)
    lab_report = models.ForeignKey(
        LabReport,
        on_delete=models.CASCADE,
        related_name='observations'
    )
    test_original_name = models.CharField(max_length=150, help_text="Original text printed on report, e.g. Haemoglobin")
    test_standard_code = models.CharField(max_length=50, help_text="LOINC standard code, e.g. 718-7")
    standard_name = models.CharField(max_length=200, help_text="LOINC canonical name")
    
    result_value = models.CharField(max_length=100, help_text="Text representation e.g. '13.5' or 'Positive'")
    numeric_value = models.FloatField(null=True, blank=True, help_text="Parsed numeric value for plotting")
    unit = models.CharField(max_length=50, blank=True, null=True, help_text="e.g., g/dL, 10^3/uL, /cumm")
    
    reference_range_raw = models.CharField(max_length=100, blank=True, null=True, help_text="e.g., 11.5 - 16.5")
    reference_min = models.FloatField(null=True, blank=True)
    reference_max = models.FloatField(null=True, blank=True)

    abnormal_flag = models.CharField(max_length=20, choices=FLAG_CHOICES, default='NORMAL')
    extraction_confidence = models.FloatField(default=1.0, help_text="Confidence of field extraction (0.0 to 1.0)")
    
    is_manually_edited = models.BooleanField(default=False)
    original_extracted_value = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        db_table = 'lab_observations'
        ordering = ['observation_id']

    def __str__(self):
        return f"{self.test_original_name}: {self.result_value} {self.unit or ''} [{self.abnormal_flag}]"


class DiseaseSurveillanceEvent(models.Model):
    """
    De-identified population intelligence event matching Table 15:
    Aggregated for trend forecasting and district hotspot clustering.
    No direct patient GPS points or names are stored here.
    """
    SOURCE_CHOICES = [
        ('symptom', 'Symptom Consultation'),
        ('diagnosis', 'Clinical Diagnosis'),
        ('lab', 'Verified Lab Evidence'),
        ('surveillance', 'Epidemiology Report'),
    ]

    VERIFICATION_CHOICES = [
        ('unverified', 'Unverified'),
        ('verified', 'Verified by Physician/Lab'),
        ('revoked', 'Revoked / False Positive'),
    ]

    event_key = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    condition_code = models.CharField(max_length=100, help_text="e.g. influenza, chickenpox, dengue, viral_gastro")
    event_date = models.DateField()
    report_week = models.CharField(max_length=20, help_text="ISO Week, e.g. 2026-W42")
    region_code = models.CharField(max_length=100, help_text="District or MOH area: e.g. Colombo, Gampaha, Kandy, Galle")
    
    source_type = models.CharField(max_length=30, choices=SOURCE_CHOICES, default='lab')
    verification_status = models.CharField(max_length=30, choices=VERIFICATION_CHOICES, default='verified')
    confidence_score = models.FloatField(default=1.0)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'disease_surveillance_events'
        ordering = ['-event_date']
        indexes = [
            models.Index(fields=['condition_code', 'event_date']),
            models.Index(fields=['region_code', 'report_week']),
        ]

    def __str__(self):
        return f"{self.condition_code} in {self.region_code} ({self.report_week})"


class LabAuditLog(models.Model):
    """
    Audit trail for safety, compliance, and legal traceability (FR14).
    Records every upload, OCR extraction, doctor edit, approval, and dispatch.
    """
    log_id = models.AutoField(primary_key=True)
    lab_report = models.ForeignKey(LabReport, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=100, help_text="e.g. UPLOAD, OCR_EXTRACT, PHYSICIAN_EDIT, APPROVE, REJECT, DISPATCH")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    actor_name = models.CharField(max_length=150, blank=True, null=True)
    actor_role = models.CharField(max_length=50, blank=True, null=True)
    details = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lab_audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f"{self.action} by {self.actor_name or 'System'} at {self.timestamp}"
