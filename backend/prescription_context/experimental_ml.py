"""Read-only access to frozen fictional fixtures, never encounter clinical inputs.

The consultation supplies authorization/demo scope only. No patient context,
analysis, diagnosis, live catalogue or clinical review is read or written here.
"""

from copy import deepcopy

from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from prescription_research.expansion import comparison as experiment
from prescription_research.expansion import relevance as dataset
from prescription_research import dataset as data_io
from .models import PrescriptionContextConsultation as Consultation
from .views import DoctorAccess


class ExperimentUnavailable(APIException):
    status_code = 503
    default_detail = 'Frozen Experimental ML artifacts are unavailable or changed. Restore the versioned experiment; this request cannot train or rebuild it.'


def frozen_options():
    """Verify every frozen hash on each request; no stale process cache or fit."""
    report = experiment.verify_run()
    batch = data_io.read_json(dataset.DEFAULT_OUTPUT / 'batch.json')
    selected = data_io.read_json(experiment.DEFAULT_OUTPUT / 'selected_model.json')
    return {
        'presentation_label': 'Experimental ML',
        'experiment_version': report['experiment_version'],
        'dataset_version': batch['dataset_version'],
        'algorithm': report['selected_model'],
        'label_provenance': selected['label_provenance'],
        'clinical_review_status': 'not_reviewed',
        'synthetic_only': True,
        'live_patient_data_used': False,
        'prescription_eligible': False,
        'approved': False,
        'published': False,
        'medical_confidence_calibrated': False,
        'fit_unique_inputs': report['fit_unique_inputs'],
        'test_agreement': {name: {key: report['selected_model_test'][name][key] for key in (
            'inputs', 'correct', 'errors_including_abstentions', 'agreement_with_provisional_labels', 'prediction_coverage',
        )} for name in ('all_mapped_unique', 'novel_mapped_unique')},
        'coverage_limits': [
            'Frozen fictional fixtures only; the selected encounter supplies access scope, not patient features.',
            'Six condition mappings, five reference products and one unresolved ORS identity. Unmapped/unsupported pairs abstain.',
            'Each purpose/role group has one candidate; meaningful within-group ranking is unavailable.',
            'Small rule-derived experiment: held-out agreement is not clinical accuracy or independent clinical validation.',
            'Deterministic findings are frozen research simulations; catalogue/rule review gates are not evaluated or cleared.',
            'Missing information remains unknown. A relevance label cannot clear a block, authorize a dose or publish a prescription.',
        ],
        'scenarios': [{key: row[key] for key in ('scenario_id', 'template_family', 'condition', 'split')} for row in batch['scenarios']],
        'candidates': [{key: row[key] for key in ('candidate_id', 'display_name', 'purpose', 'identity_status')} for row in batch['candidate_definitions']],
    }


def frozen_prediction(scenario_id, candidate_id):
    # predict_synthetic verifies the saved artifacts and accepts frozen IDs only.
    result = experiment.predict_synthetic(scenario_id, candidate_id, enabled=True)
    batch = data_io.read_json(dataset.DEFAULT_OUTPUT / 'batch.json')
    row = next(row for row in batch['candidate_rows'] if row['scenario_id'] == scenario_id and row['candidate_id'] == candidate_id)
    scenario = next(row for row in batch['scenarios'] if row['scenario_id'] == scenario_id)
    source_ids = set(row['label_source_ids']) | {source for finding in result['deterministic_safety']['findings'] for source in finding['source_ids']}
    result.update(
        fixture={key: deepcopy(scenario[key]) for key in ('scenario_id', 'template_family', 'condition', 'split', 'patient_features')},
        model_features=deepcopy(row['model_features']),
        candidate_purpose=row['candidate_purpose'],
        clinical_role=row['clinical_role'],
        mapping_status=row['mapping_status'],
        # Reference target is output for inspection only, never an input to predict.
        reference_label=deepcopy(row['relevance_target']),
        evidence_references=[batch['evidence_references'][key] for key in sorted(source_ids)],
    )
    return result


class ExperimentalMLView(DoctorAccess, APIView):
    """GET options / POST prediction; neither operation persists anything."""

    def scope(self, request, consultation_id):
        visit = get_object_or_404(Consultation.objects.only('id', 'is_demo').filter(
            doctor=request.user, patient__is_active=True, patient__is_approved=True, patient__role='patient',
        ), pk=consultation_id)
        if not visit.is_demo:
            raise PermissionDenied('Experimental ML is restricted to synthetic demo consultations.')
        if getattr(settings, 'PRESCRIPTION_EXPERIMENTAL_ML_ENABLED', False) is not True:
            raise PermissionDenied('Experimental ML is disabled. Enable PRESCRIPTION_EXPERIMENTAL_ML_ENABLED on the local server to try the synthetic demo.')
        return visit

    def get(self, request, consultation_id):
        self.scope(request, consultation_id)
        if request.query_params:
            raise ValidationError('No patient features or query options are accepted.')
        try:
            result = frozen_options()
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ExperimentUnavailable() from error
        return Response(dict(result, consultation_id=str(consultation_id)))

    def post(self, request, consultation_id):
        self.scope(request, consultation_id)
        body = request.data
        if request.query_params or not isinstance(body, dict) or set(body) != {'synthetic_demo', 'scenario_id', 'candidate_id'}:
            raise ValidationError('Send only synthetic_demo=true, scenario_id and candidate_id. Patient features, paths and training options are not accepted.')
        if body['synthetic_demo'] is not True:
            raise ValidationError('Explicit synthetic_demo=true opt-in is required.')
        if not all(isinstance(body[key], str) and 0 < len(body[key]) <= 150 for key in ('scenario_id', 'candidate_id')):
            raise ValidationError('Choose frozen synthetic scenario and candidate IDs.')
        try:
            options = frozen_options()
            if body['scenario_id'] not in {row['scenario_id'] for row in options['scenarios']} or body['candidate_id'] not in {row['candidate_id'] for row in options['candidates']}:
                raise ValidationError('Unknown frozen synthetic scenario or candidate.')
            result = frozen_prediction(body['scenario_id'], body['candidate_id'])
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ExperimentUnavailable() from error
        return Response(dict(result, consultation_id=str(consultation_id)))
