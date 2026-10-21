// Pure selection boundary tests; no HTTP, clinical records or model fitting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/features/prescription-intelligence/medicineSelection.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { compatibleSelection } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const candidate = (id, role, ingredients = [id], more = {}) => ({ medicine_id: id, purpose: role, clinical_role: role,
  status: 'candidate_for_clinician_review', regimen: { amount: 1 }, product: { ingredients: ingredients.map((name) => ({ name })) }, ...more });
const a = candidate('a', 'antiviral'), b = candidate('b', 'symptom_relief'), c = candidate('c', 'antiviral');
assert.deepEqual(compatibleSelection([a, b], []), { ids: ['a', 'b'], needsIndividualChoice: false });
assert.deepEqual(compatibleSelection([a], []), { ids: ['a'], needsIndividualChoice: false }, 'Explicit click can select an available candidate when ML abstains');
assert.deepEqual(compatibleSelection([a, b, c], []).ids, ['b'], 'No arbitrary choice between same-purpose alternatives');
assert.deepEqual(compatibleSelection([a, b, c], ['c']).ids, ['c', 'b'], 'Preserves exactly one explicit alternative choice');
assert.deepEqual(compatibleSelection([a, b, c], ['a', 'c']).ids, ['b'], 'Conflicting explicit alternatives require individual choice');
assert.deepEqual(compatibleSelection([a, candidate('d', 'other', ['A'])], []).ids, [], 'No normalized duplicate ingredient combination');
assert.deepEqual(compatibleSelection([a, { ...b, status: 'unavailable' }, { ...c, regimen: null }], []).ids, ['a']);
assert.deepEqual(compatibleSelection([candidate('unknown', 'other', [], { product: null })], []).ids, [], 'Incomplete product identity is not bulk-selected');
console.log('PASS: compatible purpose groups, explicit alternatives, duplicates, missing identity, blocked candidates and ML abstention.');
