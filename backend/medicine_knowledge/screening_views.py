from rest_framework import serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from prescription_context.views import DoctorAccess
from prescription_context.models import PrescriptionContextConsultationanalysis as Analysis, PrescriptionContextPatientcontext as Context, PrescriptionContextDiagnosisconfirmation as Diagnosis
from prescription_context.member1_v21 import HANDOFF_CONDITIONS, BOOLEAN_OBSERVATIONS
from prescription_context.patient_data import patient_age
from .models import PatientScreeningDraft, content_digest
from .selected_interactions import SelectedPreviewSerializer as SixConditionPreviewSerializer, SelectedSaveSerializer as SixConditionSaveSerializer, SelectedClinicalSerializer as SixConditionClinicalSerializer, pair_scope, policy
from .patient_screening import authorized_visit, draft_queryset, source_observations
from .selected_screening import preview, save, freshness
from .screening_engine import ENGINE_VERSION
from .screening_availability import screening_database_operation


class ScreeningInputsView(DoctorAccess, APIView):
    def get(self, request, consultation_id):
        visit = authorized_visit(request.user, consultation_id)
        context = Context.objects.filter(patient_id=visit.patient_id).first()
        analysis = Analysis.objects.filter(consultation=visit).first()
        clinical = {}
        for name, field in SixConditionClinicalSerializer().fields.items():
            try:
                clinical[name] = field.get_default()
            except serializers.SkipField:
                pass
        clinical.update(reviewed=False, condition_assessments={key: None for key in BOOLEAN_OBSERVATIONS})
        age, status = patient_age(visit.patient.birthday)
        member = (analysis.payload if analysis else {}).get('member1', {})
        from prescription_context.patient_data import context_snapshot
        from .models import MedicineEntry
        diagnosis = Diagnosis.objects.filter(consultation=visit, doctor=request.user).order_by('pk').first()
        condition = (diagnosis.condition_label.casefold().replace(' ', '_') if diagnosis and diagnosis.condition_code.casefold() == 'manual'
            else diagnosis.condition_code.casefold() if diagnosis else None)
        selected_policy = pair_scope({'is_demo': visit.is_demo,
            'patient': {'id': visit.patient_id, 'birthday': visit.patient.birthday.isoformat() if visit.patient.birthday else None, 'age_years': age, 'dob_status': status},
            'context': {**context_snapshot(context), 'updated_at': context.updated_at.isoformat(), 'provenance': context.provenance} if context else None,
            'diagnosis': {'id': diagnosis.pk, 'condition': condition} if diagnosis else None,
            'analysis_hash': content_digest(analysis.payload if analysis else None)},
            {row.pk: row.content for row in MedicineEntry.objects.filter(pk__in=policy()['product_hashes'])})
        return Response({'consultation_id': str(visit.pk), 'supported_conditions': HANDOFF_CONDITIONS,
            'engine_version': ENGINE_VERSION,
            'source_red_flag_assessment': member.get('red_flag_assessment', 'not_assessed'),
            'patient_age_years': age, 'dob_status': status, 'age_source': 'registered_dob',
            'expected_context_updated_at': context.updated_at.isoformat() if context else None,
            'expected_analysis_hash': content_digest(analysis.payload if analysis else None),
            'confirmed_diagnoses': list(Diagnosis.objects.filter(consultation=visit, doctor=request.user).values('id', 'condition_code', 'condition_label')),
            'clinical_template': clinical, 'source_observations': source_observations(analysis.payload if analysis else None),
            'selected_pair_policy': selected_policy,
            'source_observations_verified': False,
            'instructions': 'Use the registered patient and saved per-visit history. Independently verify required clinical inputs; source observations are not clearance. Preview candidates before saving an unapproved draft.',
            'approved': False, 'published': False})


class ScreeningPreviewView(DoctorAccess, APIView):
    def post(self, request, consultation_id):
        contract = SixConditionPreviewSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        with screening_database_operation():
            result = preview(request.user, consultation_id, dict(contract.data))
        return Response(result)


class ScreeningDraftSerializer(serializers.ModelSerializer):
    current_state = serializers.SerializerMethodField()

    def get_current_state(self, obj):
        return freshness(obj, self.context['request'].user)

    class Meta:
        model = PatientScreeningDraft
        fields = ('id', 'consultation_id', 'patient', 'doctor', 'revision', 'request_key', 'snapshot', 'result', 'created_at', 'current_state')


class ScreeningSaveView(DoctorAccess, APIView):
    def post(self, request, consultation_id):
        contract = SixConditionSaveSerializer(data=request.data)
        contract.is_valid(raise_exception=True)
        with screening_database_operation():
            row, created = save(request.user, consultation_id, dict(contract.data))
            result = ScreeningDraftSerializer(row, context={'request': request}).data
        return Response(result, status=201 if created else 200)


class ScreeningDraftViewSet(DoctorAccess, viewsets.ReadOnlyModelViewSet):
    serializer_class = ScreeningDraftSerializer

    def get_queryset(self):
        query = draft_queryset(self.request.user)
        if 'consultation' in self.request.query_params:
            identity = serializers.UUIDField().run_validation(self.request.query_params['consultation'])
            query = query.filter(consultation_id=identity)
        return query
