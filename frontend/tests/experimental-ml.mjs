// Actual saved-model responses; all HTTP calls mocked, no live records or writes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://127.0.0.1:3000';
const interpreter = fileURLToPath(new URL(process.platform === 'win32' ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python', import.meta.url));
const python = spawnSync(interpreter, ['-X', 'utf8', '-c', `
import os, json
os.environ['DJANGO_SETTINGS_MODULE']='medicare_project.test_settings'
import django
django.setup()
from prescription_context.experimental_ml import frozen_options, frozen_prediction
from prescription_research.expansion import relevance as rv
from prescription_research import dataset as ds
batch=ds.read_json(rv.DEFAULT_OUTPUT/'batch.json')
candidates=['oseltamivir-75mg-capsule','acyclovir-800mg-tablet','paracetamol-500mg-tablet','paracetamol-500mg-tablet','cmc-sodium-05pct-ophthalmic-solution','ors-low-osmolarity-powder']
pairs=[(f'SIX-acute_multi_symptom-{i:02}',c) for i,c in enumerate(candidates,1)]
pairs += [(r['scenario_id'],r['candidate_id']) for r in [next(r for r in batch['candidate_rows'] if r['mapping_status']=='unsupported_condition'),batch['candidate_rows'][0]]]
print(json.dumps({'options':frozen_options(),'results':{s+'::'+c:frozen_prediction(s,c) for s,c in pairs},'pairs':pairs}))
`], { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), encoding: 'utf8' });
assert.equal(python.status, 0, python.stderr);
const fixtures = JSON.parse(python.stdout);
const doctor = { id: 101, role: 'doctor', username: 'synthetic_ml_doctor', doctorID: 'TEST' };
const patient = { id: 201, username: 'synthetic_registered', display_name: 'Synthetic Registered Patient', birthday: '1990-01-01', age_years: 36, dob_status: 'valid' };
const visits = [true, true, false].map((is_demo, i) => ({ id: `00000000-0000-4000-8000-${String(i + 41).padStart(12, '0')}`, patient: patient.id,
  doctor: doctor.id, assigned_by: 1, patient_name: patient.display_name, is_demo, reason: 'Test scope', started_at: '2026-10-16T09:00:00Z', created_at: '2026-10-16T09:00:00Z' }));
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((name) => join(cache, name, 'chrome-win64', 'chrome.exe')).find(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [], requests = [], bodies = [];
let mode = 'normal', delay = 0;
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), path = new URL(request.url()).pathname;
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (json, status = 200) => route.fulfill({ json, status, headers }).catch((error) => { if (!/closed|disposed|canceled/i.test(String(error))) throw error; });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  requests.push(request.method() + ' ' + path);
  if (path === '/session/') return send({ user: doctor, csrfToken: 'test-ml-csrf' });
  if (path === '/api/prescription/patients/') return send([patient]);
  if (path === '/api/prescription/consultations/') return send(visits);
  if (['patient-contexts', 'analyses', 'diagnoses', 'safety-profiles', 'drafts'].some((name) => path === `/api/prescription/${name}/`)) {
    assert.equal(request.method(), 'GET'); return send([]);
  }
  const match = path.match(/^\/api\/prescription\/consultations\/([^/]+)\/experimental-ml\/$/);
  if (match) {
    const consultation_id = match[1];
    assert.notEqual(consultation_id, visits[2].id, 'Real visit must never call ML endpoint');
    if (mode === 'disabled' || mode === 'revoked') return send({ detail: mode === 'disabled' ? 'Experimental ML is disabled.' : 'Doctor access revoked.' }, 403);
    if (request.method() === 'GET') return send({ ...fixtures.options, consultation_id });
    assert.equal(request.method(), 'POST');
    assert.equal(request.headers()['x-csrftoken'], 'test-ml-csrf');
    const body = request.postDataJSON(); bodies.push(body);
    assert.deepEqual(Object.keys(body).sort(), ['candidate_id', 'scenario_id', 'synthetic_demo']);
    assert.equal(body.synthetic_demo, true);
    const result = structuredClone(fixtures.results[body.scenario_id + '::' + body.candidate_id]);
    assert.ok(result, 'Use a prepared frozen fixture');
    if (mode === 'malformed') result.deterministic_safety.full_safety_clearance = true;
    if (mode === 'wrong-scope') result.consultation_id = visits[1].id;
    else result.consultation_id = consultation_id;
    if (mode === 'unavailable') return send({ detail: 'Frozen artifacts unavailable; cannot train or rebuild.' }, 503);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    return send(result);
  }
  throw new Error('Unmocked call: ' + request.method() + ' ' + path);
});
const panel = page.getByRole('region', { name: 'Experimental ML', exact: true });
const checkbox = () => panel.getByRole('checkbox', { name: 'Enable synthetic research analysis' });
const result = () => panel.getByLabel('Experimental ML result');
const visible = (locator) => locator.waitFor({ state: 'visible' });
async function choose(pair) {
  await panel.getByLabel('Frozen fictional scenario', { exact: true }).selectOption(pair[0]);
  await panel.getByLabel('Research medicine candidate', { exact: true }).selectOption(pair[1]);
}
async function predict() {
  await panel.getByRole('button', { name: 'Predict synthetic relevance' }).click();
}
try {
  await page.goto(origin + '/doctor/prescription-workspace');
  await page.getByLabel('Assigned registered patient').selectOption(String(patient.id));
  await page.getByLabel('Active encounter / consultation').selectOption(visits[0].id);
  await visible(checkbox());
  assert.equal(requests.filter((r) => r.includes('experimental-ml')).length, 0, 'No request before opt-in');
  mode = 'disabled'; await checkbox().click();
  await visible(panel.getByRole('alert'));
  assert.match(await panel.getByRole('alert').textContent(), /disabled/);
  assert.equal(await checkbox().isChecked(), false);
  mode = 'normal'; await checkbox().check();
  await visible(panel.getByText('categorical_tree · 27 unique training inputs', { exact: true }));
  assert.match(await panel.textContent(), /10\/16.*62.5%/);
  assert.match(await panel.textContent(), /not_reviewed/);
  assert.equal(await panel.getByRole('button', { name: 'Predict synthetic relevance' }).isDisabled(), true);
  for (let index = 0; index < fixtures.pairs.length; index++) {
    await choose(fixtures.pairs[index]);
    assert.equal(await result().count(), 0, 'Changing inputs clears previous result');
    await predict(); await visible(result());
    const text = await result().textContent();
    assert.match(text, /Prescription eligible: false · Approved: false · Published: false/);
    if (index === 5) { assert.match(text, /Provisional relevance: relevant/); assert.match(text, /product identity · blocked/); }
    if (index >= 6) assert.match(text, /Provisional relevance: Abstained/);
  }
  await choose(fixtures.pairs[0]); await predict(); await visible(result());
  await result().getByText('Model inputs and learned explanation', { exact: true }).click();
  assert.match(await result().locator('pre').first().textContent(), /"itching_present": null/);
  await result().getByText('Fictional patient context and sources', { exact: true }).click();
  assert.match(await result().locator('pre').nth(1).textContent(), /"age_years": 42/);
  assert.doesNotMatch(await result().textContent(), /1990-01-01|Synthetic Registered Patient/);
  for (const failing of ['malformed', 'wrong-scope', 'unavailable']) {
    mode = failing; await predict(); await visible(panel.getByRole('alert'));
    assert.equal(await result().count(), 0, 'Invalid/error result must be cleared');
  }
  mode = 'normal'; await predict(); await visible(result());
  delay = 800;
  const before = bodies.length;
  await predict();
  await page.waitForFunction(() => document.querySelector('[aria-label="Experimental ML"] button')?.disabled);
  await page.waitForTimeout(120);
  await panel.getByLabel('Frozen fictional scenario', { exact: true }).selectOption(fixtures.pairs[1][0]);
  await page.waitForTimeout(950);
  assert.equal(await result().count(), 0, 'Late response must not restore a changed fixture');
  assert.equal(bodies.length, before + 1);
  await choose(fixtures.pairs[0]); await predict();
  await page.waitForTimeout(120);
  await page.getByLabel('Active encounter / consultation').selectOption(visits[1].id);
  await page.waitForTimeout(950);
  assert.equal(await checkbox().isChecked(), false, 'Visit change resets opt-in');
  assert.equal(await result().count(), 0, 'Late response cannot cross visits');
  delay = 0; await checkbox().check(); await visible(panel.getByLabel('Frozen fictional scenario', { exact: true }));
  await choose(fixtures.pairs[5]); await predict(); await visible(result());
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No mobile horizontal overflow');
  mode = 'revoked'; await predict(); await visible(panel.getByRole('alert'));
  assert.equal(await result().count(), 0);
  assert.equal(await checkbox().isChecked(), false);
  assert.equal(await panel.getByLabel('Frozen fictional scenario', { exact: true }).count(), 0);
  mode = 'normal';
  await page.getByLabel('Active encounter / consultation').selectOption(visits[2].id);
  await visible(panel.getByText('Synthetic research consultations only', { exact: true }));
  assert.equal(await checkbox().count(), 0);
  assert.equal(requests.filter((r) => /^(POST|PUT|PATCH|DELETE) /.test(r) && !r.includes('/experimental-ml/')).length, 0);
  assert.deepEqual(errors, []);
  console.log(`Experimental ML browser checks passed: ${fixtures.pairs.length} frozen pairs, explicit opt-in, errors, late responses, real-visit exclusion, no writes, mobile.`);
} catch (error) {
  console.error('Synthetic panel error:', await panel.getByRole('alert').allTextContents(), 'Last fictional request:', bodies.at(-1), 'Browser errors:', errors);
  throw error;
} finally { await context.close(); await browser.close(); }
