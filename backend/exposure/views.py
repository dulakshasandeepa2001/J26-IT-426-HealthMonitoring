from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.permissions import IsApprovedAdmin
from prescription_context.access import IsApprovedDoctor
from prescription_context.models import PrescriptionContextDiagnosisconfirmation as Diagnosis
from .models import TrackingConsent, LocationSample, DiagnosisMetadata, RiskZoneVersion, ExposureAnalysis
from .serializers import BatchSerializer, ConsentSerializer, ModeSerializer, ZoneSerializer, MetadataSerializer
from .services import upload_locations, refresh_summary
from datetime import timedelta


class Access(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [IsAuthenticated]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response['Cache-Control'] = 'no-store'
        return response


def mode_for(request):
    data = ModeSerializer(data=request.query_params)
    data.is_valid(raise_exception=True)
    return data.validated_data['data_mode']


class ConsentView(Access):
    def get(self, request):
        return Response({'granted': TrackingConsent.objects.filter(user=request.user, granted=True).exists()})

    def put(self, request):
        data = ConsentSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            consent, _ = TrackingConsent.objects.select_for_update().get_or_create(user=request.user)
            consent.granted = data.validated_data['granted']
            consent.save()
        return Response({'granted': consent.granted})


class LocationsView(Access):
    def post(self, request):
        batch = BatchSerializer(data=request.data, context={'now': timezone.now()})
        batch.is_valid(raise_exception=True)
        result = upload_locations(request.user, batch.validated_data['samples'])
        result['processing'] = 'pending_scheduled_processing'
        return Response(result, status=201 if result['created'] else 200)

    def get(self, request):
        mode = mode_for(request)
        rows = LocationSample.objects.filter(user=request.user, data_mode=mode,
            recorded_at__gte=timezone.now()-timedelta(days=14)).order_by('-recorded_at', '-pk')[:500]
        return Response(list(rows.values('id', 'client_record_id', 'latitude', 'longitude', 'recorded_at', 'accuracy_m', 'data_mode')))


class AnalysisView(Access):
    def get(self, request):
        mode = mode_for(request)
        rows = ExposureAnalysis.objects.filter(user=request.user, data_mode=mode)
        # Rebuild aggregates against retention boundaries on every read, even if
        # the cleanup schedule is late. Never return stale expired encounters.
        codes = list(rows.values_list('disease_code', flat=True))
        for code in codes:
            refresh_summary(request.user.pk, mode, code)
        return Response(list(rows.values('id', 'disease_code', 'analysed_at', 'model_version',
            'feature_schema_version', 'model_score', 'exposure_summary', 'data_mode')))


class ZonesView(Access):
    permission_classes = [IsApprovedAdmin]

    def post(self, request):
        data = ZoneSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        # Serialize version creation on the admin's user-independent zone rows.
        # DB uniqueness also protects concurrent first-version creation.
        try:
            with transaction.atomic():
                if 'zone_id' in values:
                    # Lock the stable first version, never a legacy account row.
                    anchor = RiskZoneVersion.objects.select_for_update().filter(
                        zone_id=values['zone_id']).order_by('version').first()
                    prior = RiskZoneVersion.objects.filter(zone_id=values['zone_id']).order_by('-version').first() if anchor else None
                    if prior:
                        if values['version'] <= prior.version:
                            raise serializers.ValidationError('Append a higher version; existing versions are immutable.')
                        if values['data_mode'] != prior.data_mode or values['disease_code'] != prior.disease_code:
                            raise serializers.ValidationError('A zone keeps the same disease and data mode across versions.')
                zone = data.save()
        except IntegrityError:
            raise serializers.ValidationError('This zone version conflicts with an existing record.')
        return Response(ZoneSerializer(zone).data, status=201)


class DiagnosisMetadataView(Access):
    permission_classes = [IsApprovedDoctor]

    def put(self, request, diagnosis_id):
        data = MetadataSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        with transaction.atomic():
            diagnosis = get_object_or_404(Diagnosis.objects.select_for_update(),
                pk=diagnosis_id, consultation__doctor=request.user)
            values = data.validated_data
            approved = values.get('doctor_approved', False)
            values.update(approved_by=request.user if approved else None,
                          approved_at=timezone.now() if approved else None)
            metadata, _ = DiagnosisMetadata.objects.update_or_create(diagnosis=diagnosis, defaults=values)
        return Response(MetadataSerializer(metadata).data)
