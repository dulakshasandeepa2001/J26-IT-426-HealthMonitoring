import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/features/prescription-intelligence/medicinePlanDrafts.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { prepareMedicinePlans, medicinePlansValid } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const names = ['Fictional current product'];
const initial = prepareMedicinePlans(names, 'visit-a');
assert.deepEqual(initial, [{ recorded_text: names[0], action: 'undecided', note: '' }]);
const saved = { version: 'current-medicine-proposals-v1', consultation_id: 'visit-a', status: 'proposed_only',
  changes_active_history: false, reviewed_by: 123, reviewed_at: '2026-10-20T00:00:00Z',
  details: [{ recorded_text: names[0], action: 'stop', note: 'Fictional proposal pending review.' }] };
assert.deepEqual(prepareMedicinePlans(names, 'visit-a', saved), saved.details);
assert.deepEqual(prepareMedicinePlans(names, 'visit-b', saved), initial, 'Do not inherit clinical decisions from another visit');
assert.equal(prepareMedicinePlans(['Different product'], 'visit-a', saved)[0].action, 'undecided');
assert.deepEqual(prepareMedicinePlans(names, 'visit-a', { ...saved, reviewed_by: null }), initial);
assert.equal(medicinePlansValid(initial), true);
assert.equal(medicinePlansValid([{ ...initial[0], action: 'continue' }]), false);
assert.equal(medicinePlansValid(saved.details), true);
assert.deepEqual(names, ['Fictional current product'], 'Planning never removes an active history entry');
console.log('PASS: visit-bound proposals, explicit reasons, immutable active history and no inherited decisions.');
