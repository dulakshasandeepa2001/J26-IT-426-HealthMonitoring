// Execute the actual pure TypeScript helpers; no app server or clinical records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(name) {
  const source = readFileSync(new URL(`../src/features/prescription-intelligence/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from ["']\.\/([^"']+)["']/g, (_, dependency) => `from '${moduleUrl(dependency)}'`);
  return 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
}
const { prefillReported, quickRequirements, readGuideline, writeGuideline, guidelineStorageKey, knownNumber } = await import(moduleUrl('quickReviewData'));
const input = { patient_age_years: 36, source_red_flag_assessment: 'not_assessed', source_observations: { severity: 'moderate', red_flags: [], assessments: {
  respiratory_concern: false, immunocompromised: false, pregnant_or_breastfeeding: false, neurological_concern: 'false', reported_onset_hours: null,
}, symptoms: [{ code: 'fever', present: true, duration_days: 3 }, { code: 'body_aches', present: null, duration_days: null }] } };
let value = prefillReported(input, 'influenza');
assert.equal(value.reviewed, false); assert.equal(value.symptoms_reviewed, false);
assert.equal(value.condition_severity, 'moderate'); assert.equal(value.red_flags, 'unknown');
assert.equal(value.care_setting, 'unknown'); assert.equal(value.renal_assessment, 'unknown'); assert.equal(value.hepatic_assessment, 'unknown');
assert.equal(value.special_population, 'unknown', 'Two negative concerns do not establish all special-population clearance');
assert.equal(value.condition_assessments.respiratory_concern, false);
assert.equal(value.condition_assessments.neurological_concern, null, 'String booleans are not accepted as facts');
assert.deepEqual(value.verified_symptoms, ['fever']); assert.equal(value.symptom_durations.fever, '72');
assert.equal(value.onset_hours, null, 'Fever duration is never substituted for antiviral onset');
assert.equal(value.influenza_guideline, 'unselected'); assert.equal(value.weight_kg, null);
value = prefillReported({ ...input, source_red_flag_assessment: 'assessed' }, 'influenza');
assert.equal(value.red_flags, 'none'); assert.equal(value.reviewed, false, 'An explicit producer assessment still needs doctor confirmation');
value = prefillReported({ ...input, source_observations: { ...input.source_observations, red_flags: ['Reported concern'] } }, 'influenza');
assert.equal(value.red_flags, 'present');
value = prefillReported({ ...input, source_observations: { ...input.source_observations, assessments: { reported_onset_hours: 6, reported_weight_kg: 22.5, weight_recorded_at: '2020-01-01T00:00:00Z' } } }, 'influenza');
assert.equal(value.onset_hours, '6'); assert.equal(value.weight_kg, null, 'No unnecessary adult weight prefill');
value = prefillReported({ ...input, patient_age_years: 8, source_observations: { ...input.source_observations, assessments: { reported_weight_kg: 22.5, weight_recorded_at: '2020-01-01T00:00:00Z' } } }, 'chickenpox');
assert.equal(value.weight_kg, '22.5'); assert.equal(value.reviewed, false);
value = prefillReported({ ...input, patient_age_years: 8, source_observations: { ...input.source_observations, assessments: { reported_weight_kg: 22.5 } } }, 'chickenpox');
assert.equal(value.weight_kg, null, 'Unspecified measurement time is not invented');
assert.equal(knownNumber(Number.NaN), null); assert.equal(knownNumber(-1), null); assert.equal(knownNumber(8761), null); assert.equal(knownNumber(1.234), null); assert.equal(knownNumber(0), '0');
const pilot = { medicine: 'paracetamol-500mg-tablet', conditions: ['mumps'], review_is_current: true, catalogue_review_current: true,
  content: { kind: 'paracetamol', parameters: { relevant_symptoms: ['fever', 'jaw_pain'] } } };
const scope = { medicine_id: 'ibuprofen-200mg-tablet', condition: 'mumps', content: { product: {} }, content_review: { is_current: true }, safety_review: { is_current: false },
  rules: { policy: { handler: 'ibuprofen', target_symptoms: ['jaw_pain'], concern_fields: ['intake_difficulty'] } } };
let required = quickRequirements('mumps', [pilot], [scope], 36);
assert.equal(required.activeCandidates, 1); assert.equal(required.fields.has('hepatic_assessment'), true);
assert.equal(required.fields.has('nsaid_assessment'), false, 'Unreviewed ibuprofen does not add questions');
assert.equal(required.fields.has('renal_assessment'), true, 'The encoded paracetamol reference requires a standard renal assessment');
required = quickRequirements('mumps', [pilot], [{ ...scope, safety_review: { is_current: true } }], 36);
assert.equal(required.activeCandidates, 2); assert.equal(required.fields.has('nsaid_assessment'), true);
required = quickRequirements('viral_gastroenteritis', [], [{ ...scope, condition: 'viral_gastroenteritis', content: { product: null }, safety_review: { is_current: true } }], 36);
assert.equal(required.fields.size, 0); assert.equal(required.activeCandidates, 0);
const storage = new Map();
globalThis.localStorage = { getItem: (key) => storage.get(key) ?? null, setItem: (key, entry) => storage.set(key, entry), removeItem: (key) => storage.delete(key) };
assert.equal(readGuideline(1, 'v1'), 'unselected');
writeGuideline(1, 'v1', 'WHO_2024', true);
assert.equal(readGuideline(1, 'v1'), 'WHO_2024'); assert.equal(readGuideline(2, 'v1'), 'unselected'); assert.equal(readGuideline(1, 'v2'), 'unselected');
storage.set(guidelineStorageKey(1, 'v1'), 'anything_else'); assert.equal(readGuideline(1, 'v1'), 'unselected');
writeGuideline(1, 'v1', 'CDC_2026', false); assert.equal(readGuideline(1, 'v1'), 'unselected');
console.log('PASS: explicit source prefill, unknowns and review flags, no onset inference, measured weight provenance, current-rule question selection and scoped explicit guideline preference.');
