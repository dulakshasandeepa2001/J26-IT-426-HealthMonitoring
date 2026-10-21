"""Strict offline CSV/XLSX audit and inspectable synthetic pair dataset builder.

Workbook text is input data, never executable instructions. No ORM/network.
"""
import csv
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import xml.etree.ElementTree as ET
from zipfile import ZipFile

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
DEFAULT_OUTPUT = ROOT / 'docs/research/random_forest_200_v1'
SPLITS = ('train', 'validation', 'test')
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def require(value, message):
    if not value:
        raise ValueError(message)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8', newline='\n')


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def plan():
    return read_json(HERE / 'plan.json')


def symptoms():
    return tuple(key for key in plan()['features'] if key.startswith('symptom_'))


def workbook(path):
    """Read bounded data-only worksheet values; never evaluate formulae/links."""
    with ZipFile(path) as archive:
        require(sum(item.file_size for item in archive.infolist()) < 15_000_000, 'Workbook exceeds the inspection size limit.')
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(item.itertext()) for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        relations = {item.attrib['Id']: item.attrib for item in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        output = {}
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).find('m:sheets', NS):
            relation = relations[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = relation['Target']
            require(relation.get('TargetMode') != 'External' and ':' not in target and '..' not in PurePosixPath(target).parts, 'External worksheet targets are not allowed.')
            member = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(archive.read(member)).findall('m:sheetData/m:row', NS):
                cells = {}
                for cell in row:
                    if cell.find('m:f', NS) is not None:
                        require(sheet.attrib['name'] == 'Guide', 'Formula cells cannot supply training facts or labels.')
                        # Informational totals are not data: ignore formula AND cached value.
                        continue
                    value, inline = cell.find('m:v', NS), cell.find('m:is', NS)
                    text = (value.text or '') if value is not None else ''.join(inline.itertext()) if inline is not None else ''
                    if cell.attrib.get('t') == 's':
                        text = shared[int(text)]
                    elif cell.attrib.get('t') == 'b':
                        text = {'1': 'true', '0': 'false'}[text]
                    cells[re.sub(r'\d', '', cell.attrib['r'])] = text
                rows.append(cells)
            require(len(rows) <= 5000, 'Workbook has too many rows for this small experiment.')
            require(sheet.attrib['name'] not in output, 'Duplicate worksheet name.')
            output[sheet.attrib['name']] = rows
        return output


def table(rows):
    require(bool(rows), 'Empty worksheet.')
    header = rows[0]
    require(all(header.values()) and len(set(header.values())) == len(header), 'Worksheet headers must be unique and nonblank.')
    return [{name: row.get(column, '') for column, name in header.items()} for row in rows[1:] if any(row.values())]


def numeric(value, minimum=0, maximum=8760):
    if value == '':
        return None
    try:
        number = Decimal(value)
    except InvalidOperation as error:
        raise ValueError('Invalid numeric value.') from error
    require(number.is_finite() and minimum <= number <= maximum, 'Numeric value is outside the declared synthetic schema.')
    return float(number)


def normalize_case(row, settings):
    require(re.fullmatch(r'SYN-\d{4}', row['scenario_id']) and re.fullmatch(r'DEMO-P-\d{4}', row['synthetic_patient_id']), 'Only the explicitly synthetic scenario schema is accepted.')
    for name, value in {'data_origin': 'fully_synthetic', 'is_demo': 'true', 'dataset_version': settings['dataset_version'],
            'diagnosis_status': 'synthetic_assigned_not_doctor_confirmed', 'history_verified_for_visit': 'false',
            'onset_verified_by_doctor': 'false', 'clinical_assessment_verified': 'false', 'clinical_review_status': 'not_clinically_reviewed',
            'clinical_safety_label': '', 'approved_prescription_id': ''}.items():
        require(row[name] == value, 'Synthetic/provisional provenance mismatch: ' + name)
    condition = row['assigned_condition_code']
    require(condition in settings['conditions'] and row['assigned_condition_name'] == settings['conditions'][condition]['name'], 'Unsupported or conflicting condition.')
    require(row['suggested_split'] in SPLITS and row['template_family_id'].startswith(condition + '__'), 'Invalid family/split binding.')
    require(int(row['template_variant']) in range(1, 6), 'Invalid template variant.')
    result = dict(row)
    for name in symptoms():
        require(row[name] in ('true', 'false', ''), 'A symptom must be true, false or unknown: ' + name)
        result[name] = {'true': True, 'false': False, '': None}[row[name]]
    for name, lo, hi in [('age_months', 0, 1500), ('age_years', 0, 125), ('weight_kg', 0.1, 350), ('symptom_onset_hours', 0, 8760)]:
        result[name] = numeric(row[name], lo, hi)
    if result['age_months'] is not None:
        require(result['age_months'].is_integer(), 'Age months must be an integer.')
        require(result['age_years'] is not None and abs(result['age_months'] / 12 - result['age_years']) <= 0.011, 'Age units conflict.')
    else:
        require(result['age_years'] is None, 'Partial age units need clarification.')
    for name in ('allergies', 'current_medicines', 'reported_concerns'):
        result[name] = json.loads(row[name])
        require(isinstance(result[name], list), 'Expected a structured list: ' + name)
    for status, field in [('allergy_status', 'allergies'), ('current_medicine_status', 'current_medicines')]:
        require(row[status] in ('known', 'unknown', 'none_confirmed'), 'Unsupported history state.')
        require(bool(result[field]) == (row[status] == 'known'), 'Reported history status/list mismatch.')
    require(all(item.get('identity_verified') is False for item in result['allergies']), 'Do not import clinical allergy verification into this synthetic task.')
    require(all(item.get('product_identity_status') in ('reported_exact_name_unverified', 'unresolved') for item in result['current_medicines']), 'Current product facts must remain unverified.')
    result.update(synthetic_only=True, fact_origin='unverified_fictional_report', clinical_review_status='not_reviewed')
    return result


def expected_target(case, candidate, settings):
    targets = settings['toy_targets_by_candidate'].get(candidate)
    if not targets:
        return None, 'not_defined_for_this_purpose'
    values = [case['symptom_' + name] for name in targets]
    if any(value is True for value in values):
        return 1, 'target_symptom_recorded_present'
    if all(value is False for value in values):
        return 0, 'all_target_symptoms_recorded_absent'
    return None, 'target_symptom_information_incomplete'


def features(case, candidate, purpose):
    # Safety/history, IDs, labels, reasons, teacher decisions and split metadata
    # cannot enter the model. Unknown remains its own categorical token.
    return {'condition': case['assigned_condition_code'], 'candidate_key': candidate, 'purpose': purpose,
        **{key: 'unknown' if case[key] is None else 'present' if case[key] else 'absent' for key in symptoms()}}


def feature_key(row):
    return json.dumps(row['model_features'], sort_keys=True, separators=(',', ':'))


def unique_rows(rows):
    found = {}
    for row in rows:
        key = feature_key(row)
        require(key not in found or found[key]['label'] == row['label'], 'Conflicting supplied labels on identical model inputs.')
        found.setdefault(key, row)
    return list(found.values())


def inspect_inputs(csv_path, xlsx_path):
    """Validate only two contexts per condition and their supplied labels first."""
    settings = plan()
    with Path(csv_path).open(encoding='utf-8-sig', newline='') as handle:
        raw = list(csv.DictReader(handle))
    selected = [row for condition in settings['conditions'] for row in [r for r in raw if r['assigned_condition_code'] == condition][:settings['inspection_cases_per_condition']]]
    cases = {row['scenario_id']: normalize_case(row, settings) for row in selected}
    require(len(cases) == 12, 'The initial inspection needs two cases per condition.')
    rows = []
    for index, row in enumerate(table(workbook(xlsx_path)['Candidate labels']), 2):
        if row['scenario_id'] not in cases:
            continue
        case = cases[row['scenario_id']]
        condition = case['assigned_condition_code']
        require(settings['conditions'][condition]['candidates'].get(row['candidate_key']) == row['purpose'], 'Inspection candidate/purpose mismatch.')
        expected, reason = expected_target(case, row['candidate_key'], settings)
        label = int(row['toy_symptom_match_label']) if row['toy_symptom_match_label'] else None
        require(label == expected and row['toy_label_reason'] == reason, 'Initial batch label check failed.')
        rows.append({'scenario_id': row['scenario_id'], 'condition': condition, 'candidate': row['candidate_key'],
            'purpose': row['purpose'], 'label': label, 'reason': reason, 'worksheet_row': index,
            'clinical_review_status': 'not_reviewed', 'features': features(case, row['candidate_key'], row['purpose'])})
    require(len(rows) == 38, 'Initial candidate batch is incomplete.')
    return {'version': settings['version'], 'case_count': 12, 'candidate_rows': 38,
        'schema_checks': 'passed', 'label_checks': 'passed', 'rows': rows}


def load_inputs(csv_path, xlsx_path):
    settings = plan()
    with Path(csv_path).open(encoding='utf-8-sig', newline='') as handle:
        reader = csv.DictReader(handle)
        require(len(reader.fieldnames) == len(set(reader.fieldnames)), 'Duplicate CSV headers.')
        raw = list(reader)
    require(len(raw) == 200 and all(None not in row and None not in row.values() for row in raw), 'Expected 200 complete-schema synthetic rows.')
    # Inspect a small batch before expanding validation across all contexts.
    inspection = [row for condition in settings['conditions'] for row in [r for r in raw if r['assigned_condition_code'] == condition][:settings['inspection_cases_per_condition']]]
    for row in inspection:
        normalize_case(row, settings)
    cases = [normalize_case(row, settings) for row in raw]
    by_id = {row['scenario_id']: row for row in cases}
    require(len(by_id) == len(cases) and len({row['synthetic_patient_id'] for row in cases}) == len(cases), 'Duplicate scenario/patient ID.')
    groups = defaultdict(set)
    for case in cases:
        groups[case['template_family_id']].add(case['suggested_split'])
    require(all(len(splits) == 1 for splits in groups.values()), 'A template family crosses partitions.')
    sheets = workbook(xlsx_path)
    require({'Guide', 'Cases', 'Candidate labels'} <= set(sheets), 'Required workbook tables are missing.')
    excel_cases = table(sheets['Cases'])
    require(len(excel_cases) == 200 and len({r['scenario_id'] for r in excel_cases}) == 200, 'Workbook case count/IDs differ.')
    raw_ids = {row['scenario_id']: row for row in raw}
    for row in excel_cases:
        require(row['scenario_id'] in raw_ids, 'Workbook case is absent from CSV.')
        source = raw_ids[row['scenario_id']]
        for name, value in row.items():
            if name in symptoms():
                value = {'1': 'true', '0': 'false'}.get(value, value)
            if name in ('age_months', 'weight_kg', 'symptom_onset_hours'):
                require(numeric(value, 0, 8760) == numeric(source[name], 0, 8760), 'CSV/XLSX numeric mismatch: ' + name)
            else:
                require(name in source and value == source[name], 'CSV/XLSX case mismatch: ' + name)
    pairs, seen = [], set()
    for index, row in enumerate(table(sheets['Candidate labels']), 2):
        case = by_id.get(row['scenario_id'])
        require(case is not None, 'Candidate label has no scenario.')
        condition = case['assigned_condition_code']
        require(row['condition'] == settings['conditions'][condition]['name'], 'Candidate condition differs from case.')
        require(row['suggested_split'] == case['suggested_split'] and row['template_family_id'] == case['template_family_id'], 'Candidate split/family differs from case.')
        require(settings['conditions'][condition]['candidates'].get(row['candidate_key']) == row['purpose'], 'Unmapped candidate/purpose.')
        require((case['scenario_id'], row['candidate_key']) not in seen, 'Duplicate candidate/scenario.')
        seen.add((case['scenario_id'], row['candidate_key']))
        require(row['clinical_relevance_label'] == row['clinical_safety_label'] == '', 'Clinical labels were not supplied for this experiment.')
        require(row['toy_symptom_match_label'] in ('', '0', '1'), 'Unsupported supplied toy label.')
        label = int(row['toy_symptom_match_label']) if row['toy_symptom_match_label'] != '' else None
        expected, reason = expected_target(case, row['candidate_key'], settings)
        require(label == expected and row['toy_label_reason'] == reason, 'Supplied toy label/reason conflicts with the declared symptom-match definition.')
        pairs.append({'row_id': case['scenario_id'] + '::' + row['candidate_key'], 'scenario_id': case['scenario_id'],
            'template_family': case['template_family_id'], 'context_pattern': case['context_pattern'], 'split': case['suggested_split'],
            'condition': condition, 'candidate_key': row['candidate_key'], 'purpose': row['purpose'],
            'candidate_identity_scope': 'generic_concept_only; no exact product/dose asserted',
            'model_features': features(case, row['candidate_key'], row['purpose']), 'label': label, 'label_reason': reason,
            'label_method': 'rule_derived' if label is not None else None, 'label_origin': 'user_supplied_workbook_toy_target',
            'clinical_review_status': 'not_reviewed', 'clinical_safety_target': None, 'dose_target': None,
            'evidence_references': ['MediTrack_Synthetic_200.xlsx#Candidate labels!A' + str(index) + ':J' + str(index), 'patient_scenarios_200.csv#' + case['scenario_id']],
            'criteria_version': settings['version'], 'synthetic_only': True, 'prescription_eligible': False})
    require(all({r['candidate_key'] for r in pairs if r['scenario_id'] == case['scenario_id']} == set(settings['conditions'][case['assigned_condition_code']]['candidates']) for case in cases), 'A scenario is missing expected candidates.')
    unique_rows(pairs)
    audit = {'version': settings['version'], 'case_count': len(cases), 'candidate_rows': len(pairs), 'template_families': len(groups),
        'inspection_case_count': len(inspection), 'inspection_row_ids': [r['row_id'] for r in pairs if r['scenario_id'] in {c['scenario_id'] for c in inspection}],
        'csv_xlsx_overlapping_case_fields_agree': True, 'template_family_leakage': False,
        'labelled_rows': sum(r['label'] is not None for r in pairs), 'unlabelled_rows': sum(r['label'] is None for r in pairs),
        'label_balance': dict(Counter('unlabelled' if r['label'] is None else str(r['label']) for r in pairs)),
        'conditions': dict(Counter(c['assigned_condition_code'] for c in cases)),
        'target_availability': {'clinical_relevance_labels': 0, 'clinical_safety_labels': 0, 'dose_labels': 0, 'independent_clinician_reviews': 0},
        'input_selection': 'CSV supplies all 52 context fields; XLSX supplies 636 candidate-purpose toy labels. These are the same 200 cases, not 400.',
        'provenance': {'label_method': 'rule_derived', 'clinical_review_status': 'not_reviewed', 'independent_clinical_validation': False,
            'producer_readme_available': False, 'all_verified_input_flags_remain_false': True},
        'sources': {filename: {'sha256': digest(path), 'bytes': Path(path).stat().st_size} for filename, path in (('patient_scenarios_200.csv', csv_path), ('MediTrack_Synthetic_200.xlsx', xlsx_path))},
        'split_counts': {split: {'cases': sum(c['suggested_split'] == split for c in cases),
            'families': len({c['template_family_id'] for c in cases if c['suggested_split'] == split}),
            'candidate_rows': sum(r['split'] == split for r in pairs), 'labelled_rows': sum(r['split'] == split and r['label'] is not None for r in pairs)} for split in SPLITS}}
    return cases, pairs, audit


def build(csv_path, xlsx_path, output=DEFAULT_OUTPUT):
    inspection = inspect_inputs(csv_path, xlsx_path)
    cases, pairs, audit = load_inputs(csv_path, xlsx_path)
    output = Path(output)
    require(not (output / 'model.joblib').exists() and not (output / 'manifest.json').exists(), 'A trained run exists. Use a new output/version instead of overwriting it.')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'inputs').mkdir(exist_ok=True)
    for source, filename in ((csv_path, 'patient_scenarios_200.csv'), (xlsx_path, 'MediTrack_Synthetic_200.xlsx')):
        if Path(source).resolve() != (output / 'inputs' / filename).resolve():
            shutil.copyfile(source, output / 'inputs' / filename)
    for name, records in (('cases.jsonl', cases), ('candidate_rows.jsonl', pairs)):
        (output / name).write_text(''.join(json.dumps(r, sort_keys=True, allow_nan=False) + '\n' for r in records), encoding='utf-8', newline='\n')
    inspect_ids = set(audit['inspection_row_ids'])
    with (output / 'inspection_rows.csv').open('w', encoding='utf-8', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['row_id', 'template_family', 'split', 'condition', 'candidate_key', 'purpose', 'label', 'label_reason', 'clinical_review_status'])
        writer.writeheader()
        writer.writerows({key: row[key] for key in writer.fieldnames} for row in pairs if row['row_id'] in inspect_ids)
    write_json(output / 'audit.json', audit)
    write_json(output / 'plan.json', plan())
    write_json(output / 'inspection_batch.json', inspection)
    return audit
