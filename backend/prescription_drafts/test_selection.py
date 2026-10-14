from datetime import date
from uuid import uuid4
from django.test import TestCase
from django.utils import timezone
from .models import PrescriptionDraft, SafetyProfile
from . import tests as fixtures


class AutomaticSelectionTests(TestCase):
    # Reuse isolated, reviewed catalogue/doctor fixtures without inheriting the
    # earlier suite's tests or connecting to the configured project database.
    @classmethod
    def setUpTestData(cls):
        fixtures.DraftWorkflowTests.setUpTestData.__func__(cls)

    setUp = fixtures.DraftWorkflowTests.setUp
    body = fixtures.DraftWorkflowTests.body
    preview = fixtures.DraftWorkflowTests.preview
    suggestion = fixtures.DraftWorkflowTests.suggestion
    candidate = fixtures.DraftWorkflowTests.candidate
    category = fixtures.DraftWorkflowTests.category

    def generate(self, body=None):
        body = body or self.auto_body()
        if body.get('selection_mode') == 'automatic' and 'expected_plan_hash' not in body and not body['proposals']:
            preview = self.preview(body)
            if preview.status_code == 200:
                body = {**body, 'expected_plan_hash': preview.json()['plan_hash']}
        return fixtures.DraftWorkflowTests.generate(self, body)

    def auto_body(self, **changes):
        body = self.body(selection_mode='automatic', proposals=[], **changes)
        body['clinical'].update(verified_symptoms=['fever', 'body_aches'], symptoms_reviewed=True,
                                symptom_durations={'fever': '48', 'body_aches': '48'}, topical_assessment='standard')
        return body

    def test_auto_plan_selects_only_applicable_medicines_and_persists_server_regimens(self):
        response = self.generate(self.auto_body())
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual({row['medicine_id'] for row in response.json()['result']['candidates']}, {'paracetamol-500mg-tablet', 'oseltamivir-75mg-capsule'})
        self.assertEqual(response.json()['result']['selection_mode'], 'automatic')
        self.assertTrue(all(row['regimen_origin'] == 'rule_suggestion' for row in response.json()['result']['candidates']))
        self.assertFalse(response.json()['result']['approved']); self.assertFalse(response.json()['result']['published'])
        self.assertEqual(len(response.json()['snapshot']['proposals']), 2)
        self.assertIn('regimen_suggestions', response.json()['snapshot'])
        self.assertEqual(len(response.json()['snapshot']['reviewed_plan_hash']), 64)

    def test_automatic_generation_requires_a_reviewed_preview(self):
        body = self.auto_body()
        self.assertEqual(self.client.post(self.path, body, format='json').status_code, 400)
        body['expected_plan_hash'] = '0' * 64
        self.assertEqual(self.generate(body).status_code, 409)
        self.assertEqual(PrescriptionDraft.objects.count(), 0)

    def test_changed_patient_or_clinical_facts_reject_the_old_plan_even_for_identical_doses(self):
        body = self.auto_body()
        body['expected_plan_hash'] = self.preview(body).json()['plan_hash']
        body['clinical']['onset_hours'] = '72'
        self.assertEqual(self.generate(body).status_code, 409)
        body['clinical']['onset_hours'] = '24'
        self.patient.birthday = date(1989, 1, 1); self.patient.save(update_fields=['birthday'])
        self.assertEqual(self.generate(body).status_code, 409)
        self.assertEqual(PrescriptionDraft.objects.count(), 0)

    def test_changed_rule_review_requires_preview_refresh_and_unchanged_retry_is_idempotent(self):
        body = self.auto_body()
        body['expected_plan_hash'] = self.preview(body).json()['plan_hash']
        profile = SafetyProfile.objects.get(pk='paracetamol-500mg-tablet')
        profile.review_notes = 'Rechecked the same evidence and rule scope.'; profile.save()
        self.assertTrue(profile.review_is_current)
        self.assertEqual(self.generate(body).status_code, 409)
        body['expected_plan_hash'] = self.preview(body).json()['plan_hash']
        first = self.generate(body); self.assertEqual(first.status_code, 201, first.data)
        retry = self.generate(body); self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(first.json()['id'], retry.json()['id'])
        self.assertEqual(PrescriptionDraft.objects.count(), 1)

    def test_paracetamol_prn_limits_and_total_symptom_review_boundaries(self):
        body = self.auto_body()
        row = self.suggestion(self.preview(body), 'paracetamol-500mg-tablet')
        self.assertEqual(row['dose']['schedule_type'], 'oral_prn')
        self.assertEqual(row['dose']['amount'], '1000')
        self.assertEqual(row['dose']['interval_hours'], 6)
        self.assertEqual(row['dose']['max_doses_per_day'], 3)
        self.assertEqual(row['dose']['max_daily_amount_mg'], 3000)
        self.assertIsNone(row['dose']['doses_per_day']); self.assertIsNone(row['dose']['duration_days'])
        for duration, available in ((None, False), ('72', True), ('72.1', False)):
            body['clinical']['symptom_durations']['fever'] = duration
            self.assertEqual(self.suggestion(self.preview(body), 'paracetamol-500mg-tablet')['dose'] is not None, available)
        body['clinical'].update(verified_symptoms=['body_aches'], symptom_durations={'body_aches': '240'})
        self.assertEqual(self.suggestion(self.preview(body), 'paracetamol-500mg-tablet')['dose']['review_after_days'], 10)
        body['clinical']['symptom_durations']['body_aches'] = '240.1'
        self.assertIsNone(self.suggestion(self.preview(body), 'paracetamol-500mg-tablet')['dose'])

    def test_verified_absence_of_targets_excludes_symptom_relief_and_empty_plan_is_explicit(self):
        body = self.auto_body(); body['clinical'].update(verified_symptoms=[], symptom_durations={}, onset_hours='72')
        self.assertEqual(self.suggestion(self.preview(body), 'paracetamol-500mg-tablet')['status'], 'not_needed')
        response = self.generate(body)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.json()['result']['candidates'], [])
        self.assertEqual({row['medicine_id'] for row in response.json()['result']['excluded_candidates']}, {'paracetamol-500mg-tablet', 'oseltamivir-75mg-capsule'})

    def test_healthy_child_varicella_selects_only_itch_relief_with_qualitative_regimen(self):
        self.diagnosis.condition_code = 'chickenpox'; self.diagnosis.condition_label = 'Chickenpox'
        self.diagnosis.save(update_fields=['condition_code', 'condition_label'])
        self.patient.birthday = date(timezone.now().year - 10, 1, 1); self.patient.save(update_fields=['birthday'])
        body = self.auto_body(); body['clinical'].update(verified_symptoms=['fever', 'itching'],
            symptom_durations={'fever': '48', 'itching': '24'}, varicella_risk='typical_uncomplicated_child')
        response = self.generate(body)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([row['medicine_id'] for row in response.json()['result']['candidates']], ['calamine-zinc-oxide-lotion'])
        dose = response.json()['result']['candidates'][0]['proposed_dose']
        self.assertEqual(dose['schedule_type'], 'topical_prn'); self.assertEqual(dose['route'], 'topical')
        for key in ('amount', 'unit', 'doses_per_day', 'duration_days', 'interval_hours', 'max_daily_amount_mg'):
            self.assertIsNone(dose[key])
        self.assertEqual(dose['review_after_days'], 7); self.assertIn('External use', dose['instructions'])

    def test_calamine_symptom_duration_and_suitability_gate(self):
        self.diagnosis.condition_code = 'chickenpox'; self.diagnosis.condition_label = 'Chickenpox'
        self.diagnosis.save(update_fields=['condition_code', 'condition_label'])
        body = self.auto_body(); body['clinical'].update(verified_symptoms=['itching'], symptom_durations={'itching': '168'}, varicella_risk='risk_group_confirmed')
        self.assertIsNotNone(self.suggestion(self.preview(body), 'calamine-zinc-oxide-lotion')['dose'])
        body['clinical']['symptom_durations']['itching'] = '168.1'
        self.assertIsNone(self.suggestion(self.preview(body), 'calamine-zinc-oxide-lotion')['dose'])
        body['clinical'].update(symptom_durations={'itching': '24'}, topical_assessment='unknown')
        self.assertIsNone(self.suggestion(self.preview(body), 'calamine-zinc-oxide-lotion')['dose'])
        body['clinical'].update(topical_assessment='standard', verified_symptoms=[])
        self.assertEqual(self.suggestion(self.preview(body), 'calamine-zinc-oxide-lotion')['status'], 'not_needed')

    def test_auto_plan_cannot_be_forced_by_client_proposals_or_unreviewed_symptoms(self):
        body = self.auto_body(); body['proposals'] = self.body()['proposals']
        self.assertEqual(self.generate(body).status_code, 400)
        body = self.auto_body(); body['clinical']['symptoms_reviewed'] = False
        self.assertIsNone(self.suggestion(self.preview(body), 'paracetamol-500mg-tablet')['dose'])
        body['clinical']['verified_symptoms'] = ['unsupported']
        self.assertEqual(self.preview(body).status_code, 400)
        body = self.auto_body(); body['clinical']['symptom_durations']['unknown_target'] = '1'
        self.assertEqual(self.preview(body).status_code, 400)

    def test_prn_regimens_cannot_be_mutated_into_fixed_or_excessive_dosing(self):
        body = self.auto_body(); row = self.suggestion(self.preview(body), 'paracetamol-500mg-tablet')
        body.update(selection_mode='manual', proposals=[{'medicine_id': 'paracetamol-500mg-tablet', 'dose': row['dose'], 'origin': 'rule_suggestion'}])
        self.assertEqual(self.generate(body).status_code, 201)
        body['expected_latest_revision'] = 1; body['request_key'] = str(uuid4())
        body['proposals'][0]['dose']['max_daily_amount_mg'] = 4000
        self.assertEqual(self.generate(body).status_code, 409)
        body['proposals'][0]['origin'] = 'manual'
        candidate = self.candidate(self.generate(body), 'paracetamol-500mg-tablet')
        self.assertEqual(self.category(candidate, 'dose')['status'], 'blocked')
