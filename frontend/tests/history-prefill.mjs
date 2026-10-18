// Execute production helpers offline. No app server, patient data or database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
function moduleUrl(name) {
  const source = readFileSync(new URL(`../src/features/prescription-intelligence/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from ["']\.\/([^"']+)["']/g, (_, dependency) => `from '${moduleUrl(dependency)}'`);
  return 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
}
const { patientHistoryPrefill } = await import(moduleUrl('historyPrefill'));
const { consultationReference } = await import(moduleUrl('consultationReference'));
const wire = JSON.parse(readFileSync(new URL('../../backend/prescription_context/samples/member1_influenza_demo.json', import.meta.url), 'utf8'));
const visit = { id: wire.consultation_id, patient: wire.patient_id, doctor: wire.doctor_id };
const analysis = { id: 1, consultation: visit.id, imported_at: '2026-10-18T09:00:00Z', payload: {
  schema_version: '2.0', patient_id: visit.patient, doctor_id: visit.doctor, consultation_id: visit.id,
  review_status: 'unconfirmed', is_demo: true, source: 'component_1_sample', analysis_reference: 'TEST',
  model_version: 'fixture', symptoms: [], condition_candidates: [], severity: { level: 'moderate', red_flags: [] },
  member1: { adapter_version: 'fixture', red_flag_assessment: 'not_assessed', mapping_issues: [], raw_output: wire },
} };
let result = patientHistoryPrefill(visit, analysis, null);
assert.equal(result.fields.allergyStatus, 'confirmed');
assert.equal(result.fields.allergyText, 'Penicillin (Rash)');
assert.equal(result.fields.medicineText, 'Paracetamol 500mg SOS');
assert.equal(result.reviewedForVisit, false, 'Extraction is never a saved review');

const empty = structuredClone(analysis);
empty.payload.member1.raw_output.payload.extracted_clinical_notes.patient_reported_allergies = [];
empty.payload.member1.raw_output.payload.extracted_clinical_notes.patient_current_medications = [];
for (const source of [null, empty, { ...analysis, payload: {} }]) {
  result = patientHistoryPrefill(visit, source, null);
  assert.equal(result.fields.allergyStatus, 'unknown');
  assert.equal(result.fields.medicineStatus, 'unknown');
}
const missing = structuredClone(analysis);
delete missing.payload.member1.raw_output.payload.extracted_clinical_notes.patient_reported_allergies;
assert.equal(patientHistoryPrefill(visit, missing, null).fields.allergyStatus, 'unknown');
for (const change of [{ consultation: 'other-visit' }, { payload: { ...analysis.payload, patient_id: 999 } },
  { payload: { ...analysis.payload, consultation_id: 'other-visit' } }, { payload: { ...analysis.payload, doctor_id: 999 } }]) {
  assert.equal(patientHistoryPrefill(visit, { ...analysis, ...change }, null).hasReported, false, 'Mismatched reports are ignored');
}
const saved = { patient: visit.patient, allergy_status: 'confirmed', allergies: ['Existing allergy'],
  medicine_status: 'confirmed', current_medicines: ['Existing medicine'], provenance: {} };
result = patientHistoryPrefill(visit, analysis, saved);
assert.equal(result.fields.allergyText, 'Existing allergy\nPenicillin (Rash)');
assert.equal(result.fields.medicineText, 'Existing medicine\nParacetamol 500mg SOS');
assert.equal(patientHistoryPrefill(visit, empty, saved).fields.allergyText, 'Existing allergy');
assert.equal(patientHistoryPrefill(visit, analysis, { ...saved, patient: 999 }).fields.allergyText, 'Penicillin (Rash)');
const dedup = { ...saved, allergies: ['PENICILLIN (RASH)'], current_medicines: ['Paracetamol 500mg SOS'] };
assert.equal(patientHistoryPrefill(visit, analysis, dedup).fields.allergyText, 'PENICILLIN (RASH)');
const none = { patient: visit.patient, allergy_status: 'none', allergies: [], medicine_status: 'none', current_medicines: [], provenance: {} };
assert.equal(patientHistoryPrefill(visit, empty, none).fields.allergyStatus, 'none', 'Explicit saved absence is retained');
assert.equal(patientHistoryPrefill(visit, analysis, none).fields.allergyStatus, 'confirmed', 'New reported positives require review even after previously reported absence');
const reviewed = { ...none, provenance: { last_reviewed_consultation: visit.id, last_reviewed_by: visit.doctor, last_reviewed_at: '2026-10-18T10:00:00Z' } };
assert.equal(patientHistoryPrefill(visit, analysis, reviewed).fields.allergyStatus, 'none', 'A later doctor correction is not replaced by older extraction');
const later = { ...analysis, imported_at: '2026-10-18T11:00:00Z' };
assert.equal(patientHistoryPrefill(visit, later, reviewed).reviewedForVisit, false, 'Later new positives require renewed review');
assert.equal(patientHistoryPrefill(visit, { ...analysis, imported_at: reviewed.provenance.last_reviewed_at }, reviewed).reviewedForVisit, false,
  'Equal browser timestamps cannot prove that positive history was reviewed');

const ids = ['00000000-0000-0000-0000-000000000000', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6e',
  '9b1deb4d-3b7d-4bad-abdd-2b0d7b3dcb6d'];
const references = ids.map(consultationReference);
assert.equal(new Set(references).size, ids.length);
for (const [index, reference] of references.entries()) {
  assert.match(reference, /^MT-(?:[0-9A-Z]{5}-){4}[0-9A-Z]{5}$/);
  const encoded = reference.slice(3).replaceAll('-', '').toLowerCase();
  let decoded = 0n;
  for (const digit of encoded) decoded = decoded * 36n + BigInt(parseInt(digit, 36));
  assert.equal(decoded.toString(16).padStart(32, '0'), ids[index].replaceAll('-', ''), 'All UUID bits survive; the ID is not truncated');
}
assert.equal(consultationReference(ids[2].toUpperCase()), references[2]);
assert.equal(consultationReference('invalid'), 'invalid');
console.log('PASS: bound JSON prefill, missing/empty remain unknown, saved history and later doctor corrections, renewed review for new reports, and lossless readable consultation IDs.');
