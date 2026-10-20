import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/prescription-intelligence/screeningReasonGroups.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { sharedAssessmentReasons, blocksAvailability, historyActionGroups } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const shared = { category: 'clinical_scope', status: 'cannot_validate', message: 'Missing outpatient assessment.', source_ids: [],
  trace: { inputs: { care_setting: 'unknown' } } };
const local = ['dose', 'guideline', 'duplicate_ingredient', 'knowledge_review', 'product_rule_coverage'].map((category) => ({ ...shared, category }));
const data = { candidates: [{ generic_name: 'A', checks: [shared, shared, ...local] }, { generic_name: 'B', checks: [shared, ...local] },
  { generic_name: 'C', checks: [{ ...shared, message: 'Severe reported disease.' }] },
  { generic_name: 'D', checks: [{ ...shared, trace: { inputs: { care_setting: 'hospital' } } }] }] };
const before = structuredClone(data), groups = sharedAssessmentReasons(data);
assert.equal(groups.length, 1);
assert.deepEqual(groups[0].candidates, ['A', 'B']);
assert.deepEqual(data, before, 'Presentation grouping never mutates candidate status, checks or their evidence');
assert.equal(groups[0].check.message, shared.message);
assert.deepEqual(sharedAssessmentReasons({ candidates: [{ generic_name: 'A', checks: [shared, shared] }] }), []);
assert.equal(blocksAvailability({ category: 'interaction', status: 'warning' }), true);
assert.equal(blocksAvailability({ category: 'coverage', status: 'warning' }), false);
assert.equal(blocksAvailability({ category: 'guideline', status: 'warning', blocks_availability: false }), false);
const historyFindings = { candidates: [
  { generic_name: 'A', checks: [{ category: 'allergy', status: 'cannot_validate' }, { category: 'interaction', status: 'cannot_validate', trace: { inputs: { normalized_current_medicines: [{ status: 'unrecognized' }] } } }] },
  { generic_name: 'B', checks: [{ category: 'duplicate_ingredient', status: 'blocked' }, { category: 'interaction', status: 'warning', trace: { inputs: { 'context.medicine_status': 'confirmed', normalized_current_medicines: [{ status: 'recognized' }] } } }] },
  { generic_name: 'C', checks: [{ category: 'allergy', status: 'blocked' }] },
] };
const untouched = structuredClone(historyFindings);
assert.deepEqual(historyActionGroups(historyFindings), { unresolved: ['A'], duplicate: ['B'], allergy: ['C'], interaction: ['B'] });
assert.deepEqual(historyFindings, untouched, 'Explanatory actions never change original findings');
console.log('PASS: only identical shared assessments are grouped; different facts, candidate-specific blocks and original evidence are retained.');
