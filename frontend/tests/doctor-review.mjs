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
const section = () => page.getByRole('region', { name: 'Experimental ML proposal and doctor decision', exact: true });
const reviewCheck = () => section().getByLabel('I reviewed the selected medicines, fixed screened regimens, exclusions and model limitations for this visit.', { exact: true });
const artifacts = join(tmpdir(), 'meditrack-doctor-review');
try {
  const base = `/api/prescription/consultations/${row.visit}/clinical-screening/`;
  const metadata = await ask({ method: 'GET', path: base + 'inputs/' });
  const body = { diagnosis_id: metadata.data.confirmed_diagnoses[0].id, expected_context_updated_at: metadata.data.expected_context_updated_at, expected_analysis_hash: metadata.data.expected_analysis_hash, clinical: row.clinical };
  const preview = await ask({ method: 'POST', path: base + 'preview/', body }); assert.equal(preview.status, 200);
  const saved = await ask({ method: 'POST', path: base + 'drafts/', body: { ...body, request_key: crypto.randomUUID(), expected_plan_hash: preview.data.plan_hash, expected_latest_revision: preview.data.expected_latest_revision } }); assert.equal(saved.status, 201);
  await page.goto(origin + '/doctor/prescription-workspace');
  await visible(page.getByLabel('Assigned registered patient', { exact: true }));
  await page.getByLabel('Assigned registered patient', { exact: true }).selectOption(String(row.patient));
  await page.getByLabel('Active encounter / consultation', { exact: true }).selectOption(row.visit);
  await visible(section());
  await section().getByLabel('Enable Experimental ML medicine proposals', { exact: true }).check();
  await section().getByRole('button', { name: 'Generate medicine proposal', exact: true }).click();
  await visible(section().getByText(/^Experimental ML · categorical_tree/));
  assert.equal(await section().getByRole('link', { name: 'Open approved prescription', exact: true }).count(), 0);
  assert.equal(await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).isDisabled(), true);
  await section().getByRole('button', { name: 'Edit medicines', exact: true }).click();
  await section().getByLabel('Select Oseltamivir', { exact: true }).uncheck();
  await section().getByLabel('Select Paracetamol (acetaminophen)', { exact: true }).check();
  await section().getByLabel('Doctor decision reason', { exact: true }).fill('Fictional doctor selected symptom relief for this demonstration.');
  await reviewCheck().check();
  await section().getByRole('button', { name: 'Save edits', exact: true }).click();
  await visible(section().getByText('Doctor decision: edited · Version 1', { exact: true }));
  assert.equal(await section().getByRole('link', { name: 'Open approved prescription', exact: true }).count(), 0);
  await section().getByLabel('Doctor decision reason', { exact: true }).fill('Fictional doctor approved the reviewed symptom-relief selection.');
  await reviewCheck().check(); loseApproval = true;
  await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).click();
  await visible(section().getByRole('alert').filter({ hasText: 'Test approval response lost' }));
  await section().getByRole('button', { name: 'Approve selected medicines', exact: true }).click();
  await visible(section().getByText('Doctor decision: approved · Version 2', { exact: true }));
  const history = await ask({ method: 'GET', path: '/api/prescription/doctor-decisions/' }); assert.equal(history.data.length, 2, 'Lost response retry creates no duplicate approval');
  await page.reload(); await visible(section());
  await section().getByLabel('Enable Experimental ML medicine proposals', { exact: true }).check();
  await visible(section().getByRole('link', { name: 'Open approved prescription', exact: true }));
  await section().getByRole('link', { name: 'Open approved prescription', exact: true }).click();
  await visible(page.locator('#prescription-slip'));
  const slipUrl = page.url();
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
  console.log('PASS: real saved-model proposal, edit/approve history, lost-response retry, selected-only A6 view and browser print without PDF export.');
  await page.goto(origin + '/doctor/prescription-workspace');
  await visible(section());
  await section().getByLabel('Enable Experimental ML medicine proposals', { exact: true }).check();
  await visible(section().getByRole('link', { name: 'Open approved prescription', exact: true }));
  await section().getByRole('button', { name: 'Generate medicine proposal', exact: true }).click();
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
