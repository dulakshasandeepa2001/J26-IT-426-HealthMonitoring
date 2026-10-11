import datetime
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
        
    )

    phone = models.CharField(max_length=15, blank=True, null=True)
    NIC_number = models.CharField(max_length=12, unique=True, blank=True, null=True)
    birthday = models.DateField(blank=True, null=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, blank=True, null=True)
    degrees = models.CharField(max_length=100, blank=True, null=True)
    university = models.CharField(max_length=100, blank=True, null=True)
    working_hospital = models.CharField(max_length=150, blank=True, null=True)
    doctorID = models.CharField(max_length=50, blank=True, null=True)
    is_approved = models.BooleanField(default=False)
    lab_name = models.CharField(max_length=150, blank=True, null=True)
    lab_address = models.CharField(max_length=255, blank=True, null=True)
    license_id = models.CharField(max_length=50, blank=True, null=True)

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
