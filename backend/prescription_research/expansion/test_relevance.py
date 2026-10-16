"""Offline six-condition labels, feature exclusions, family grouping and provenance."""

from copy import deepcopy
import csv
import io
import json
import os
import subprocess
import sys
import unittest
from unittest.mock import patch

from prescription_research import dataset as ds
from prescription_research.test_dataset import offline_test_directory
from . import check, knowledge as kn, relevance as rv, screening as sc


class SixConditionRelevanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.knowledge = kn.load_knowledge()
        cls.policies = cls.knowledge[1]
        cls.batch = rv.build_batch()
        cls.report = rv.validate_batch(cls.batch)

    def scenario(self, family='acute_multi_symptom', condition='influenza'):
        return deepcopy(next(s for s in self.batch['scenarios'] if s['template_family'] == family and s['condition'] == condition))

    def row(self, condition, identity, family='acute_multi_symptom'):
        return next(r for r in self.batch['candidate_rows'] if r['condition'] == condition and r['candidate_id'] == identity and r['template_family'] == family)

    def test_actual_counts_and_class_balance(self):
        self.assertEqual(self.report['counts'], {'synthetic_contexts': 60, 'candidate_rows': 360, 'template_families': 12,
            'supported_conditions': 6, 'candidate_identities': 6, 'resolved_products': 5, 'unresolved_planning_identities': 1,
            'condition_mapped_rows': 81, 'contrast_rows': 243, 'unsupported_condition_rows': 36,
            'unique_model_inputs': 264, 'unique_mapped_model_inputs': 59})
        self.assertEqual(self.report['class_balance'], {'relevant': 44, 'not_relevant': 260, 'undetermined': 56})
        self.assertEqual(self.report['mapped_class_balance'], {'relevant': 44, 'not_relevant': 17, 'undetermined': 20})
        self.assertFalse(self.report['model_trained'])
        self.assertIsNone(self.report['held_out_agreement'])

    def test_template_families_and_all_patient_candidate_rows_stay_together(self):
        family_splits = {}
        for scenario in self.batch['scenarios']:
            family_splits.setdefault(scenario['template_family'], set()).add(scenario['split'])
            rows = [row for row in self.batch['candidate_rows'] if row['scenario_id'] == scenario['scenario_id']]
            self.assertEqual({r['candidate_id'] for r in rows}, set(kn.HANDLERS))
            self.assertEqual({r['split'] for r in rows}, {scenario['split']})
        self.assertTrue(all(len(splits) == 1 for splits in family_splits.values()))
        for split in ('train', 'validation', 'test'):
            self.assertEqual(self.report['by_split'][split]['scenarios'], 20)
            self.assertEqual(self.report['by_split'][split]['rows'], 120)
            self.assertEqual(self.report['by_split'][split]['missing_classes'], [])

    def test_independent_expected_targets_preserve_medication_purposes(self):
        expected = {('influenza', kn.PARACETAMOL): 'relevant', ('influenza', 'oseltamivir-75mg-capsule'): 'relevant',
            ('influenza', 'acyclovir-800mg-tablet'): 'not_relevant', ('measles', kn.PARACETAMOL): 'relevant',
            ('measles', 'oseltamivir-75mg-capsule'): 'not_relevant', ('viral_conjunctivitis', kn.CMC): 'relevant',
            ('viral_conjunctivitis', 'calamine-zinc-oxide-lotion'): 'not_relevant', ('viral_gastroenteritis', kn.ORS): 'relevant'}
        for (condition, identity), label in expected.items():
            self.assertEqual(self.row(condition, identity)['relevance_target']['value'], label)
        self.assertEqual(self.row('viral_gastroenteritis', kn.ORS)['candidate_purpose'], 'rehydration_support')
        self.assertEqual(self.row('viral_conjunctivitis', kn.CMC)['clinical_role'], 'ocular_dryness_or_irritation_relief')
        self.assertEqual(self.row('influenza', kn.CMC)['clinical_role'], 'unmapped_for_condition')

    def test_presence_absence_and_unknown_are_distinct(self):
        for family, label in [('acute_multi_symptom', 'relevant'), ('resolved_symptoms', 'not_relevant'), ('incomplete_interview', 'undetermined')]:
            self.assertEqual(self.row('measles', kn.PARACETAMOL, family)['relevance_target']['value'], label)
        scenario = self.scenario()
        scenario['patient_features']['symptoms']['body_aches'] = {'present': None, 'duration_hours': None}
        self.assertEqual(rv.relevance_target(scenario, kn.PARACETAMOL, self.policies)['value'], 'relevant')
        scenario['patient_features']['symptoms']['fever'] = {'present': False, 'duration_hours': None}
        self.assertEqual(rv.relevance_target(scenario, kn.PARACETAMOL, self.policies)['value'], 'undetermined')

    def test_unknown_condition_does_not_promote_symptoms_to_diagnosis(self):
        rows = [row for row in self.batch['candidate_rows'] if row['mapping_status'] == 'unsupported_condition']
        self.assertEqual(len(rows), 36)
        self.assertEqual({r['relevance_target']['value'] for r in rows}, {'undetermined'})
        self.assertTrue(all(r['research_safety']['evaluation_status'] == 'outside_condition_mapping' for r in rows))

    def test_safety_counterfactuals_do_not_change_target_or_model_inputs(self):
        for condition in kn.CONDITIONS:
            before = self.scenario(condition=condition)
            after = deepcopy(before)
            after['patient_features'].update(age_years=None, weight_kg=None, onset_hours=500,
                allergy_history={'status': 'reported', 'mentions': ['Paracetamol (Rash)']},
                current_medicines={'status': 'reported', 'mentions': ['Unresolved medicine']})
            after['patient_features']['assessments'] = {name: 'unknown' for name in sc.ASSESSMENTS}
            after['patient_features']['condition_assessments'] = {name: None for name in kn.CONCERN_FIELDS}
            after['reported_observations']['hydration_concern'] = True
            for identity in kn.HANDLERS:
                self.assertEqual(rv.relevance_target(before, identity, self.policies), rv.relevance_target(after, identity, self.policies))
                self.assertEqual(rv.model_features(before, identity, self.policies), rv.model_features(after, identity, self.policies))

    def test_feature_allowlist_excludes_labels_review_decisions_and_post_decision_fields(self):
        for row in self.batch['candidate_rows']:
            self.assertEqual(tuple(row['model_features']), rv.FEATURES)
            self.assertFalse(set(row['model_features']) & {'relevance_target', 'teacher_score', 'safety_status', 'reviewed_by',
                'clinical_review_status', 'dose', 'split', 'scenario_id', 'template_family', 'age_years', 'duration_hours'})
        for name in ('teacher_score', 'dose', 'reviewer_id', 'safety_status'):
            batch = deepcopy(self.batch)
            batch['candidate_rows'][0]['model_features'][name] = 1
            with self.assertRaises(ValueError):
                rv.validate_batch(batch)

    def test_ors_purpose_relevance_never_resolves_identity_or_safety(self):
        row = self.row('viral_gastroenteritis', kn.ORS)
        self.assertEqual(row['relevance_target']['value'], 'relevant')
        self.assertEqual(row['research_safety']['aggregate_status'], 'blocked')
        self.assertFalse(row['research_safety']['experimental_reference_available'])
        self.assertIsNone(row['catalogue_content_sha256'])
        definition = next(c for c in self.batch['candidate_definitions'] if c['candidate_id'] == kn.ORS)
        for name in ('strength', 'form', 'route', 'standard_concept'):
            self.assertIsNone(definition[name])
        self.assertEqual(self.report['ors_relevant_but_identity_blocked'], 4)

    def test_positive_relevance_can_coexist_with_missing_or_blocked_safety(self):
        self.assertEqual(self.report['relevant_but_blocked_or_unknown'], 25)
        row = self.row('measles', kn.PARACETAMOL, 'reported_concern')
        self.assertEqual(row['relevance_target']['value'], 'relevant')
        self.assertEqual(row['research_safety']['aggregate_status'], 'blocked')
        row = self.row('mumps', kn.PARACETAMOL, 'mixed_positive_unknown')
        self.assertEqual(row['relevance_target']['value'], 'relevant')
        self.assertFalse(row['research_safety']['eligible_for_prescription'])

    def test_constant_targets_and_single_candidate_groups_are_reported_honestly(self):
        self.assertEqual(self.report['constant_target_groups'], ['flu-antiviral', 'varicella-antiviral'])
        for name, group in self.report['purpose_groups'].items():
            self.assertEqual(len(group['candidate_ids']), 1)
            self.assertFalse(group['within_group_ranking_meaningful'])
            if name in self.report['constant_target_groups']:
                self.assertEqual(group['class_balance'], {'relevant': 9})

    def test_feature_overlap_is_measured_despite_disjoint_families(self):
        self.assertEqual(self.report['split_overlap_inputs'], {'train--validation': 42, 'train--test': 48, 'validation--test': 12})
        self.assertEqual(self.report['conflicting_identical_inputs'], 0)
        train = {rv.feature_key(r) for r in self.batch['candidate_rows'] if r['split'] == 'train' and r['mapping_status'] == 'mapped'}
        for split in ('validation', 'test'):
            local = {rv.feature_key(r) for r in self.batch['candidate_rows'] if r['split'] == split and r['mapping_status'] == 'mapped'}
            self.assertEqual(self.report['by_split'][split]['mapped_inputs_also_in_train'], len(train & local))

    def test_missing_context_stays_explicitly_unknown(self):
        for condition in kn.CONDITIONS:
            patient = self.scenario('incomplete_interview', condition)['patient_features']
            self.assertIsNone(patient['age_years'])
            self.assertIsNone(patient['weight_kg'])
            self.assertTrue(all(value['present'] is None and value['duration_hours'] is None for value in patient['symptoms'].values()))
            self.assertTrue(all(value is None for value in patient['condition_assessments'].values()))

    def test_family_split_tampering_fails_even_when_rows_are_changed_consistently(self):
        batch = deepcopy(self.batch)
        family = 'localized_complaint'
        for item in batch['scenarios'] + batch['candidate_rows']:
            if item['template_family'] == family:
                item['split'] = 'train'
        with self.assertRaises(ValueError):
            rv.validate_batch(batch)

    def test_duplicate_or_missing_context_candidate_rows_fail(self):
        for operation in ('duplicate_row', 'missing_row', 'missing_scenario'):
            batch = deepcopy(self.batch)
            if operation == 'duplicate_row':
                batch['candidate_rows'].append(deepcopy(batch['candidate_rows'][0]))
            elif operation == 'missing_row':
                batch['candidate_rows'].pop()
            else:
                batch['scenarios'].pop()
            with self.assertRaises(ValueError):
                rv.validate_batch(batch)

    def test_labels_safety_and_content_hashes_cannot_be_rewritten(self):
        for field in ('label', 'method', 'safety', 'hash', 'evidence'):
            batch = deepcopy(self.batch)
            row = batch['candidate_rows'][0]
            if field == 'label':
                row['relevance_target']['value'] = 'undetermined'
            elif field == 'method':
                row['relevance_target']['label_method'] = 'clinician_review'
            elif field == 'safety':
                row['research_safety']['aggregate_status'] = 'passed'
            elif field == 'hash':
                row['catalogue_content_sha256'] = '0' * 64
            else:
                row['label_source_ids'] = ['unknown-reference']
            with self.assertRaises(ValueError):
                rv.validate_batch(batch)

    def test_no_fake_reviewers_live_ids_or_publication_flags(self):
        for changes in ({'reviewer_id': 9}, {'signature': 'forged'}, {'approval_date': '2026-10-16'}, {'clinical_review_status': 'reviewed'}):
            batch = deepcopy(self.batch)
            batch.update(changes)
            with self.assertRaises(ValueError):
                rv.validate_batch(batch)
        batch = deepcopy(self.batch)
        batch['scenarios'][0]['patient_features']['patient_id'] = 12
        with self.assertRaises(ValueError):
            rv.validate_batch(batch)
        for row in self.batch['candidate_rows']:
            self.assertEqual(row['clinical_review_status'], 'not_reviewed')
            self.assertTrue(row['synthetic_only'])
            self.assertFalse(any(row['research_safety'][key] for key in ('eligible_for_prescription', 'full_safety_clearance', 'approved', 'published')))

    def test_schema_rejects_string_boolean_and_nonfinite_values(self):
        for value in ('true', 1, float('nan')):
            batch = deepcopy(self.batch)
            batch['candidate_rows'][0]['model_features']['fever_present'] = value
            with self.assertRaises(ValueError):
                rv.validate_batch(batch)
        batch = deepcopy(self.batch)
        batch['scenarios'][0]['patient_features']['weight_kg'] = 10 ** 500
        with self.assertRaises(ValueError):
            rv.validate_batch(batch)

    def test_candidate_identity_and_evidence_provenance_are_bound(self):
        batch = deepcopy(self.batch)
        batch['candidate_definitions'][0]['strength'] = 'invented'
        with self.assertRaises(ValueError):
            rv.validate_batch(batch)
        batch = deepcopy(self.batch)
        key = next(iter(batch['evidence_references']))
        batch['evidence_references'][key]['url'] = 'https://example.test/fake'
        with self.assertRaises(ValueError):
            rv.validate_batch(batch)

    def test_metadata_and_template_review_spoofing_fail_before_export(self):
        original = ds.read_json
        for path in (rv.CRITERIA_PATH, rv.TEMPLATE_PATH):
            def altered(candidate, target=path):
                data = original(candidate)
                if candidate == target:
                    data['reviewer_id'] = 'invented'
                return data
            with patch.object(ds, 'read_json', side_effect=altered), self.assertRaises(ValueError):
                rv.configuration()

    def test_reproducible_exports_and_csv_remain_inspectable(self):
        with offline_test_directory() as output:
            report = rv.export(output)
            self.assertEqual(report, rv.validate_artifacts(output))
            csv_rows = list(csv.DictReader(io.StringIO((output / 'inspection_rows.csv').read_text(encoding='utf-8'))))
            self.assertEqual(len(csv_rows), 360)
            self.assertEqual({r['label_method'] for r in csv_rows}, {'rule_derived'})
            self.assertEqual({r['fever_present'] for r in csv_rows}, {'present', 'absent', 'unknown'})
            (output / 'inspection_rows.csv').write_text('tampered', encoding='utf-8')
            with self.assertRaises(ValueError):
                rv.validate_artifacts(output)

    def test_failed_schema_label_validation_writes_no_artifacts(self):
        with offline_test_directory() as output, patch.object(rv, 'validate_batch', side_effect=ds.ValidationError('invalid labels')):
            with self.assertRaises(ValueError):
                rv.export(output)
            self.assertEqual(list(output.iterdir()), [])

    def test_existing_knowledge_bundle_still_validates(self):
        report = check.validate_artifacts(check.DEFAULT_OUTPUT)
        self.assertEqual(report['counts']['candidate_rule_evaluations'], 36)

    def test_offline_builder_reads_no_live_records_and_imports_no_django(self):
        with patch('socket.create_connection', side_effect=AssertionError('No network')):
            self.assertEqual(rv.build_batch()['dataset_version'], rv.VERSION)
        env = os.environ.copy()
        env.pop('DJANGO_SETTINGS_MODULE', None)
        result = subprocess.run([sys.executable, '-c',
            'import sys; from prescription_research.expansion.relevance import build_batch; build_batch(); '
            'assert not any(name == "django" or name.startswith("django.") for name in sys.modules); print("offline")'],
            cwd=ds.BACKEND, env=env, capture_output=True, text=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('offline', result.stdout)


if __name__ == '__main__':
    unittest.main()
