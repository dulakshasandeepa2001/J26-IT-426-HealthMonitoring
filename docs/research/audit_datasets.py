"""Count pilot coverage in public research datasets, without exporting patient rows.

Downloads stay outside the repository. This script does not query the application
database, train models, infer missing clinical facts or execute dataset contents.
"""
import argparse
import csv
import gzip
import hashlib
import io
import json
import re
import zipfile
from collections import Counter
from pathlib import Path


def archive_tables(path):
    with zipfile.ZipFile(path) as archive:
        for name in archive.namelist():
            if not name.lower().endswith(('.csv', '.tsv')):
                continue
            with io.TextIOWrapper(archive.open(name), encoding='utf-8-sig', errors='replace', newline='') as stream:
                reader = csv.DictReader(stream, delimiter='\t' if name.endswith('.tsv') else ',')
                yield name, reader.fieldnames, list(reader)


def gz_table(path):
    with gzip.open(path, 'rt', encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        return reader.fieldnames, list(reader)


def explicit_condition(value):
    normalized = value.strip().casefold()
    if normalized == 'influenza':
        return 'influenza'
    if normalized in ('chickenpox', 'chicken pox', 'varicella'):
        return 'chickenpox'
    return None


def icd_condition(code, version=None):
    code = re.sub(r'[^A-Za-z0-9]', '', code).upper()
    if version in (None, '9') and code.startswith(('487', '488')):
        return 'influenza'
    if version in (None, '10') and code.startswith(('J09', 'J10', 'J11')):
        return 'influenza'
    if version in (None, '9') and code.startswith('052'):
        return 'chickenpox'
    if version in (None, '10') and code.startswith('B01'):
        return 'chickenpox'
    return None


def review_archive(root, filename):
    tables = []
    for name, columns, rows in archive_tables(root / filename):
        counts = Counter(); pilot_drugs = Counter(); other_labels = Counter()
        for row in rows:
            condition = row.get('condition', row.get('Disease', ''))
            pilot = explicit_condition(condition)
            if pilot:
                counts[pilot] += 1
                drug = row.get('drugName', row.get('urlDrugName', ''))
                if drug:
                    pilot_drugs[(pilot, drug)] += 1
            elif re.search(r'influenza|chicken[ -]?pox|varicella|\bflu\b', condition, re.I):
                other_labels[condition] += 1
        tables.append({'file': name, 'rows': len(rows), 'columns': columns,
                       'explicit_pilot_rows': {key: counts[key] for key in ('influenza', 'chickenpox')},
                       'other_related_labels_not_promoted': dict(other_labels),
                       'pilot_drug_labels': [{'condition': condition, 'drug': drug, 'rows': count}
                                            for (condition, drug), count in pilot_drugs.most_common()]})
    return {'tables': tables, 'total_rows': sum(table['rows'] for table in tables)}


def synthea(root):
    tables = []
    for name, columns, rows in archive_tables(root / 'synthea-sample-csv.zip'):
        base = name.rsplit('/', 1)[-1]
        if base not in ('patients.csv', 'conditions.csv', 'allergies.csv', 'medications.csv'):
            continue
        related = Counter(row.get('DESCRIPTION', '') for row in rows
                          if base == 'conditions.csv' and re.search(
                              r'influenza|chicken[ -]?pox|varicella', row.get('DESCRIPTION', ''), re.I))
        tables.append({'file': base, 'rows': len(rows), 'columns': columns,
                       'related_condition_descriptions': dict(related)})
    return {'tables': tables}


def mimic(root):
    patient_columns, patients = gz_table(root / 'mimic-patients.csv.gz')
    diagnosis_columns, diagnoses = gz_table(root / 'mimic-diagnoses_icd.csv.gz')
    code_counts = Counter(); patient_sets = {'influenza': set(), 'chickenpox': set()}
    for row in diagnoses:
        condition = icd_condition(row['icd_code'], row['icd_version'])
        if condition:
            code_counts[(condition, row['icd_version'], row['icd_code'])] += 1
            patient_sets[condition].add(row['subject_id'])
    return {'patient_rows': len(patients), 'diagnosis_rows': len(diagnoses),
            'patient_columns': patient_columns, 'diagnosis_columns': diagnosis_columns,
            'pilot_patients': {key: len(value) for key, value in patient_sets.items()},
            'matched_diagnosis_codes': [{'condition': condition, 'icd_version': version,
                                        'icd_code': code, 'rows': count}
                                       for (condition, version, code), count in code_counts.items()],
            'scope_note': 'Complete patient/diagnosis tables only. Prescription and full code dictionary downloads timed out and were not counted.'}


def eicu(root):
    tables = {name: gz_table(root / f'eicu-{name}.csv.gz')
              for name in ('patient', 'diagnosis', 'allergy', 'admissiondrug')}
    unit_sets = {'influenza': set(), 'chickenpox': set()}; descriptions = Counter()
    for row in tables['diagnosis'][1]:
        conditions = {icd_condition(code) for code in row.get('icd9code', '').split(',')}
        text = row.get('diagnosisstring', '')
        if re.search(r'\binfluenza\b', text, re.I):
            conditions.add('influenza')
        if re.search(r'\bchicken\s*pox\b|\bvaricella\b', text, re.I):
            conditions.add('chickenpox')
        for condition in conditions - {None}:
            unit_sets[condition].add(row['patientunitstayid'])
            descriptions[(condition, text)] += 1
    return {'tables': [{'file': key, 'rows': len(rows), 'columns': columns}
                       for key, (columns, rows) in tables.items()],
            'pilot_unit_stays': {key: len(value) for key, value in unit_sets.items()},
            'matching_descriptions': [{'condition': condition, 'description': description, 'rows': count}
                                     for (condition, description), count in descriptions.items()],
            'scope_note': 'Complete patient/diagnosis/allergy/admissiondrug tables. The separate medication-orders download was incomplete and was not counted.'}


def dialmed(root):
    labels = json.loads((root / 'dialmed-label.json').read_text(encoding='utf-8'))
    diseases = Counter(); drugs = Counter(); splits = []; schemas = None
    for split in ('train', 'dev', 'test'):
        count = 0
        for line in (root / f'dialmed-{split}.txt').read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            row = json.loads(line); count += 1
            diseases.update(row['disease']); drugs.update(row['label'])
            schemas = schemas or {key: type(value).__name__ for key, value in row.items()}
        splits.append({'split': split, 'rows': count})
    # Literal Chinese diagnosis labels, not diagnoses guessed from conversations.
    influenza_names = ('\u6d41\u611f', '\u6d41\u884c\u6027\u611f\u5192', 'influenza')
    chickenpox_names = ('\u6c34\u75d8', 'chickenpox', 'varicella')
    return {'splits': splits, 'total_dialogues': sum(row['rows'] for row in splits),
            'schema': schemas, 'medication_label_count': len(labels), 'disease_labels': dict(diseases),
            'explicit_pilot_dialogues': {'influenza': sum(diseases[name] for name in influenza_names),
                                        'chickenpox': sum(diseases[name] for name in chickenpox_names)},
            'pilot_ingredient_label_mentions_across_all_diseases': {
                name: drugs[name] for name, identifier in labels.items() if identifier in (24, 27, 51, 55)},
            'leakage_note': 'Use the medication-masked dialog field for experiments; original_dialog may reveal recommendation labels.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(); root = args.data_dir.resolve()
    result = {'audit_date': '2026-10-14', 'purpose': 'Influenza/Chickenpox pilot dataset feasibility',
              'review_method': 'Complete specified files, aggregate counts only; dataset presence is not clinical validation.',
              'drug_reviews': review_archive(root, 'kaggle-drug-reviews.zip'),
              'druglib': review_archive(root, 'druglib-reviews.zip'),
              'patient_profile': review_archive(root, 'disease-patient-profile.zip'),
              'medicine_catalogue': review_archive(root, 'medicine-details.zip'),
              'synthea': synthea(root), 'mimic_demo': mimic(root), 'eicu_demo': eicu(root),
              'dialmed': dialmed(root)}
    names = ('kaggle-drug-reviews.zip', 'druglib-reviews.zip', 'disease-patient-profile.zip',
             'medicine-details.zip', 'synthea-sample-csv.zip', 'mimic-patients.csv.gz',
             'mimic-diagnoses_icd.csv.gz', 'eicu-patient.csv.gz', 'eicu-diagnosis.csv.gz',
             'eicu-allergy.csv.gz', 'eicu-admissiondrug.csv.gz', 'dialmed-label.json',
             'dialmed-train.txt', 'dialmed-dev.txt', 'dialmed-test.txt')
    result['file_manifest'] = [{'file': name, 'bytes': (root / name).stat().st_size,
                               'sha256': hashlib.sha256((root / name).read_bytes()).hexdigest()} for name in names]
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'output': str(args.output), 'datasets_audited': 8,
                      'mimic_pilot_patients': result['mimic_demo']['pilot_patients'],
                      'eicu_pilot_stays': result['eicu_demo']['pilot_unit_stays'],
                      'dialmed_pilot_dialogues': result['dialmed']['explicit_pilot_dialogues']}))


if __name__ == '__main__':
    main()
