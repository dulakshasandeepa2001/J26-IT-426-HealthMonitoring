from django.db import models
from django.conf import settings

class PrescriptionContextConsultation(models.Model):
    id = models.UUIDField(primary_key=True)
    started_at = models.DateTimeField()
    reason = models.CharField(max_length=300)
    is_demo = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, blank=True, null=True, related_name='assigned_consultations')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, related_name='doctor_consultations')
    patient = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, related_name='patient_consultations')

    class Meta:
        db_table = 'prescription_context_consultation'

class PrescriptionContextConsultationanalysis(models.Model):
    id = models.BigAutoField(primary_key=True)
    analysis_reference = models.CharField(max_length=150)
    payload = models.JSONField()
    imported_at = models.DateTimeField(auto_now_add=True)
    consultation = models.OneToOneField(PrescriptionContextConsultation, models.DO_NOTHING)
    imported_by = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, related_name='imported_analyses')

    class Meta:
        db_table = 'prescription_context_consultationanalysis'

class PrescriptionContextPatientcontext(models.Model):
    id = models.BigAutoField(primary_key=True)
    date_of_birth = models.DateField(blank=True, null=True)
    weight = models.DecimalField(max_digits=6, decimal_places=2, blank=True, null=True)
    weight_unit = models.CharField(max_length=2, blank=True, null=True)
    allergy_status = models.CharField(max_length=10)
    allergies = models.JSONField(default=list)
    medicine_status = models.CharField(max_length=10)
    current_medicines = models.JSONField(default=list)
    provenance = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)
    patient = models.OneToOneField(settings.AUTH_USER_MODEL, models.DO_NOTHING, related_name='patient_context')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, related_name='updated_patient_contexts')

    class Meta:
        db_table = 'prescription_context_patientcontext'

class PrescriptionContextContextrevision(models.Model):
    id = models.BigAutoField(primary_key=True)
    snapshot = models.JSONField()
    changed_fields = models.JSONField()
    recorded_at = models.DateTimeField(auto_now_add=True)
    consultation = models.ForeignKey(PrescriptionContextConsultation, models.DO_NOTHING, related_name='revisions')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, related_name='doctor_context_revisions')
    context = models.ForeignKey(PrescriptionContextPatientcontext, models.DO_NOTHING, related_name='revisions')

    class Meta:
        db_table = 'prescription_context_contextrevision'

class PrescriptionContextDiagnosisconfirmation(models.Model):
    id = models.BigAutoField(primary_key=True)
    condition_code = models.CharField(max_length=30)
    condition_label = models.CharField(max_length=200)
    analysis_reference = models.CharField(max_length=150, blank=True, null=True)
    confirmed_at = models.DateTimeField(auto_now_add=True)
    consultation = models.ForeignKey(PrescriptionContextConsultation, models.DO_NOTHING, related_name='diagnoses')
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, models.DO_NOTHING, related_name='doctor_diagnoses')

    class Meta:
        db_table = 'prescription_context_diagnosisconfirmation'
