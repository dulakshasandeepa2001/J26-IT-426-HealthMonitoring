// Real Django APIs through an in-memory test bridge. No live HTTP writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://127.0.0.1:3000';
const child = spawn(fileURLToPath(new URL('../../.venv/Scripts/python.exe', import.meta.url)), ['-u', fileURLToPath(new URL('./six_condition_api_bridge.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
const queue = [];
let firstResolve, firstReject, stderr = '';
const first = new Promise((resolve, reject) => { firstResolve = resolve; firstReject = reject; });
child.stderr.on('data', (data) => { stderr += data; });
const lines = createInterface({ input: child.stdout });
lines.on('line', (line) => {
  try { const value = JSON.parse(line); if (value.ready) firstResolve(value); else { const pending = queue.shift(); if (value.bridge_error) pending?.reject(new Error(value.bridge_error)); else pending?.resolve(value); } }
  catch (error) { firstReject(error); queue.shift()?.reject(error); }
});
child.on('exit', (code) => { if (code) { const error = new Error(`Test bridge exited ${code}: ${stderr}`); firstReject(error); queue.splice(0).forEach((pending) => pending.reject(error)); } });
let chain = Promise.resolve();
function ask(message) {
  const result = chain.then(() => new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify(message) + '\n'); }));
  chain = result.catch(() => {}); return result;
}
const { cases } = await first;
console.log('Isolated Django bridge ready: six fictional consultations; no live database connection.');
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])).map((name) => join(cache, name, 'chrome-win64', 'chrome.exe')).find(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [], requests = [];
let loseNextSave = false, held = null, holdNextPreview = false, notifyHeld;
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const body = method === 'POST' ? request.postDataJSON() : undefined;
  if (method === 'POST' && url.pathname.includes('clinical-screening')) assert.ok(request.headers()['x-csrftoken'], 'Frontend supplies CSRF token');
  requests.push({ path: url.pathname, method, body });
  const result = await ask({ method, path: url.pathname + url.search, body });
  if (holdNextPreview && url.pathname.endsWith('/clinical-screening/preview/')) {
    holdNextPreview = false;
    await new Promise((resolve) => { held = resolve; notifyHeld?.(); });
  }
  if (loseNextSave && url.pathname.endsWith('/clinical-screening/drafts/') && result.status === 201) {
    loseNextSave = false;
    return route.fulfill({ status: 500, json: { detail: 'Test response lost after server saved the draft.' }, headers });
  }
  return route.fulfill({ status: result.status, json: result.data, headers });
});
const section = () => page.getByRole('region', { name: 'Generate a prescription recommendation draft', exact: true });
const saved = () => page.getByRole('region', { name: 'Saved six-condition screening draft', exact: true });
const preview = () => section().getByRole('button', { name: 'Preview medicine candidates', exact: true });
const save = () => section().getByRole('button', { name: /^(Generate Prescription Draft|Save assessment draft)$/ });
const result = () => section().getByRole('region', { name: 'Six-condition screening result', exact: true });
const visible = (locator) => locator.waitFor({ state: 'visible' });
async function choose(row) {
  await page.getByLabel('Assigned registered patient', { exact: true }).selectOption(String(row.patient));
  await page.getByLabel('Active encounter / consultation', { exact: true }).selectOption(row.visit);
  await visible(section().getByRole('group', { name: 'Quick clinical review', exact: true }));
}
async function assess(row) {
  const edit = section().getByRole('button', { name: 'Edit all clinical details', exact: true });
  if (await edit.count()) await edit.click();
  for (const field of await section().locator('[data-clinical-field]').all()) {
    const name = await field.getAttribute('data-clinical-field'), value = row.clinical[name];
    if (await field.evaluate((node) => node.tagName === 'SELECT')) await field.selectOption(value ?? 'unknown');
    else await field.fill(value ?? '');
  }
  for (const field of await section().locator('[data-concern]').all()) await field.selectOption('false');
  for (const field of await section().locator('[data-symptom]').all()) {
    await field.selectOption('true');
    const name = await field.getAttribute('data-symptom');
    await section().locator(`[data-duration="${name}"]`).fill('12');
  }
  await section().getByLabel('I checked the summary, symptom targets, corrections and remaining unknowns for this visit.', { exact: true }).check();
}
async function quickAssess(row) {
  const questions = section().getByRole('region', { name: 'Questions to clarify', exact: true });
  const fields = await questions.locator('[data-clinical-field]').evaluateAll((nodes) => nodes.map((node) => ({ name: node.getAttribute('data-clinical-field'), select: node.tagName === 'SELECT' })));
  for (const { name, select } of fields) {
    const input = questions.locator(`[data-clinical-field="${name}"]`);
    if (select) await input.selectOption(row.clinical[name]); else await input.fill(row.clinical[name] ?? '');
  }
  for (const name of await questions.locator('[data-concern]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-concern')))) await questions.locator(`[data-concern="${name}"]`).selectOption('false');
  for (const name of await questions.locator('[data-symptom]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-symptom')))) {
    await questions.locator(`[data-symptom="${name}"]`).selectOption('true');
    await questions.locator(`[data-duration="${name}"]`).fill('12');
  }
  const remember = section().getByLabel('Remember my explicit influenza guideline choice for future reviews on this browser. Each visit still requires confirmation.', { exact: true });
  if (!await remember.isDisabled()) await remember.check();
  await section().getByLabel('I checked the summary, symptom targets, corrections and remaining unknowns for this visit.', { exact: true }).check();
  assert.equal(await section().getByRole('button', { name: 'Edit all clinical details', exact: true }).count(), 1, 'Quick path did not open the full form');
}
async function acknowledge() { await section().getByLabel('I reviewed this preview, exclusions and any unresolved alternatives. Save as an unapproved screening draft.', { exact: true }).check(); }
const artifacts = join(tmpdir(), 'meditrack-six-condition-workspace');
try {
  await page.goto(origin + '/doctor/prescription-workspace');
  await visible(page.getByLabel('Assigned registered patient', { exact: true }));
  for (const row of cases) {
    await choose(row);
    await visible(section().getByText('Not yet confirmed by you for this visit.', { exact: true }));
    assert.equal(await section().getByRole('button', { name: 'Edit all clinical details', exact: true }).count(), 1);
    assert.equal(await preview().isDisabled(), true);
    if (row.condition === 'influenza') {
      await section().getByLabel('I checked the summary, symptom targets, corrections and remaining unknowns for this visit.', { exact: true }).check();
      await preview().click(); await visible(result());
      await visible(result().getByText(/^No medicine candidate is available\./));
      assert.equal(await ask({ action: 'count' }).then((value) => value.count), 0, 'Preview has no draft writes');
    }
    if (row.condition === 'influenza') await quickAssess(row); else await assess(row);
    if (row.condition === 'influenza') {
      mkdirSync(artifacts, { recursive: true });
      await section().getByRole('group', { name: 'Quick clinical review', exact: true }).screenshot({ path: join(artifacts, 'quick-review.png') });
    }
    await preview().click(); await visible(result());
    assert.equal(await save().isDisabled(), true, 'Preview needs separate acknowledgement');
    if (row.condition === 'viral_gastroenteritis') {
      await visible(result().getByText(/^No medicine candidate is available\./));
      await visible(result().getByText(/^Exact ORS label\/composition\/dilution remains unresolved/));
      assert.equal(await save().innerText(), 'Save assessment draft');
    } else assert.ok(await result().getByRole('region', { name: 'Medicine candidates for this patient', exact: true }).getByRole('article').count());
    if (row.condition === 'mumps' || row.condition === 'viral_conjunctivitis') await visible(result().getByText(/^Alternatives for the same purpose:/));
    await acknowledge();
    if (row.condition === 'influenza') {
      loseNextSave = true;
      await save().click(); await visible(section().getByRole('alert').filter({ hasText: 'Test response lost' }));
      assert.equal((await ask({ action: 'count' })).count, 1);
    }
    await save().click(); await visible(saved());
    assert.equal((await ask({ action: 'count' })).count, cases.indexOf(row) + 1, 'Save retry is idempotent');
    await page.reload(); await visible(saved());
    assert.equal(await preview().isDisabled(), true, 'Refresh requires a new summary confirmation');
    if (row.condition === 'influenza') {
      assert.equal(await section().locator('[data-clinical-field="influenza_guideline"]').count(), 0, 'Explicitly remembered guideline is proposed again without another dropdown');
      await visible(section().getByRole('region', { name: 'Patient review summary', exact: true }).getByText(/^CDC 2026 outpatient pathway/));
    }
    console.log('PASS: ' + row.condition + ' real preview/save, independent inputs, unapproved history and refresh persistence.');
  }
  await choose(cases[3]); await assess(cases[3]);
  holdNextPreview = true;
  const waiting = new Promise((resolve) => { notifyHeld = resolve; });
  await preview().click(); await waiting;
  await section().locator('[data-clinical-field="condition_severity"]').selectOption('severe');
  held(); await page.waitForTimeout(250);
  assert.equal(await result().count(), 0, 'Late preview cannot restore an obsolete plan');
  assert.equal(await save().isDisabled(), true);
  await assess(cases[3]); await preview().click(); await visible(result()); await acknowledge();
  await ask({ action: 'change_context', patient: cases[3].patient });
  await save().click(); await visible(section().getByRole('alert'));
  assert.equal(await result().count(), 0, '409 invalidates preview and acknowledgement');
  assert.equal(await save().isDisabled(), true);
  assert.equal((await ask({ action: 'count' })).count, 6);
  await page.goto(origin + '/doctor/prescription-records');
  await visible(page.getByLabel('Saved prescription draft', { exact: true }));
  assert.equal(await page.getByLabel('Saved prescription draft', { exact: true }).locator('option').count(), 7, 'Six new drafts coexist with the legacy draft');
  for (const option of await page.getByLabel('Saved prescription draft', { exact: true }).locator('option').all()) {
    await page.getByLabel('Saved prescription draft', { exact: true }).selectOption(await option.getAttribute('value'));
    if ((await option.getAttribute('value')).startsWith('legacy:')) await visible(page.getByRole('region', { name: 'Saved prescription screening draft', exact: true }));
    else await visible(saved());
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(await page.locator('main').evaluate((node) => node.scrollWidth > node.clientWidth + 1), false);
    }
  }
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'six-condition-records.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + '/doctor/prescription-workspace');
  await choose(cases[0]);
  await page.getByLabel('Allergy status', { exact: true }).selectOption('confirmed');
  await page.getByLabel('Allergies', { exact: true }).fill('Penicillin (Rash)');
  await page.getByLabel('Current medicine status', { exact: true }).selectOption('confirmed');
  await page.getByLabel('Current medicines', { exact: true }).fill('Paracetamol 500mg SOS');
  await visible(page.getByLabel('Current medicine identity 1', { exact: true }));
  assert.equal(await page.getByLabel('Allergen identity 1', { exact: true }).inputValue(), 'penicillin');
  assert.equal(await page.getByLabel('Current medicine identity 1', { exact: true }).inputValue(), '', 'No strength stripping or product guessing');
  await page.getByLabel('Current medicine identity 1', { exact: true }).selectOption('paracetamol-500mg-tablet');
  await page.getByLabel('Current medicine schedule 1', { exact: true }).fill('SOS');
  await page.getByLabel('Current medicine clarification 1', { exact: true }).fill('Patient confirmed the exact 500 mg tablet product.');
  await page.getByLabel('I reviewed allergies and current medicines with the patient for this visit.', { exact: true }).check();
  await page.getByRole('button', { name: 'Save patient information', exact: true }).click();
  await visible(page.getByText(/^Patient information reviewed and saved for this visit\./));
  await page.reload();
  await visible(page.getByLabel('Current medicine identity 1', { exact: true }));
  assert.equal(await page.getByLabel('Allergies', { exact: true }).inputValue(), 'Penicillin (Rash)');
  assert.equal(await page.getByLabel('Current medicines', { exact: true }).inputValue(), 'Paracetamol 500mg SOS');
  assert.equal(await page.getByLabel('Allergen identity 1', { exact: true }).inputValue(), 'penicillin');
  assert.equal(await page.getByLabel('Allergy reaction 1', { exact: true }).inputValue(), 'Rash');
  assert.equal(await page.getByLabel('Current medicine identity 1', { exact: true }).inputValue(), 'paracetamol-500mg-tablet');
  assert.equal(await page.getByLabel('Current medicine schedule 1', { exact: true }).inputValue(), 'SOS');
  await page.locator('[aria-label="Resolve recorded history identities"]').screenshot({ path: join(artifacts, 'history-identities.png') });
  await assess(cases[0]); await preview().click(); await visible(result());
  assert.equal(await result().getByText(/An allergy identity is unresolved|Unresolved current medicines prevent interaction clearance/).count(), 0);
  await visible(result().getByText('The candidate duplicates an ingredient in reported current medicines. Continuation/replacement needs a separate clinician decision.', { exact: true }));
  await visible(section().getByRole('link', { name: 'Review recorded allergy and medicine identities', exact: true }));
  assert.equal((await ask({ action: 'count' })).count, 6, 'Resolving history and previewing do not publish or write another draft');
  console.log('PASS: real history identity save/reload preserves penicillin reaction, original medicine text and schedule; duplicate/interaction controls remain.');
  await page.goto(origin + '/doctor/prescription-records');
  await visible(page.getByLabel('Saved prescription draft', { exact: true }));
  await ask({ action: 'revoke' });
  await page.getByRole('button', { name: 'Refresh draft records', exact: true }).click();
  await visible(page.locator('p[role="alert"]'));
  assert.equal(await saved().count(), 0);
  assert.equal(await page.getByLabel('Saved prescription draft', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  assert.equal(requests.some((row) => /train|publish|approve/.test(row.path)), false);
  console.log('PASS: lost-response retry, late preview invalidation, real stale-input conflict, Records, mobile and revoked-access clearing.');
} catch (error) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true });
  console.error('Page:', page.url(), 'Errors:', errors, 'Recent requests:', requests.slice(-4).map((row) => [row.method, row.path]));
  console.error((await page.locator('body').innerText()).slice(-6500));
  throw error;
} finally { held?.(); await browser.close(); child.stdin.end(); }
