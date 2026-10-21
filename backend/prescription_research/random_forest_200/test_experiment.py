"""Isolated synthetic ingestion, leakage, abstention and persistence checks; no ORM."""
import copy
import csv
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET
from zipfile import ZipFile

from . import data, experiment


class ForestExperimentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.settings = data.plan()
        cls.csv = data.DEFAULT_OUTPUT / 'inputs/patient_scenarios_200.csv'
        cls.xlsx = data.DEFAULT_OUTPUT / 'inputs/MediTrack_Synthetic_200.xlsx'
        cls.cases, cls.rows, cls.audit = data.load_inputs(cls.csv, cls.xlsx)
        from sklearn.ensemble import RandomForestClassifier
        cls.training = [cls.pair('absent', 0, i) for i in range(3)] + [cls.pair('present', 1, i + 3) for i in range(3)]
        cls.model = experiment.fit_model(cls.training, RandomForestClassifier(n_estimators=12, random_state=426, n_jobs=1), cls.settings)

    @classmethod
    def pair(cls, fever, label, index=0):
        features = {name: 'absent' for name in data.symptoms()}
        features.update(condition='influenza', candidate_key='paracetamol', purpose='symptom_relief', symptom_fever=fever)
        return {'row_id': f'ISOLATED-{index}', 'scenario_id': f'ISOLATED-{index}', 'template_family': 'isolated',
            'split': 'train', 'condition': 'influenza', 'candidate_key': 'paracetamol', 'purpose': 'symptom_relief',
            'model_features': features, 'label': label}

    def test_real_ingestion_counts_and_no_clinical_targets(self):
        self.assertEqual((len(self.cases), len(self.rows)), (200, 636))
        self.assertEqual(self.audit['label_balance'], {'0': 88, '1': 172, 'unlabelled': 376})
        self.assertTrue(all(r['clinical_safety_target'] is None and r['dose_target'] is None for r in self.rows))
        self.assertTrue(all(r['clinical_review_status'] == 'not_reviewed' and not r['prescription_eligible'] for r in self.rows))
        self.assertTrue(all(c['clinical_assessment_verified'] == 'false' and c['history_verified_for_visit'] == 'false' for c in self.cases))

    def test_small_batch_and_full_validation_agree(self):
        inspected = data.inspect_inputs(self.csv, self.xlsx)
        by_id = {(r['scenario_id'], r['candidate_key']): r for r in self.rows}
        self.assertEqual((inspected['case_count'], len(inspected['rows'])), (12, 38))
        for row in inspected['rows']:
            full = by_id[row['scenario_id'], row['candidate']]
            self.assertEqual((row['label'], row['features']), (full['label'], full['model_features']))

    def test_unknown_is_distinct_from_negative_and_undefined_task(self):
        case = {name: False for name in data.symptoms()}
        self.assertEqual(data.expected_target(case, 'paracetamol', self.settings)[0], 0)
        case['symptom_fever'] = None
        self.assertIsNone(data.expected_target(case, 'paracetamol', self.settings)[0])
        case['symptom_body_aches'] = True
        self.assertEqual(data.expected_target(case, 'paracetamol', self.settings)[0], 1)
        self.assertIsNone(data.expected_target(case, 'oseltamivir', self.settings)[0])
        case['assigned_condition_code'] = 'influenza'
        self.assertEqual(data.features(case, 'paracetamol', 'symptom_relief')['symptom_fever'], 'unknown')

    def test_unlabelled_rows_are_not_training_negatives(self):
        split = experiment.partitions(self.rows)
        self.assertEqual([len(split[key]) for key in data.SPLITS], [161, 33, 66])
        self.assertTrue(all(r['label'] in (0, 1) for values in split.values() for r in values))

    def test_family_leakage_is_rejected_before_fitting(self):
        with self.csv.open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle)
            headers, raw = reader.fieldnames, list(reader)
        family = raw[0]['template_family_id']
        same_family = [r for r in raw if r['template_family_id'] == family]
        same_family[1]['suggested_split'] = 'test' if same_family[0]['suggested_split'] != 'test' else 'train'
        with tempfile.TemporaryDirectory(dir=data.HERE) as directory:
            target = Path(directory) / 'mutated.csv'
            with target.open('w', encoding='utf-8', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=headers)
                writer.writeheader()
                writer.writerows(raw)
            with self.assertRaisesRegex(ValueError, 'family crosses'):
                data.load_inputs(target, self.xlsx)

    def test_labels_cannot_be_changed_without_audit_failure(self):
        sheets = data.workbook(self.xlsx)
        header = sheets['Candidate labels'][0]
        column = next(key for key, value in header.items() if value == 'toy_symptom_match_label')
        for row in sheets['Candidate labels'][1:]:
            if row.get(column) in ('0', '1'):
                row[column] = '1' if row[column] == '0' else '0'
                break
        with patch.object(data, 'workbook', return_value=sheets), self.assertRaisesRegex(ValueError, 'label/reason conflicts'):
            data.load_inputs(self.csv, self.xlsx)

    def test_formulas_in_candidate_data_are_rejected(self):
        # Guide's supplied aggregate formulas are ignored; a formula cannot supply a label.
        sheets = data.workbook(self.xlsx)
        self.assertNotIn('B7', sheets['Guide'][6])
        with tempfile.TemporaryDirectory(dir=data.HERE) as directory:
            target = Path(directory) / 'formula.xlsx'
            with ZipFile(self.xlsx) as source, ZipFile(target, 'w') as output:
                for name in source.namelist():
                    value = source.read(name)
                    if name == 'xl/worksheets/sheet3.xml':
                        root = ET.fromstring(value)
                        cell = root.find('m:sheetData/m:row/m:c', data.NS)
                        ET.SubElement(cell, '{' + data.NS['m'] + '}f').text = '1+1'
                        value = ET.tostring(root)
                    output.writestr(name, value)
            with self.assertRaisesRegex(ValueError, 'Formula cells'):
                data.workbook(target)

    def test_conflicting_identical_inputs_are_rejected(self):
        duplicate = copy.deepcopy(self.training[0])
        duplicate['label'] = 1
        with self.assertRaisesRegex(ValueError, 'Conflicting supplied labels'):
            data.unique_rows([self.training[0], duplicate])

    def test_validation_rows_cannot_fit_preprocessing(self):
        row = copy.deepcopy(self.training[0])
        row['split'] = 'validation'
        with self.assertRaisesRegex(ValueError, 'training families only'):
            experiment.fit_model([row, self.training[-1]], self.model['pipeline']['model'], self.settings)

    def test_forbidden_fields_do_not_enter_features_or_predictions(self):
        row = copy.deepcopy(self.training[-1])
        expected = experiment.predict_one(self.model, row, self.settings)
        row.update(label=0, clinical_safety_label='safe', teacher_score=999, reviewer='fabricated', approved_prescription_id=999)
        self.assertEqual(expected, experiment.predict_one(self.model, row, self.settings))
        encoded = list(self.model['pipeline']['encode'].get_feature_names_out())
        self.assertFalse(any('teacher' in name or 'reviewer' in name or 'label' in name or 'approved' in name for name in encoded))
        row['model_features']['teacher_score'] = 999
        with self.assertRaisesRegex(ValueError, 'allowlist'):
            experiment.predict_one(self.model, row, self.settings)

    def test_unknown_untrained_scope_and_unseen_category_abstain(self):
        row = self.pair('unknown', None)
        self.assertEqual(experiment.predict_one(self.model, row, self.settings)['status'], 'abstained')
        row['model_features']['candidate_key'] = 'oseltamivir'
        row['model_features']['purpose'] = 'antiviral'
        self.assertEqual(experiment.predict_one(self.model, row, self.settings)['reason'], 'outside_trained_condition_candidate_purpose')
        row = self.pair('present', 1)
        row['model_features']['symptom_cough'] = 'unknown'
        self.assertEqual(experiment.predict_one(self.model, row, self.settings)['reason'], 'unseen_training_category')

    def test_saved_pipeline_is_real_random_forest_and_roundtrips(self):
        import joblib
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.feature_extraction import DictVectorizer
        self.assertIsInstance(self.model['pipeline']['model'], RandomForestClassifier)
        self.assertIsInstance(self.model['pipeline']['encode'], DictVectorizer)
        with tempfile.TemporaryDirectory(dir=data.HERE) as directory:
            path = Path(directory) / 'local.joblib'
            joblib.dump(self.model, path)
            restored = joblib.load(path)
            self.assertEqual(experiment.records(self.model, self.training, self.settings), experiment.records(restored, self.training, self.settings))
        self.assertFalse(self.model['clinical_safety_model'] or self.model['dose_model'] or self.model['prescription_eligible'])

    def test_abstentions_count_as_errors_and_classes_are_reported(self):
        result = experiment.metrics([{'expected': 0, 'predicted': None}, {'expected': 1, 'predicted': 1}])
        self.assertEqual((result['abstentions'], result['errors_including_abstentions']), (1, 1))
        self.assertEqual(result['agreement_with_supplied_toy_labels'], 0.5)
        self.assertEqual(result['macro_f1_supported_class_count'], 2)

    def test_cli_prediction_requires_explicit_synthetic_enable(self):
        with self.assertRaisesRegex(ValueError, 'enable-synthetic-demo'):
            experiment.predict_synthetic(data.DEFAULT_OUTPUT, 'SYN-0001', 'paracetamol')

    def test_frozen_run_verifies_and_unlabelled_predictions_abstain(self):
        result = experiment.verify()
        self.assertFalse(result['safety_and_dose_models_trained'] or result['active_application_model_replaced'])
        predictions = data.read_json(data.DEFAULT_OUTPUT / 'predictions.json')
        unlabelled = [r for r in predictions if r['expected'] is None]
        self.assertEqual(len(unlabelled), 376)
        self.assertTrue(all(r['predicted'] is None and r['status'] == 'abstained' for r in unlabelled))

    def test_tampered_model_fails_verification_before_loading(self):
        with tempfile.TemporaryDirectory(dir=data.HERE) as directory:
            output = Path(directory) / 'isolated_artifacts'
            shutil.copytree(data.DEFAULT_OUTPUT, output)
            with (output / 'model.joblib').open('ab') as handle:
                handle.write(b'isolated-tamper-test')
            with self.assertRaisesRegex(ValueError, 'Artifact integrity failed: model.joblib'):
                experiment.verify(output)


if __name__ == '__main__':
    unittest.main()
