import datetime
import hashlib
from django.contrib.auth import base_user
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model extending Django's AbstractUser.
    """
    ROLE_CHOICES = (
        ('doctor', 'Doctor'),
        ('patient', 'Patient'),
        ('lab', 'Lab'),
        ('medical_officer', 'Medical Officer / PHI'),
    )

    phone = models.CharField(max_length=15, blank=True, null=True)
    NIC_number = models.CharField(max_length=12, unique=True, blank=True, null=True)
    birthday = models.DateField(blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, blank=True, null=True)
    degrees = models.CharField(max_length=100, blank=True, null=True)
    university = models.CharField(max_length=100, blank=True, null=True)
    working_hospital = models.CharField(max_length=150, blank=True, null=True)
    slmc_reg_no = models.CharField(max_length=50, blank=True, null=True)
    is_slmc_verified = models.BooleanField(default=False)
    slmc_verified_at = models.DateTimeField(blank=True, null=True)
    doctorID = models.CharField(max_length=50, blank=True, null=True)
    is_approved = models.BooleanField(default=False)
    lab_name = models.CharField(max_length=150, blank=True, null=True)
    lab_address = models.CharField(max_length=255, blank=True, null=True)
    license_id = models.CharField(max_length=50, blank=True, null=True)

    @property
    def officer_id(self):
        return self.doctorID or self.license_id

    @property
    def assigned_area(self):
        return self.working_hospital

    @property
    def moh_office(self):
        return self.lab_name

    def __str__(self):
        return self.username


class Doctor(models.Model):
    doctor_id = models.CharField(max_length=50, unique=True)
    register_id = models.CharField(max_length=100, unique=True)
    doctor_nicnumber = models.CharField(max_length=20, unique=True)
    doctors_name = models.CharField(max_length=150)
    dob = models.DateField()
    degrees = models.CharField(max_length=100)
    university = models.CharField(max_length=100)
    working_hospital = models.CharField(max_length=150)

    def __str__(self):
        return self.doctors_name

    class Meta:
        db_table = 'register_DoctorID'


class PendingDoctor(models.Model):
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    password = models.CharField(max_length=128)
    phone = models.CharField(max_length=15)
    NIC_number = models.CharField(max_length=12, unique=True)
    birthday = models.DateField()
    degrees = models.CharField(max_length=100, blank=True, null=True)
    university = models.CharField(max_length=100, blank=True, null=True)
    working_hospital = models.CharField(max_length=150, blank=True, null=True)
    slmc_reg_no = models.CharField(max_length=50, blank=True, null=True)
    is_slmc_verified = models.BooleanField(default=False)
    slmc_verified_at = models.DateTimeField(blank=True, null=True)
    status = models.CharField(
        max_length=20,
        choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')],
        default='pending'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.username} - {self.status}"

    class Meta:
        db_table = 'pending_doctors'


class Laborator(models.Model):
    username = models.CharField(max_length=100)
    password = models.CharField(max_length=100)
    role = models.CharField(max_length=20, blank=True, null=True, default="lab")
    email = models.EmailField(max_length=100)
    phone = models.CharField(max_length=100)
    NIC_number = models.CharField(max_length=12, unique=True, blank=True, null=True)
    birthday = models.DateField(blank=True, null=True)
    lab_name = models.CharField(max_length=150, blank=True, null=True)
    lab_address = models.CharField(max_length=255, blank=True, null=True)
    license_id = models.CharField(max_length=50, blank=True, null=True)
    def __str__(self):
        return self.lab_name
    
    class Meta:
        db_table = 'laborator'


class Appointment(models.Model):
    STATUS_CHOICES = (
        ('booked', 'Booked / Waiting'),
        ('serving', 'Now Serving'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    )

    id = models.AutoField(primary_key=True)
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='appointments')
    doctor_id = models.CharField(max_length=50)
    doctor_name = models.CharField(max_length=150)
    hospital_name = models.CharField(max_length=200, blank=True, null=True)
    appointment_date = models.DateField()
    session_start_time = models.TimeField(blank=True, null=True)
    session_end_time = models.TimeField(blank=True, null=True)
    token_number = models.IntegerField()
    token_label = models.CharField(max_length=10)
    estimated_time = models.CharField(max_length=50, blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='booked')
    reason = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'patient_appointments'
        ordering = ['appointment_date', 'token_number']
        unique_together = ('doctor_id', 'appointment_date', 'token_number')

    def __str__(self):
        return f"{self.token_label} - {self.doctor_name} on {self.appointment_date} ({self.patient.username})"


class DoctorLiveAvailability(models.Model):
    doctor_id = models.CharField(max_length=50, unique=True)
    doctor_name = models.CharField(max_length=150)
    is_available = models.BooleanField(default=False)
    available_until = models.TimeField(blank=True, null=True)
    available_date = models.DateField(default=datetime.date.today)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'doctor_live_availability'

    def __str__(self):
        status = f"Available until {self.available_until}" if self.is_available else "Offline"
        return f"{self.doctor_name} ({self.doctor_id}) - {status}"


class PatientFamilyProfile(models.Model):
    """
    Stores mother's name, father's name, and generated family_unit_id to link
    patients into a Family Tree. Tracks familial/hereditary diseases and drug allergies.
    """
    patient = models.OneToOneField(User, on_delete=models.CASCADE, related_name='family_profile')
    mother_name = models.CharField(max_length=150)
    father_name = models.CharField(max_length=150)
    mother_nic = models.CharField(max_length=20, blank=True, null=True)
    father_nic = models.CharField(max_length=20, blank=True, null=True)
    family_unit_id = models.CharField(max_length=32, db_index=True)
    
    # Hereditary risk factors (e.g. ['Type 2 Diabetes', 'Hypertension', 'Asthma', 'Thalassemia', 'Cardiovascular Disease'])
    hereditary_risks = models.JSONField(default=list, blank=True)
    
    # Family documented drug allergies (e.g. [{'relative': 'Mother', 'allergen': 'Penicillin', 'severity': 'Anaphylaxis'}])
    family_allergies = models.JSONField(default=list, blank=True)
    
    # Intra-household infection monitoring (e.g. [{'relative': 'Brother', 'disease': 'Dengue', 'date': '2026-11-20'}])
    household_exposures = models.JSONField(default=list, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @staticmethod
    def compute_family_unit_id(mother_name, father_name):
        norm_m = ''.join(e.lower() for e in (mother_name or '').strip() if e.isalnum())
        norm_f = ''.join(e.lower() for e in (father_name or '').strip() if e.isalnum())
        combo = f"m:{norm_m}|f:{norm_f}"
        digest = hashlib.sha256(combo.encode('utf-8')).hexdigest()[:12].upper()
        return f"FAM-{digest}"

    def save(self, *args, **kwargs):
        if not self.family_unit_id:
            self.family_unit_id = self.compute_family_unit_id(self.mother_name, self.father_name)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Family {self.family_unit_id} - Patient {self.patient.username}"

    class Meta:
        db_table = 'patient_family_profile'


class PatientLocationTracking(models.Model):
    """
    Stores Google / GPS coordinates and mobility proximity to track disease cluster exposure.
    """
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='location_logs')
    latitude = models.FloatField(blank=True, null=True)
    longitude = models.FloatField(blank=True, null=True)
    area_name = models.CharField(max_length=150, blank=True, null=True)
    risk_zone_level = models.CharField(max_length=20, default='low')  # low, moderate, high_cluster
    stay_duration_minutes = models.IntegerField(default=0)
    close_contact_exposure = models.JSONField(default=dict, blank=True) # e.g. {"disease": "Influenza", "contact_duration_minutes": 45, "index_patient_id": 408}
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'patient_location_tracking'
        ordering = ['-recorded_at']


class PatientLabRecord(models.Model):
    """
    Stores structured laboratory test reports (FBC, Liver, Renal, NS1, HbA1c)
    used for automated clinical validation and contraindication screening.
    """
    patient = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lab_records')
    test_name = models.CharField(max_length=120) # e.g. 'Full Blood Count (FBC)', 'Renal Function Profile', 'NS1 Dengue Antigen'
    test_date = models.DateField(default=datetime.date.today)
    metrics = models.JSONField(default=dict) # e.g. {'platelets': 185000, 'wbc': 6500, 'creatinine': 0.9, 'alt_sgpt': 25, 'ns1_antigen': 'Negative'}
    clinical_flags = models.JSONField(default=list, blank=True) # e.g. ['Normal Platelet Count', 'Normal Renal Function']
    lab_name = models.CharField(max_length=150, blank=True, null=True)
    verified_by = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'patient_lab_records'
        ordering = ['-test_date', '-created_at']

