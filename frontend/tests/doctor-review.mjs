// Real APIs in in-memory SQLite. No clinical DB, model training or PDF export.
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
const queue = []; let readyResolve, readyReject, stderr = '';
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
child.stderr.on('data', (data) => { stderr += data; });
createInterface({ input: child.stdout }).on('line', (line) => {
  try { const data = JSON.parse(line); if (data.ready) readyResolve(data); else { const pending = queue.shift(); data.bridge_error ? pending?.reject(new Error(data.bridge_error)) : pending?.resolve(data); } }
  catch (error) { readyReject(error); queue.shift()?.reject(error); }
});
child.on('exit', (code) => { if (code) { const error = new Error(`Bridge exited ${code}: ${stderr}`); readyReject(error); queue.splice(0).forEach((item) => item.reject(error)); } });
let chain = Promise.resolve();
function ask(message) { const result = chain.then(() => new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify(message) + '\n'); })); chain = result.catch(() => {}); return result; }
const { cases } = await ready, row = cases[0];
console.log('Isolated doctor-review bridge ready; fictional patient and real saved model.');
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])).map((name) => join(cache, name, 'chrome-win64', 'chrome.exe')).find(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await context.addInitScript(() => { window.__demoPrintCount = 0; window.print = () => { window.__demoPrintCount++; }; });
let loseApproval = false;
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  const body = method === 'POST' ? request.postDataJSON() : undefined;
  if (method === 'POST') assert.ok(request.headers()['x-csrftoken']);
  const result = await ask({ method, path: url.pathname + url.search, body });
  if (loseApproval && body?.action === 'approved' && result.status === 201) { loseApproval = false; return route.fulfill({ status: 500, json: { detail: 'Test approval response lost after save.' }, headers }); }
  return route.fulfill({ status: result.status, json: result.data, headers });
});
const visible = (locator) => locator.waitFor({ state: 'visible' });
const section = () => page.getByRole('region', { name: 'Doctor-review prescription draft', exact: true });
const ml = () => page.getByRole('region', { name: 'Experimental ML suggestions', exact: true });
const screening = () => page.getByRole('region', { name: 'Patient safety screening', exact: true });
const clinical = () => page.getByRole('group', { name: 'Clinical inputs for this visit', exact: true });
const reviewCheck = () => section().getByLabel('I reviewed the selected medicines, fixed screened regimens, exclusions and model limitations for this visit.', { exact: true });
const artifacts = join(tmpdir(), 'meditrack-doctor-review');
try {
  await ask({ action: 'fictional_doctor_profile' });
  await page.goto(origin + '/doctor/prescription-workspace');
  await visible(page.getByLabel('Assigned registered patient', { exact: true }));
  await page.getByLabel('Assigned registered patient', { exact: true }).selectOption(String(row.patient));
  await page.getByLabel('Active encounter / consultation', { exact: true }).selectOption(row.visit);
  await visible(clinical());
  assert.equal(await page.getByRole('group', { name: 'Quick clinical review', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Confirm clinical summary', exact: true }).count(), 0);
  assert.equal(await clinical().locator('..').evaluate((node) => node.closest('section')?.getAttribute('aria-label')), 'Patient information');
  const stageNames = await page.locator('section[aria-label]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
  assert.ok(stageNames.indexOf('Patient safety screening') < stageNames.indexOf('Experimental ML suggestions'));
  assert.ok(stageNames.indexOf('Experimental ML suggestions') < stageNames.indexOf('Doctor-review prescription draft'));
  assert.equal(await page.getByLabel('Frozen fictional scenario', { exact: true }).count(), 0, 'Frozen experiment is separate from the medicine workflow');
  assert.equal(await ml().getByLabel('Enable Experimental ML medicine suggestions', { exact: true }).count(), 0, 'Screening must be saved first');
  await clinical().getByRole('button', { name: 'Edit all clinical details', exact: true }).click();
  for (const field of await clinical().locator('[data-clinical-field]').all()) {
    const name = await field.getAttribute('data-clinical-field'), value = row.clinical[name];
    if (await field.evaluate((node) => node.tagName === 'SELECT')) await field.selectOption(value ?? 'unknown');
    else await field.fill(value ?? '');
  }
  for (const field of await clinical().locator('[data-concern]').all()) await field.selectOption('false');
  for (const field of await clinical().locator('[data-symptom]').all()) {
    await field.selectOption('true');
    await clinical().locator(`[data-duration="${await field.getAttribute('data-symptom')}"]`).fill('12');
  }
  await screening().getByRole('button', { name: 'Confirm inputs and screen medicines', exact: true }).click();
  await visible(screening().getByRole('region', { name: 'Six-condition screening result', exact: true }));
  await screening().getByLabel('I reviewed this screening, exclusions and unresolved alternatives. Save this assessment to continue.', { exact: true }).check();
  await screening().getByRole('button', { name: 'Continue to ML suggestions', exact: true }).click();
  await visible(ml().getByLabel('Enable Experimental ML medicine suggestions', { exact: true }));
  await visible(section());
  await ml().getByLabel('Enable Experimental ML medicine suggestions', { exact: true }).check();
  await ml().getByRole('button', { name: 'Generate ML suggestions', exact: true }).click();
  await visible(ml().getByText(/^Experimental ML · random_forest/));
  await ml().getByText('Connected Random Forest models', { exact: true }).click();
  await visible(ml().getByText('five selected-rule imitation classifiers', { exact: true }));
  const paracetamol = ml().getByRole('article').filter({ has: page.getByRole('heading', { name: 'Paracetamol (acetaminophen)', exact: true }) });
  await paracetamol.getByText('RF predictions and deterministic checks', { exact: true }).click();
  await visible(paracetamol.getByRole('columnheader', { name: 'Selected deterministic check', exact: true }));
  await visible(paracetamol.getByText(/^Supplementary symptom-match RF:/));
  assert.equal(await section().getByRole('link', { name: 'Open approved prescription', exact: true }).count(), 0);
  assert.equal(await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).count(), 0, 'Prediction alone does not expose doctor decisions');
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'screening-ml-suggestions.png'), fullPage: true });
  await ml().getByRole('button', { name: 'Prepare doctor-review draft', exact: true }).click();
  await page.screenshot({ path: join(artifacts, 'doctor-review-draft.png'), fullPage: true });
  assert.equal(await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).isDisabled(), true);
  assert.equal(await section().getByLabel('Select Oseltamivir', { exact: true }).isEnabled(), true, 'Medicine selection is available without a separate edit-mode gate');
  await section().getByRole('button', { name: 'Select all compatible medicines', exact: true }).click();
  assert.equal(await section().getByLabel('Select Oseltamivir', { exact: true }).isChecked(), true);
  assert.equal(await section().getByLabel('Select Paracetamol (acetaminophen)', { exact: true }).isChecked(), true);
  assert.equal(await section().getByRole('checkbox', { name: /^Select / }).count(), 2, 'Unavailable reference medicines never enter the selection form');
  await visible(section().getByText('Confirm the independent interaction review for this combination before saving edits or approving.', { exact: true }));
  await section().getByLabel('Doctor decision reason', { exact: true }).fill('Fictional doctor reviewed both available purposes.');
  await reviewCheck().check();
  assert.equal(await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).isDisabled(), true, 'Bulk selection never bypasses combination review');
  await section().getByLabel('I independently reviewed the selected combination, including interactions.', { exact: true }).check();
  assert.equal(await reviewCheck().isChecked(), false, 'Combination review requires confirmation of the updated decision');
  await reviewCheck().check();
  assert.equal(await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).isEnabled(), true);
  await section().getByRole('button', { name: 'Edit medicines', exact: true }).click();
  await visible(section().getByRole('region', { name: 'Edit screened medicine selection', exact: true }));
  assert.equal(await section().getByLabel('Select Oseltamivir', { exact: true }).isEnabled(), true);
  await section().getByLabel('Doctor decision reason', { exact: true }).fill('gooood');
  await visible(section().getByText('Enter at least 10 characters for the decision reason (6/10).', { exact: true }));
  await reviewCheck().check();
  assert.equal(await section().getByRole('button', { name: 'Save edits', exact: true }).isDisabled(), true, 'A checked review cannot bypass the reason minimum');
  assert.equal(await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).isDisabled(), true);
  await section().getByLabel('Select Oseltamivir', { exact: true }).uncheck();
  await section().getByLabel('Select Paracetamol (acetaminophen)', { exact: true }).check();
  await section().getByLabel('Doctor decision reason', { exact: true }).fill('Fictional doctor selected symptom relief for this demonstration.');
  assert.equal(await reviewCheck().isChecked(), false, 'Changed decision details require a new explicit review');
  assert.equal(await section().getByRole('button', { name: 'Save edits', exact: true }).isDisabled(), true);
  await reviewCheck().check();
  await section().getByRole('button', { name: 'Save edits', exact: true }).click();
  await visible(section().getByText('Doctor decision: edited · Version 1', { exact: true }));
  await visible(section().getByText('Medicine selection saved. Review the saved selection and confirm again before approval.', { exact: true }));
  assert.equal(await section().getByRole('link', { name: 'Open approved prescription', exact: true }).count(), 0);
  await section().getByLabel('Doctor decision reason', { exact: true }).fill('Fictional doctor approved the reviewed symptom-relief selection.');
  await reviewCheck().check(); loseApproval = true;
  await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).click();
  await visible(section().getByRole('alert').filter({ hasText: 'Test approval response lost' }));
  assert.ok(page.url().includes('/doctor/prescription-workspace'), 'A lost approval response never triggers prescription navigation');
  await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).click();
  await visible(page.locator('#prescription-slip'));
  assert.ok(page.url().includes('/doctor/prescription-slip/'), 'Confirmed approval opens the prescription automatically');
  const history = await ask({ method: 'GET', path: '/api/prescription/doctor-decisions/' }); assert.equal(history.data.length, 2, 'Lost response retry creates no duplicate approval');
  const slipUrl = page.url();
  const stamp = page.getByLabel('Doctor profile stamp', { exact: true });
  await visible(stamp.getByText('Fictional Reviewer', { exact: true }));
  await visible(stamp.getByText('Fictional Research University', { exact: true }));
  await visible(stamp.getByText('Unsigned profile stamp · Research use only', { exact: true }));
  assert.equal(await page.locator('#prescription-slip').getByText('Name:', { exact: true }).count(), 1);
  assert.equal(await page.locator('#prescription-slip').getByText('Age:', { exact: true }).count(), 1);
  assert.equal(await page.locator('#prescription-slip').getByText(/Paracetamol/).count(), 1);
  assert.equal(await page.locator('#prescription-slip').getByText(/Oseltamivir/).count(), 0);
  await visible(page.getByText('RESEARCH USE ONLY — NOT FOR DISPENSING', { exact: true }));
  assert.equal(/\b(?:PP1|demo|Component[ _-]?1|Member[ _-]?1)\b/i.test(await page.locator('body').innerText()), false, 'Print view uses product labels and retains research-use limits');
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.locator('main').evaluate((node) => node.scrollWidth > node.clientWidth + 1), false); }
  await page.getByRole('button', { name: 'Print A6 prescription', exact: true }).click();
  await page.waitForFunction(() => window.__demoPrintCount === 1);
  await page.emulateMedia({ media: 'print' });
  assert.ok(await page.locator('style').evaluateAll((nodes) => nodes.some((node) => node.textContent.includes('size:A6') || node.textContent.includes('size: A6'))));
  mkdirSync(artifacts, { recursive: true });
  await page.locator('#prescription-slip').screenshot({ path: join(artifacts, 'approved-a6-slip.png') });
  await page.emulateMedia({ media: 'screen' }); await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: ordered UI screening, saved-model suggestions, explicit review-draft preparation, edit/approve history, lost-response retry, selected-only A6 view and browser print without PDF export.');
  await page.goto(origin + '/doctor/prescription-workspace');
  await visible(section());
  await ml().getByLabel('Enable Experimental ML medicine suggestions', { exact: true }).check();
  await visible(section().getByRole('link', { name: 'Open approved prescription', exact: true }));
  assert.equal(await section().getByRole('button', { name: 'Edit medicines', exact: true }).isDisabled(), true, 'Final decisions retain immutable selections');
  await section().getByRole('button', { name: 'Create new medicine proposal', exact: true }).click();
  await visible(ml().getByRole('button', { name: 'Prepare doctor-review draft', exact: true }));
  await ml().getByRole('button', { name: 'Prepare doctor-review draft', exact: true }).click();
  await visible(section().getByRole('button', { name: 'Reject proposal', exact: true }));
  await section().getByLabel('Doctor decision reason', { exact: true }).fill('Fictional doctor rejected this second proposal for demonstration.');
  await reviewCheck().check(); await section().getByRole('button', { name: 'Reject proposal', exact: true }).click();
  await visible(section().getByText('Doctor decision: rejected · Version 1', { exact: true }));
  assert.equal(await section().getByRole('link', { name: 'Open approved prescription', exact: true }).count(), 0);
  await page.goto(slipUrl); await visible(page.locator('p[role="alert"]')); assert.equal(await page.locator('#prescription-slip').count(), 0);
  await page.goto(origin + '/doctor/validation-approval-history');
  await visible(page.getByText(/Proposal 2, decision 1/));
  assert.equal(await page.getByRole('link', { name: 'Open approved prescription', exact: true }).count(), 0, 'Superseded approval cannot print');
  await ask({ action: 'revoke' });
  await page.getByRole('button', { name: 'Refresh doctor decisions', exact: true }).click(); await visible(page.locator('p[role="alert"]'));
  assert.equal(await page.getByRole('article').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: rejection, superseded-slip denial, immutable history and revoked-access clearing.');
} catch (error) {
  mkdirSync(artifacts, { recursive: true }); await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true });
  console.error('Page:', page.url(), 'Errors:', errors); console.error((await page.locator('body').innerText()).slice(-7000)); throw error;
} finally { await browser.close(); child.stdin.end(); }
