from rest_framework import serializers
from .models import (
    PrescriptionContextConsultation,
    PrescriptionContextConsultationanalysis,
    PrescriptionContextPatientcontext,
    PrescriptionContextContextrevision,
    PrescriptionContextDiagnosisconfirmation,
)

class ConsultationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionContextConsultation
        fields = '__all__'

class ConsultationAnalysisSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionContextConsultationanalysis
        fields = '__all__'

class PatientContextSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionContextPatientcontext
        fields = '__all__'

class ContextRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionContextContextrevision
        fields = '__all__'

class DiagnosisConfirmationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionContextDiagnosisconfirmation
        fields = '__all__'
