from rest_framework import mixins, serializers, viewsets
from rest_framework.authentication import SessionAuthentication
from rest_framework.decorators import action
from rest_framework.response import Response
from accounts.models import User
from accounts.permissions import IsApprovedAdmin
from django.db import transaction
from django.utils import timezone
from .access import IsApprovedDoctor, assigned_patients
from .patient_data import context_snapshot
from .models import (
    PrescriptionContextConsultation,
    PrescriptionContextConsultationanalysis,
    PrescriptionContextPatientcontext,
    PrescriptionContextContextrevision,
    PrescriptionContextDiagnosisconfirmation,
)
from .serializers import (
    PatientSerializer,
    ConsultationSerializer,
    ConsultationAnalysisSerializer,
    PatientContextSerializer,
    ContextRevisionSerializer,
    DiagnosisConfirmationSerializer,
    AdminAssignmentSerializer,
    AssignmentDoctorSerializer,
    PatientContextReviewSerializer,
)


def filter_query(queryset, request, parameter, field, validator):
    value = request.query_params.get(parameter)
    if value is None:
        return queryset
    try:
        value = validator.run_validation(value)
    except serializers.ValidationError as exc:
        raise serializers.ValidationError({parameter: exc.detail})
    return queryset.filter(**{field: value})


class SessionAccess:
    authentication_classes = [SessionAuthentication]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response


class DoctorAccess(SessionAccess):
    permission_classes = [IsApprovedDoctor]


class AdminAssignmentViewSet(
    SessionAccess, mixins.CreateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet
):
    permission_classes = [IsApprovedAdmin]
    serializer_class = AdminAssignmentSerializer

    def get_queryset(self):
        return PrescriptionContextConsultation.objects.select_related(
            'patient', 'doctor'
        ).filter(assigned_by__isnull=False).order_by('-created_at', '-id')

    def list(self, request, *args, **kwargs):
        return Response(self.get_serializer(self.get_queryset()[:10], many=True).data)

    @action(detail=False, methods=['get'])
    def options(self, request):
        eligible = User.objects.filter(is_active=True, is_approved=True).order_by('username', 'id')
        return Response({
            'doctors': AssignmentDoctorSerializer(eligible.filter(role='doctor'), many=True).data,
            'patients': PatientSerializer(eligible.filter(role='patient'), many=True).data,
        })

    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)


class PatientViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = PatientSerializer

    def get_queryset(self):
        return assigned_patients(self.request.user).order_by('username', 'id')


class ConsultationViewSet(DoctorAccess, mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = ConsultationSerializer

    def get_queryset(self):
        qs = PrescriptionContextConsultation.objects.filter(
            doctor=self.request.user
        ).select_related('patient').order_by('-started_at', '-created_at', '-id')
        return filter_query(qs, self.request, 'patient', 'patient_id', serializers.IntegerField(min_value=1))

    def perform_create(self, serializer):
        # The browser cannot choose the actor, ID, timestamp or demo status.
        patient = serializer.validated_data['patient']
        previous = PrescriptionContextConsultation.objects.filter(
            doctor=self.request.user, patient=patient
        ).order_by('-started_at').first()
        serializer.save(doctor=self.request.user, is_demo=previous.is_demo)

    @action(detail=True, methods=['post'], url_path='patient-context')
    def review_patient_context(self, request, pk=None):
        consultation = self.get_object()
        review = PatientContextReviewSerializer(data=request.data)
        review.is_valid(raise_exception=True)
        data = review.validated_data
        with transaction.atomic():
            # Lock the patient even before their first context exists. This also
            # serializes simultaneous reviews by two authorized doctors.
            patient = User.objects.select_for_update().get(pk=consultation.patient_id)
            if patient.role != 'patient' or not patient.is_active or not patient.is_approved:
                raise serializers.ValidationError({'patient': 'An active, approved registered patient is required.'})
            context = PrescriptionContextPatientcontext.objects.select_for_update().filter(patient=patient).first()
            actual_updated_at = context.updated_at if context else None
            if data['expected_updated_at'] != actual_updated_at:
                return Response({
                    'detail': 'Patient information has changed. Refresh the workspace and review the latest values before saving.',
                }, status=409)
            before = context_snapshot(context) if context else None
            if context is None:
                context = PrescriptionContextPatientcontext(patient=patient)
            if patient.birthday is not None:
                context.date_of_birth = patient.birthday
            for field in ('allergy_status', 'allergies', 'medicine_status', 'current_medicines'):
                setattr(context, field, data[field])
            context.updated_by = request.user
            context.provenance = {
                **context.provenance,
                'source': 'doctor_manual_review',
                'dob_source': 'registration',
                'last_reviewed_consultation': str(consultation.pk),
                'last_reviewed_by': request.user.pk,
                'last_reviewed_at': timezone.now().isoformat(),
            }
            context.save()
            after = context_snapshot(context)
            PrescriptionContextContextrevision.objects.create(
                consultation=consultation, doctor=request.user, context=context,
                snapshot={'before': before, 'after': after, 'reviewed': True},
                changed_fields=[key for key, value in after.items() if before is None or before.get(key) != value],
            )
        return Response(PatientContextSerializer(context).data)


class ConsultationAnalysisViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = ConsultationAnalysisSerializer

    def get_queryset(self):
        qs = PrescriptionContextConsultationanalysis.objects.filter(
            consultation__doctor=self.request.user
        ).order_by('-imported_at')
        return filter_query(qs, self.request, 'consultation', 'consultation_id', serializers.UUIDField())


class PatientContextViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = PatientContextSerializer

    def get_queryset(self):
        qs = PrescriptionContextPatientcontext.objects.filter(
            patient__in=assigned_patients(self.request.user)
        ).select_related('patient').order_by('patient_id')
        return filter_query(qs, self.request, 'patient', 'patient_id', serializers.IntegerField(min_value=1))


class ContextRevisionViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = ContextRevisionSerializer

    def get_queryset(self):
        qs = PrescriptionContextContextrevision.objects.filter(
            consultation__doctor=self.request.user
        ).order_by('-recorded_at')
        return filter_query(qs, self.request, 'consultation', 'consultation_id', serializers.UUIDField())


class DiagnosisConfirmationViewSet(DoctorAccess, mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = DiagnosisConfirmationSerializer

    def get_queryset(self):
        qs = PrescriptionContextDiagnosisconfirmation.objects.filter(
            consultation__doctor=self.request.user
        ).order_by('-confirmed_at')
        return filter_query(qs, self.request, 'consultation', 'consultation_id', serializers.UUIDField())

    def perform_create(self, serializer):
        serializer.save(doctor=self.request.user)
