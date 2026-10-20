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
let loseNextSave = false, held = null, holdNextPreview = false, notifyHeld, failNextPreview = false;
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const body = method === 'POST' ? request.postDataJSON() : undefined;
  if (method === 'POST' && url.pathname.includes('clinical-screening')) assert.ok(request.headers()['x-csrftoken'], 'Frontend supplies CSRF token');
  requests.push({ path: url.pathname, method, body });
  if (failNextPreview && url.pathname.endsWith('/clinical-screening/preview/')) {
    failNextPreview = false;
    return route.fulfill({ status: 503, json: { detail: 'Screening is temporarily busy with another database operation. Wait a few seconds and try again. No new screening result was confirmed.' }, headers });
  }
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
const section = () => page.getByRole('region', { name: 'Patient safety screening', exact: true });
const clinical = () => page.getByRole('group', { name: 'Clinical inputs for this visit', exact: true });
const saved = () => page.getByRole('region', { name: 'Saved safety screening assessment', exact: true });
const preview = () => section().getByRole('button', { name: 'Confirm inputs and screen medicines', exact: true });
const save = () => section().getByRole('button', { name: /^(Continue to ML suggestions|Save screening assessment)$/ });
const result = () => section().getByRole('region', { name: 'Six-condition screening result', exact: true });
const visible = (locator) => locator.waitFor({ state: 'visible' });
async function choose(row, clinicalReady = true) {
  await page.getByLabel('Assigned registered patient', { exact: true }).selectOption(String(row.patient));
  await page.getByLabel('Active encounter / consultation', { exact: true }).selectOption(row.visit);
  if (clinicalReady) await visible(clinical());
}
async function assess(row) {
  const edit = clinical().getByRole('button', { name: 'Edit all clinical details', exact: true });
  if (await edit.count()) await edit.click();
  for (const field of await clinical().locator('[data-clinical-field]').all()) {
    const name = await field.getAttribute('data-clinical-field'), value = row.clinical[name];
    if (await field.evaluate((node) => node.tagName === 'SELECT')) await field.selectOption(value ?? 'unknown');
    else await field.fill(value ?? '');
  }
  for (const field of await clinical().locator('[data-concern]').all()) await field.selectOption('false');
  for (const field of await clinical().locator('[data-symptom]').all()) {
    await field.selectOption('true');
    const name = await field.getAttribute('data-symptom');
    await clinical().locator(`[data-duration="${name}"]`).fill('12');
  }
}
async function quickAssess(row) {
  const questions = clinical().getByRole('region', { name: 'Questions to clarify', exact: true });
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
  const remember = clinical().getByLabel('Remember my explicit influenza guideline choice for future reviews on this browser. Each visit still requires confirmation.', { exact: true });
  if (!await remember.isDisabled()) await remember.check();
  assert.equal(await clinical().getByText('Visit inputs confirmed for the requested preview. Unknown facts remain unknown.', { exact: true }).count(), 0, 'Editing invalidates explicit confirmation');
  assert.equal(await clinical().getByRole('button', { name: 'Edit all clinical details', exact: true }).count(), 1, 'Quick path did not open the full form');
}
async function acknowledge() { await section().getByLabel('I reviewed this screening, exclusions and unresolved alternatives. Save this assessment to continue.', { exact: true }).check(); }
const artifacts = join(tmpdir(), 'meditrack-six-condition-workspace');
try {
  await page.goto(origin + '/doctor/prescription-workspace');
  await visible(page.getByLabel('Assigned registered patient', { exact: true }));
  for (const row of cases) {
    await choose(row);
    assert.equal(await page.getByRole('group', { name: 'Quick clinical review', exact: true }).count(), 0);
    assert.equal(await preview().isEnabled(), true, 'Explicit confirm-and-screen action is available');
    assert.equal(await clinical().getByText('Visit inputs confirmed for the requested preview. Unknown facts remain unknown.', { exact: true }).count(), 0);
    if (row.condition === 'influenza') {
      const summary = clinical().getByRole('region', { name: 'Patient review summary', exact: true });
      await page.getByRole('region', { name: 'Patient information', exact: true }).getByRole('button', { name: 'Edit allergies and current medicines', exact: true }).click();
      await visible(page.getByLabel('Allergy status', { exact: true }));
      assert.equal(requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).length, 0, 'Loading and opening fields never confirms or starts screening');
      failNextPreview = true;
      await preview().click();
      const feedback = section().getByRole('group', { name: 'Medicine preview feedback', exact: true });
      await visible(feedback.getByRole('alert').filter({ hasText: 'temporarily busy' }));
      await page.waitForFunction(() => document.activeElement?.id === 'medicine-preview-feedback');
      assert.equal(await result().count(), 0, 'Database failure never supplies partial candidates');
      assert.equal(await preview().isEnabled(), true, 'Busy response allows retry without re-entering facts');
      await visible(summary.getByText('Visit inputs confirmed for the requested preview. Unknown facts remain unknown.', { exact: true }));
      await page.clock.install();
      holdNextPreview = true;
      const timedRequest = new Promise((resolve) => { notifyHeld = resolve; });
      await preview().click(); await timedRequest;
      await visible(feedback.getByRole('status').filter({ hasText: 'Waiting for the database response' }));
      await page.clock.fastForward(31_000);
      await visible(feedback.getByRole('status').filter({ hasText: 'Screening is still running against the cloud database' }));
      assert.equal(await feedback.getByRole('alert').count(), 0, 'A cloud request is no longer aborted at the old 30-second boundary');
      held(); held = null;
      await visible(result());
      holdNextPreview = true;
      const hungRequest = new Promise((resolve) => { notifyHeld = resolve; });
      await preview().click(); await hungRequest;
      await page.clock.fastForward(75_100);
      await visible(feedback.getByRole('alert').filter({ hasText: 'Screening took too long' }));
      assert.equal(await preview().isEnabled(), true, 'A hung request is bounded and can be retried');
      held(); held = null;
      assert.equal(await result().count(), 0, 'An aborted late response never becomes a preview');
      await feedback.getByRole('button', { name: 'Try preview again', exact: true }).click(); await visible(result());
      await visible(feedback.getByRole('status').filter({ hasText: 'Screening complete: 0 medicine candidates' }));
      await page.waitForFunction(() => document.activeElement?.id === 'medicine-preview-feedback');
      const submitted = requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1).body.clinical;
      assert.equal(submitted.care_setting, 'unknown', 'Confirmation never invents assessed care setting');
      assert.equal(submitted.renal_assessment, 'unknown', 'Confirmation never clears an unknown renal assessment');
      await visible(result().getByText(/^No medicine candidate is available\./));
      const nextActions = section().getByRole('region', { name: 'Screening next actions', exact: true });
      await nextActions.getByRole('button', { name: 'Review clinical details', exact: true }).click();
      await visible(clinical().getByRole('button', { name: 'Show missing questions only', exact: true }));
      await page.waitForFunction(() => document.activeElement?.getAttribute('data-clinical-field') === 'care_setting');
      await visible(summary.getByText('Visit inputs confirmed for the requested preview. Unknown facts remain unknown.', { exact: true }));
      await clinical().getByRole('button', { name: 'Show missing questions only', exact: true }).click();
      assert.equal(await ask({ action: 'count' }).then((value) => value.count), 0, 'Preview has no draft writes');
    }
    if (row.condition === 'influenza') await quickAssess(row); else await assess(row);
    if (row.condition === 'influenza') {
      // Real key-by-key entry, rather than fill(), catches missing-question
      // inputs disappearing after the first digit on a controlled rerender.
      await clinical().getByRole('button', { name: 'Edit all clinical details', exact: true }).click();
      await clinical().locator('[data-clinical-field="onset_hours"]').fill('');
      await clinical().locator('[data-duration="fever"]').fill('');
      await clinical().getByRole('button', { name: 'Show missing questions only', exact: true }).click();
      const onset = clinical().locator('[data-clinical-field="onset_hours"]');
      await onset.pressSequentially('18.5');
      assert.equal(await onset.inputValue(), '18.5', 'Onset stays mounted for all typed digits');
      const fever = clinical().locator('[data-duration="fever"]');
      await fever.pressSequentially('48');
      assert.equal(await fever.inputValue(), '48', 'Duration stays mounted after the first digit');
      await clinical().getByRole('button', { name: 'Edit all clinical details', exact: true }).click();
      const guideline = clinical().locator('[data-clinical-field="influenza_guideline"]');
      await guideline.selectOption('WHO_2024');
      await preview().click(); await visible(result());
      const who = requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1).body.clinical;
      assert.equal(who.influenza_guideline, 'WHO_2024');
      assert.equal(who.onset_hours, '18.5');
      assert.equal(who.symptom_durations.fever, '48');
      await visible(result().getByRole('article', { name: 'Oseltamivir', exact: true }).getByText(/^WHO 2024 recommends against oseltamivir/).first());
      assert.equal(await guideline.inputValue(), 'WHO_2024', 'Preview never switches the explicit guideline');
      await section().getByRole('button', { name: 'Refresh screening inputs and drafts', exact: true }).click();
      await visible(clinical().getByRole('region', { name: 'Patient review summary', exact: true }).getByText(/^WHO 2024/));
      await quickAssess(row);
      await clinical().getByRole('button', { name: 'Edit all clinical details', exact: true }).click();
      // The fictional test doctor explicitly chooses CDC for the independent
      // existing available-candidate save/ML test; no live answers are changed.
      await guideline.selectOption('CDC_2026');
      await clinical().getByRole('button', { name: 'Show missing questions only', exact: true }).click();
    }
    if (row.condition === 'influenza') {
      mkdirSync(artifacts, { recursive: true });
      await clinical().screenshot({ path: join(artifacts, 'quick-review.png') });
    }
    await preview().click(); await visible(result());
    if (row.condition === 'influenza') {
      const original = requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1).body.clinical;
      await section().getByRole('button', { name: 'Refresh medicine reviews', exact: true }).click();
      await visible(section().getByText(/^Medicine review status refreshed\./));
      assert.equal(await result().count(), 0, 'Changed review coverage invalidates the old preview');
      await preview().click(); await visible(result());
      assert.deepEqual(requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1).body.clinical, original, 'Refreshing reviews preserves all confirmed clinical entries');
    }
    assert.equal(await save().isDisabled(), true, 'Preview needs separate acknowledgement');
    if (row.condition === 'viral_gastroenteritis') {
      await visible(result().getByText(/^No medicine candidate is available\./));
      await visible(result().getByText(/^Exact ORS label\/composition\/dilution remains unresolved/));
      assert.equal(await save().innerText(), 'Save screening assessment');
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
    if (row.condition === 'viral_gastroenteritis') {
      const ml = page.getByRole('region', { name: 'Experimental ML suggestions', exact: true });
      await ml.getByLabel('Enable Experimental ML medicine suggestions', { exact: true }).check();
      await ml.getByRole('button', { name: 'Generate ML suggestions', exact: true }).click();
      await visible(ml.getByText('Safety screening has made no medicine available. Review the exclusions and patient inputs before preparing a prescription draft.', { exact: true }));
      assert.equal(await ml.getByRole('button', { name: 'Prepare doctor-review draft', exact: true }).isDisabled(), true);
      assert.equal(await page.getByRole('region', { name: 'Doctor-review prescription draft', exact: true }).getByRole('button', { name: 'Approve selected medicines', exact: true }).count(), 0);
    }
    await page.reload(); await visible(saved());
    assert.equal(await preview().isEnabled(), true, 'Refresh offers explicit confirmation again; no screening runs automatically');
    assert.equal(await clinical().getByText('Visit inputs confirmed for the requested preview. Unknown facts remain unknown.', { exact: true }).count(), 0);
    if (row.condition === 'influenza') {
      assert.equal(await clinical().locator('[data-clinical-field="influenza_guideline"]').count(), 0, 'Explicitly remembered guideline is proposed again without another dropdown');
      await visible(clinical().getByRole('region', { name: 'Patient review summary', exact: true }).getByText(/^CDC 2026 outpatient pathway/));
    }
    console.log('PASS: ' + row.condition + ' real preview/save, independent inputs, unapproved history and refresh persistence.');
  }
  await choose(cases[3]); await assess(cases[3]);
  holdNextPreview = true;
  const waiting = new Promise((resolve) => { notifyHeld = resolve; });
  await preview().click(); await waiting;
  await clinical().locator('[data-clinical-field="condition_severity"]').selectOption('severe');
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
  // Save raw history without identities, then resolve it through the actual UI.
  const identityResponse = await ask({ method: 'GET', path: `/api/prescription/consultations/${cases[0].visit}/history-identities/` });
  assert.equal(identityResponse.status, 200);
  const product = identityResponse.data.products.find((row) => row.id === 'paracetamol-500mg-tablet');
  const histories = await ask({ method: 'GET', path: '/api/prescription/patient-contexts/' });
  const originalHistory = histories.data.find((row) => row.patient === cases[0].patient);
  const identityDetails = { allergies: [{ recorded_text: 'Penicillin (Rash)', identity: 'penicillin', reaction: 'Rash', reaction_date: null, clarification_note: '' }],
    medicines: [{ recorded_text: 'Paracetamol 500mg SOS', catalogue_id: product.id, expected_identity_hash: product.identity_hash,
      schedule: 'SOS', clarification_note: 'Fictional fixture doctor confirmed the exact 500 mg tablet product.' }] };
  const seeded = await ask({ method: 'POST', path: `/api/prescription/consultations/${cases[0].visit}/patient-context/`, body: {
    allergy_status: 'confirmed', allergies: ['Penicillin (Rash)'], medicine_status: 'confirmed', current_medicines: ['Paracetamol 500mg SOS'],
    reviewed: true, expected_updated_at: originalHistory.updated_at,
  } });
  assert.equal(seeded.status, 200);
  await page.goto(origin + '/doctor/prescription-workspace');
  await choose(cases[0], false);
  assert.equal(await page.getByText('Confirm recorded identities', { exact: true }).count(), 0);
  assert.equal(await page.locator('[aria-label="Resolve recorded history identities"]').count(), 0);
  assert.equal(await page.getByTestId('allergy-summary').textContent(), 'Penicillin (Rash)');
  assert.equal(await page.getByTestId('medicine-summary').textContent(), 'Paracetamol 500mg SOS');
  const historyForm = page.getByRole('region', { name: 'Patient information', exact: true });
  const clarify = historyForm.getByRole('region', { name: 'Confirm medicine and allergy names', exact: true });
  const allergen = clarify.getByLabel('Allergen for “Penicillin (Rash)”', { exact: true });
  const exactProduct = clarify.getByLabel('Exact product for “Paracetamol 500mg SOS”', { exact: true });
  await visible(allergen);
  assert.equal(await allergen.inputValue(), 'penicillin', 'A supported exact allergen is proposed for explicit doctor confirmation');
  assert.equal(await clarify.getByLabel('Reported reaction for “Penicillin (Rash)”', { exact: true }).inputValue(), 'Rash');
  assert.equal(await exactProduct.inputValue(), '', 'Strength/schedule prose does not automatically establish an exact product');
  await visible(clarify.getByText(/^Possible name\/strength matches \(not selected or confirmed\): Paracetamol/));
  // Collapsing the identity panel no longer silently omits prepared details.
  const historySavesBefore = requests.filter((request) => request.path.endsWith('/patient-context/') && request.method === 'POST').length;
  await historyForm.getByRole('button', { name: 'Hide name clarification', exact: true }).click();
  await page.getByLabel('I reviewed allergies and current medicines with the patient for this visit.', { exact: true }).check();
  await page.getByRole('button', { name: 'Save patient information', exact: true }).click();
  await visible(page.getByText(/^Patient information reviewed and saved for this visit\./));
  const collapsedSave = requests.filter((request) => request.path.endsWith('/patient-context/') && request.method === 'POST');
  assert.equal(collapsedSave.length, historySavesBefore + 1, 'Only an explicit save writes identities');
  assert.equal(collapsedSave.at(-1).body.history_details.allergies[0].identity, 'penicillin');
  assert.equal(collapsedSave.at(-1).body.history_details.medicines[0].catalogue_id, '', 'The unresolved product stays unresolved');
  await historyForm.getByRole('button', { name: 'Clarify medicine and allergy names', exact: true }).click();
  await visible(exactProduct);
  await exactProduct.selectOption(product.id);
  await historyForm.getByRole('button', { name: 'Cancel name clarification', exact: true }).click();
  await historyForm.getByRole('button', { name: 'Clarify medicine and allergy names', exact: true }).click();
  await visible(exactProduct);
  assert.equal(await exactProduct.inputValue(), '', 'Cancelling discards only unsaved name choices and reopens with unresolved source text');
  await exactProduct.selectOption(product.id);
  await page.getByLabel('I reviewed allergies and current medicines with the patient for this visit.', { exact: true }).check();
  assert.equal(await page.getByRole('button', { name: 'Save patient information', exact: true }).isDisabled(), true, 'A non-exact product needs a clarification note');
  await clarify.getByLabel('Reported schedule for “Paracetamol 500mg SOS”', { exact: true }).fill('SOS');
  await clarify.getByLabel('How was “Paracetamol 500mg SOS” clarified?', { exact: true }).fill(identityDetails.medicines[0].clarification_note);
  await historyForm.getByLabel('Proposed action for “Paracetamol 500mg SOS”', { exact: true }).selectOption('stop');
  await historyForm.getByLabel('Reason / review needs for “Paracetamol 500mg SOS”', { exact: true }).fill('Fictional proposed stop pending review, not an active status change.');
  await clarify.screenshot({ path: join(artifacts, 'history-clarification.png') });
  assert.equal(await page.getByLabel('I reviewed allergies and current medicines with the patient for this visit.', { exact: true }).isChecked(), false, 'Changing a proposed identity requires renewed doctor confirmation');
  await page.getByLabel('I reviewed allergies and current medicines with the patient for this visit.', { exact: true }).check();
  await page.getByRole('button', { name: 'Save patient information', exact: true }).click();
  await visible(page.getByText(/^Patient information reviewed and saved for this visit\./));
  await page.reload();
  await choose(cases[0]);
  const savedHistories = await ask({ method: 'GET', path: '/api/prescription/patient-contexts/' });
  const savedHistory = savedHistories.data.find((row) => row.patient === cases[0].patient);
  assert.deepEqual(savedHistory.provenance.history_identity.details, identityDetails, 'An unchanged basic-form review retains saved identity, reaction and schedule');
  assert.equal(savedHistory.provenance.medicine_plan.details[0].action, 'stop');
  assert.equal(savedHistory.provenance.medicine_plan.changes_active_history, false);
  assert.deepEqual(savedHistory.current_medicines, ['Paracetamol 500mg SOS']);
  assert.equal(await historyForm.getByLabel('Proposed action for “Paracetamol 500mg SOS”', { exact: true }).inputValue(), 'stop');
  assert.equal(requests.some((row) => /history-identities/.test(row.path)), true, 'The compact clarification panel reuses authorized backend name options');
  await assess(cases[0]); await preview().click(); await visible(result());
  await choose(cases[0]);
  assert.equal(await result().count(), 1, 'Selecting the already active patient/visit does not reset review flags or discard the preview');
  assert.equal(await result().getByText(/An allergy identity is unresolved|Unresolved current medicines prevent interaction clearance/).count(), 0);
  await visible(result().getByText(/^Duplicate normalized ingredient\(s\): acetaminophen\. Recorded current medicine\(s\): Paracetamol 500mg SOS\./).first());
  await visible(section().getByText(/^Current-medicine interaction assessment still prevents availability:/));
  assert.equal(await section().getByText(/^Names or history status need confirmation:/).count(), 0, 'Resolved products do not get misleading repeat name instructions');
  await visible(section().getByRole('link', { name: 'Review allergies and current medicines', exact: true }));
  const beforeHistorySave = requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1).body.clinical;
  const previewCount = requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).length;
  await historyForm.getByLabel('Proposed action for “Paracetamol 500mg SOS”', { exact: true }).selectOption('continue');
  await page.getByLabel('I reviewed allergies and current medicines with the patient for this visit.', { exact: true }).check();
  await page.getByRole('button', { name: 'Save patient information', exact: true }).click();
  await visible(clinical());
  assert.equal(await result().count(), 0, 'History save invalidates the earlier preview');
  assert.equal(await clinical().getByText('Visit inputs confirmed for the requested preview. Unknown facts remain unknown.', { exact: true }).count(), 0);
  assert.equal(requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).length, previewCount, 'History save does not confirm or screen automatically');
  await preview().click(); await visible(result());
  assert.deepEqual(requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1).body.clinical, beforeHistorySave, 'Same-visit history saves retain clinical answers while requiring a new explicit preview');
  assert.equal((await ask({ action: 'count' })).count, 6, 'Resolving history and previewing do not publish or write another draft');
  console.log('PASS: compact clarification saves explicit doctor identities, retains original history/reaction/schedule after reload, and preserves duplicate/interaction blocks.');
  // Expire a review only inside this in-memory fixture, then use the doctor's
  // real review form. The application must never fabricate a live review.
  await ask({ action: 'pending_safety_review', medicine: 'oseltamivir-75mg-capsule' });
  await preview().click(); await visible(result());
  const reviewLink = section().getByRole('region', { name: 'Screening next actions', exact: true }).getByRole('link', { name: /^Review Oseltamivir/ });
  assert.equal(await reviewLink.getAttribute('href'), '/doctor/medicine-knowledge?medicine=oseltamivir-75mg-capsule');
  const popup = context.waitForEvent('page');
  await reviewLink.click();
  const knowledge = await popup;
  knowledge.on('pageerror', (error) => errors.push(error.message));
  const medicine = knowledge.getByRole('article', { name: 'Oseltamivir medicine knowledge', exact: true });
  await visible(medicine);
  const rules = medicine.getByRole('region', { name: 'Safety rule review', exact: true });
  await visible(rules.getByText('Safety rule review · Pending review', { exact: true }));
  await rules.getByLabel('Safety rule review notes', { exact: true }).fill('Isolated fixture doctor inspected this current rule version and evidence.');
  await rules.getByLabel('I reviewed the executable rules, dose policies and exclusions against the linked evidence.', { exact: true }).check();
  await rules.getByRole('button', { name: 'Save safety rule review', exact: true }).click();
  await visible(rules.getByText('Safety rule review saved for this version.', { exact: true }));
  await knowledge.close(); await page.bringToFront();
  const beforeReviewRefresh = requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1).body.clinical;
  await section().getByRole('button', { name: 'Refresh medicine reviews', exact: true }).click();
  await visible(section().getByText(/^Medicine review status refreshed\./));
  await preview().click(); await visible(result());
  const refreshed = requests.filter((request) => request.path.endsWith('/clinical-screening/preview/')).at(-1);
  assert.deepEqual(refreshed.body.clinical, beforeReviewRefresh);
  assert.equal(await result().getByRole('article', { name: 'Oseltamivir', exact: true }).getByText(/Current reviews are required/).count(), 0);
  console.log('PASS: pending safety review opens the exact medicine in a separate tab, saves through the real doctor form, and refreshes without losing clinical entries.');
  // Prospective selected-pair evidence, never a generic interaction override.
  const pairReview = clinical().getByRole('region', { name: 'Selected interaction evidence review', exact: true });
  await visible(pairReview);
  const pairConfirmed = pairReview.getByLabel('I reviewed the linked evidence and its limited applicability to this exact medicine pair for this visit.', { exact: true });
  assert.equal(await pairConfirmed.isChecked(), false, 'Loading evidence never fabricates review');
  assert.equal(await pairConfirmed.isDisabled(), true, 'A real review reason is required');
  const originalDuplicate = await result().getByRole('article', { name: 'Paracetamol (acetaminophen)', exact: true }).getByText(/^Duplicate normalized ingredient/).first().innerText();
  await pairReview.getByLabel('Pair-review reason and remaining limitations', { exact: true }).fill('Isolated fictional doctor inspected TAMIFLU sections 7.2 and 12.3; other checks remain required.');
  await pairConfirmed.check();
  assert.equal(await result().count(), 0, 'Review edits invalidate the old preview');
  await preview().click(); await visible(result());
  await visible(section().getByText(/^Screening complete: 1 medicine candidate available for doctor review; 4 unavailable\./));
  await visible(result().getByRole('article', { name: 'Oseltamivir', exact: true }).getByText('Candidate for clinician review', { exact: true }));
  assert.equal(await result().getByRole('article', { name: 'Paracetamol (acetaminophen)', exact: true }).getByText(/^Duplicate normalized ingredient/).first().innerText(), originalDuplicate);
  await acknowledge(); await save().click(); await visible(saved());
  assert.equal((await ask({ action: 'count' })).count, 7);
  const pairedMl = page.getByRole('region', { name: 'Experimental ML suggestions', exact: true });
  await pairedMl.getByLabel('Enable Experimental ML medicine suggestions', { exact: true }).check();
  await pairedMl.getByRole('button', { name: 'Generate ML suggestions', exact: true }).click();
  await visible(pairedMl.getByText(/^Experimental ML · random_forest/));
  const oseltamivirSuggestion = pairedMl.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Oseltamivir', exact: true }) });
  await oseltamivirSuggestion.getByText('RF predictions and deterministic checks', { exact: true }).click();
  await visible(oseltamivirSuggestion.getByText('selected pair extension not in frozen training scope', { exact: true }));
  await pairedMl.getByRole('button', { name: 'Prepare doctor-review draft', exact: true }).click();
  const pairedDoctor = page.getByRole('region', { name: 'Doctor-review prescription draft', exact: true });
  await pairedDoctor.getByRole('button', { name: 'Edit medicines', exact: true }).click();
  await pairedDoctor.getByLabel('Select Oseltamivir', { exact: true }).check();
  await pairedDoctor.getByLabel('Doctor decision reason', { exact: true }).fill('Independent fictional doctor selection after source-based pair screening and RF limitations review.');
  await pairedDoctor.getByLabel('I reviewed the selected medicines, fixed screened regimens, exclusions and model limitations for this visit.', { exact: true }).check();
  await pairedDoctor.getByRole('button', { name: 'Approve selected medicines', exact: true }).click();
  await visible(page.locator('#prescription-slip'));
  assert.equal(await page.locator('#prescription-slip').getByText(/Oseltamivir/).count(), 1);
  assert.equal(await page.locator('#prescription-slip').getByText(/Paracetamol/).count(), 0);
  console.log('PASS: explicit source-bound pair review makes one candidate available, retains the duplicate exclusion, and flows through abstaining RF to independent doctor approval.');
  // Deliberately contradictory fixture facts verify that a mild dropdown cannot
  // bypass a severe finding retained in the source analysis.
  await ask({ action: 'reported_severe', visit: cases[1].visit });
  await page.goto(origin + '/doctor/prescription-workspace'); await choose(cases[1]); await assess(cases[1]);
  await preview().click(); await visible(result());
  await visible(result().getByText(/^No medicine candidate is available\./));
  await visible(section().getByText('The analysis reports severe disease. Changing the assessment dropdown cannot remove this reported-source block; the finding needs clinical clarification.', { exact: true }));
  assert.equal((await ask({ action: 'count' })).count, 7, 'Correction actions do not create extra assessments or prescriptions');
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
