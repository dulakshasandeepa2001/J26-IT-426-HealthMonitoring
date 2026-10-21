from rest_framework import serializers
from accounts.models import User
from .access import assigned_patients
from .patient_data import patient_age
from .models import (
    PrescriptionContextConsultation,
    PrescriptionContextConsultationanalysis,
    PrescriptionContextPatientcontext,
    PrescriptionContextContextrevision,
    PrescriptionContextDiagnosisconfirmation,
)

class PatientSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    age_years = serializers.SerializerMethodField()
    dob_status = serializers.SerializerMethodField()

    def get_display_name(self, obj):
        return obj.get_full_name().strip() or obj.username

    def get_age_years(self, obj):
        return patient_age(obj.birthday)[0]

    def get_dob_status(self, obj):
        return patient_age(obj.birthday)[1]

    class Meta:
        model = User
        fields = ('id', 'username', 'display_name', 'birthday', 'age_years', 'dob_status')


class ConsultationSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()

    def get_patient_name(self, obj):
        return obj.patient.get_full_name().strip() or obj.patient.username

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        self.fields['patient'].queryset = (
            assigned_patients(request.user) if request and request.user else User.objects.none()
        )

    class Meta:
        model = PrescriptionContextConsultation
        fields = '__all__'
        read_only_fields = ('id', 'doctor', 'assigned_by', 'started_at', 'created_at', 'is_demo')


class AssignmentDoctorSerializer(PatientSerializer):
    class Meta(PatientSerializer.Meta):
        fields = ('id', 'username', 'display_name', 'doctorID', 'working_hospital')


class AdminAssignmentSerializer(serializers.ModelSerializer):
    doctor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='doctor', is_active=True, is_approved=True),
    )
    patient = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role='patient', is_active=True, is_approved=True),
    )
    doctor_name = serializers.SerializerMethodField()
    patient_name = serializers.SerializerMethodField()
    is_demo = serializers.BooleanField(default=True)

    def get_doctor_name(self, obj):
        return obj.doctor.get_full_name().strip() or obj.doctor.username

    def get_patient_name(self, obj):
        return obj.patient.get_full_name().strip() or obj.patient.username

    class Meta:
        model = PrescriptionContextConsultation
        fields = (
            'id', 'doctor', 'doctor_name', 'patient', 'patient_name', 'reason',
            'is_demo', 'assigned_by', 'started_at', 'created_at',
        )
        read_only_fields = ('id', 'assigned_by', 'started_at', 'created_at')

class ConsultationAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionContextConsultationanalysis
        fields = '__all__'

class PatientContextSerializer(serializers.ModelSerializer):
    date_of_birth = serializers.SerializerMethodField()
    age_years = serializers.SerializerMethodField()
    dob_status = serializers.SerializerMethodField()

    def get_date_of_birth(self, obj):
        birthday = obj.patient.birthday
        return birthday.isoformat() if birthday else None

    def get_age_years(self, obj):
        return patient_age(obj.patient.birthday)[0]

    def get_dob_status(self, obj):
        return patient_age(obj.patient.birthday)[1]

    class Meta:
        model = PrescriptionContextPatientcontext
        fields = '__all__'


from .analysis_contract import StrictSerializer


class AllergyIdentitySerializer(StrictSerializer):
    recorded_text = serializers.CharField(max_length=200)
    identity = serializers.CharField(max_length=100, allow_blank=True)
    reaction = serializers.CharField(max_length=300, allow_blank=True)
    reaction_date = serializers.DateField(allow_null=True)
    clarification_note = serializers.CharField(max_length=500, allow_blank=True)

    def validate_reaction_date(self, value):
        from django.utils import timezone
        from zoneinfo import ZoneInfo
        if value and value > timezone.localdate(timezone=ZoneInfo('Asia/Colombo')):
            raise serializers.ValidationError('A recorded past reaction cannot have a future date; leave an unknown date blank.')
        return value


