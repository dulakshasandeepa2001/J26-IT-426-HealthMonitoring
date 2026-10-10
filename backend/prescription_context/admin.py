from django.contrib import admin
from .models import (
    PrescriptionContextConsultation,
    PrescriptionContextConsultationanalysis,
    PrescriptionContextPatientcontext,
    PrescriptionContextContextrevision,
    PrescriptionContextDiagnosisconfirmation,
)

admin.site.register(PrescriptionContextConsultation)
admin.site.register(PrescriptionContextConsultationanalysis)
admin.site.register(PrescriptionContextPatientcontext)
admin.site.register(PrescriptionContextContextrevision)
admin.site.register(PrescriptionContextDiagnosisconfirmation)
