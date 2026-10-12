from django.contrib import admin
from django import forms
from accounts.models import User
from .models import (
    PrescriptionContextConsultation,
    PrescriptionContextConsultationanalysis,
    PrescriptionContextPatientcontext,
    PrescriptionContextContextrevision,
    PrescriptionContextDiagnosisconfirmation,
)

class ConsultationAssignmentForm(forms.ModelForm):
    class Meta:
        model = PrescriptionContextConsultation
        fields = ('doctor', 'patient', 'reason', 'is_demo')

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        eligible = User.objects.filter(is_active=True, is_approved=True)
        if 'doctor' in self.fields:
            self.fields['doctor'].queryset = eligible.filter(role='doctor').order_by('username')
        if 'patient' in self.fields:
            self.fields['patient'].queryset = eligible.filter(role='patient').order_by('username')


@admin.register(PrescriptionContextConsultation)
class ConsultationAdmin(admin.ModelAdmin):
    form = ConsultationAssignmentForm
    list_display = ('id', 'patient', 'doctor', 'started_at', 'is_demo', 'assigned_by')
    list_filter = ('is_demo',)
    search_fields = ('patient__username', 'doctor__username', 'reason')
    readonly_fields = ('id', 'started_at', 'created_at', 'assigned_by')

    def get_readonly_fields(self, request, obj=None):
        if obj:
            return tuple(field.name for field in self.model._meta.fields)
        return self.readonly_fields

    def save_model(self, request, obj, form, change):
        if not change:
            obj.assigned_by = request.user
        super().save_model(request, obj, form, change)

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(PrescriptionContextConsultationanalysis)
admin.site.register(PrescriptionContextPatientcontext)
admin.site.register(PrescriptionContextContextrevision)
admin.site.register(PrescriptionContextDiagnosisconfirmation)