class MedicineIdentitySerializer(StrictSerializer):
    recorded_text = serializers.CharField(max_length=200)
    catalogue_id = serializers.CharField(max_length=100, allow_blank=True)
    expected_identity_hash = serializers.CharField(max_length=64, allow_blank=True)
    schedule = serializers.CharField(max_length=300, allow_blank=True)
    clarification_note = serializers.CharField(max_length=500, allow_blank=True)


class HistoryDetailsSerializer(StrictSerializer):
    allergies = AllergyIdentitySerializer(many=True, max_length=50)
    medicines = MedicineIdentitySerializer(many=True, max_length=50)


class CurrentMedicinePlanSerializer(StrictSerializer):
    """A proposed management note, never an active-medication status change."""
    recorded_text = serializers.CharField(max_length=200)
    action = serializers.ChoiceField(choices=('undecided', 'continue', 'change', 'stop'))
    note = serializers.CharField(max_length=1000, allow_blank=True)

    def validate(self, data):
        if data['action'] != 'undecided' and len(data['note'].strip()) < 10:
            raise serializers.ValidationError({'note': 'Describe the reason for this proposed action in at least 10 characters.'})
        return data


class PatientContextReviewSerializer(serializers.Serializer):
    allergy_status = serializers.ChoiceField(choices=('confirmed', 'none', 'unknown'))
    allergies = serializers.ListField(
        child=serializers.CharField(max_length=200, allow_blank=False), max_length=50,
    )
    medicine_status = serializers.ChoiceField(choices=('confirmed', 'none', 'unknown'))
    current_medicines = serializers.ListField(
        child=serializers.CharField(max_length=200, allow_blank=False), max_length=50,
    )
    reviewed = serializers.BooleanField()
    expected_updated_at = serializers.DateTimeField(allow_null=True)
    history_details = HistoryDetailsSerializer(required=False)
    medicine_plans = CurrentMedicinePlanSerializer(many=True, max_length=50, required=False)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            unexpected = set(data) - set(self.fields)
            if unexpected:
                raise serializers.ValidationError({'non_field_errors': [
                    'Unsupported fields: ' + ', '.join(sorted(unexpected)),
                ]})
        return super().to_internal_value(data)

    def validate(self, data):
        errors = {}
        if not data['reviewed']:
            errors['reviewed'] = 'Review the patient information for this visit before saving.'
        for status_field, list_field in [('allergy_status', 'allergies'), ('medicine_status', 'current_medicines')]:
            entries = data[list_field]
            if data[status_field] == 'confirmed' and not entries:
                errors[list_field] = 'Enter at least one item when the status is Known.'
            elif data[status_field] != 'confirmed' and entries:
                errors[list_field] = 'The list must be empty when the status is None or Unknown.'
            seen = set()
            normalized = []
            for entry in entries:
                if entry.casefold() not in seen:
                    normalized.append(entry)
                    seen.add(entry.casefold())
            data[list_field] = normalized
        if errors:
            raise serializers.ValidationError(errors)
        if 'history_details' in data:
            from .history_identity import validate_details
            data['history_details'] = dict(HistoryDetailsSerializer(data['history_details']).data)
            validate_details(data['history_details'], data)
        if 'medicine_plans' in data:
            plans = data['medicine_plans']
            if [row['recorded_text'] for row in plans] != data['current_medicines']:
                raise serializers.ValidationError({'medicine_plans': 'Each proposed action must match the current recorded medicines in order. Refresh and review again.'})
        return data

class ContextRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionContextContextrevision
        fields = '__all__'

class DiagnosisConfirmationSerializer(serializers.ModelSerializer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        self.fields['consultation'].queryset = (
            PrescriptionContextConsultation.objects.filter(doctor=request.user)
            if request and request.user else PrescriptionContextConsultation.objects.none()
        )

    class Meta:
        model = PrescriptionContextDiagnosisconfirmation
        fields = '__all__'
        read_only_fields = ('id', 'doctor', 'confirmed_at')
