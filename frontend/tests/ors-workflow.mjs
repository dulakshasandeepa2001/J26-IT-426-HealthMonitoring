// All backend requests are intercepted into disposable synthetic SQLite.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://localhost:3000';
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
const { cases } = await ready;
const row = cases.find((item) => item.condition === 'viral_gastroenteritis');
console.log('Isolated exact-ORS bridge ready; no clinical database used.');
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])).map((name) => join(cache, name, 'chrome-win64', 'chrome.exe')).find(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
context.setDefaultTimeout(60_000);
const page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const apiLog = [];
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  apiLog.push(`${method} ${url.pathname}: pending`);
  const logIndex = apiLog.length - 1;
  if (method === 'POST') assert.ok(request.headers()['x-csrftoken']);
  const result = await ask({ method, path: url.pathname + url.search, body: method === 'POST' ? request.postDataJSON() : undefined });
  apiLog[logIndex] = `${method} ${url.pathname}: ${result.status}`;
  return route.fulfill({ status: result.status, json: result.data, headers });
});
const visible = (locator) => locator.waitFor({ state: 'visible' });
const clinical = () => page.getByRole('group', { name: 'Clinical inputs for this visit', exact: true });
const screening = () => page.getByRole('region', { name: 'Patient safety screening', exact: true });
const ml = () => page.getByRole('region', { name: 'Experimental ML suggestions', exact: true });
const doctor = () => page.getByRole('region', { name: 'Doctor-review prescription draft', exact: true });
const artifacts = join(tmpdir(), 'meditrack-exact-ors');
try {
  await ask({ action: 'import_exact_ors' });
  await page.goto(origin + '/doctor/medicine-knowledge?medicine=dioralyte-natural-gsl-sachet');
  const scope = page.getByRole('article', { name: 'Viral gastroenteritis medicine scope', exact: true }).filter({ has: page.getByRole('heading', { name: /Dioralyte Natural/ }) });
  await visible(scope);
  for (const kind of ['Content review', 'Safety rule review']) {
    const form = scope.getByRole('region', { name: `${kind} for Viral gastroenteritis`, exact: true });
    await form.getByLabel(`${kind} notes`, { exact: true }).fill('Fictional reviewer checked the exact reference product, source and bounded research implementation.');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: `Save ${kind.toLowerCase()}`, exact: true }).click();
    await visible(scope.getByRole('heading', { name: `${kind} · Completed for this version`, exact: true }));
  }
  const scopes = await ask({ method: 'GET', path: '/api/prescription/condition-knowledge/' });
  const exact = scopes.data.find((item) => item.id === 'gi-dioralyte-natural-gsl');
  assert.equal(exact.safety_review.is_current, true);
  assert.equal(exact.content_review.is_current, true);
  await page.goto(origin + '/doctor/prescription-workspace');
  await page.getByLabel('Assigned registered patient', { exact: true }).selectOption(String(row.patient));
  await page.getByLabel('Active encounter / consultation', { exact: true }).selectOption(row.visit);
  await visible(clinical());
  await clinical().getByRole('button', { name: 'Edit all clinical details', exact: true }).click();
  const facts = { ...row.clinical, ors_product_assessment: 'exact_reference_confirmed', ors_metabolic_assessment: 'standard',
    ors_dietary_assessment: 'no_restrictions', ors_obstruction_assessment: 'none', renal_assessment: 'standard', hepatic_assessment: 'standard' };
  for (const field of await clinical().locator('[data-clinical-field]').all()) {
    const key = await field.getAttribute('data-clinical-field');
    await field.selectOption(facts[key] ?? 'unknown');
  }
  for (const field of await clinical().locator('[data-concern]').all()) await field.selectOption('false');
  for (const field of await clinical().locator('[data-symptom]').all()) {
    await field.selectOption('true');
    await clinical().locator(`[data-duration="${await field.getAttribute('data-symptom')}"]`).fill('12');
  }
  // Product identity cannot be inferred from a generic ORS name.
  await clinical().getByLabel('Exact ORS reference product', { exact: true }).selectOption('different_or_unverified');
  await screening().getByRole('button', { name: 'Confirm inputs and screen medicines', exact: true }).click();
  await visible(screening().getByText(/^Screening complete: 0 medicine candidates/));
  await clinical().getByLabel('Exact ORS reference product', { exact: true }).selectOption('exact_reference_confirmed');
  await screening().getByRole('button', { name: 'Confirm inputs and screen medicines', exact: true }).click();
  await visible(screening().getByText(/^Screening complete: 1 medicine candidate/));
  await visible(screening().getByText('Dissolve each sachet separately in exactly 200 mL drinking water.', { exact: true }));
  await screening().getByLabel('I reviewed this screening, exclusions and unresolved alternatives. Save this assessment to continue.', { exact: true }).check();
  await screening().getByRole('button', { name: 'Continue to ML suggestions', exact: true }).click();
  await ml().getByLabel('Enable Experimental ML medicine suggestions', { exact: true }).check();
  await ml().getByRole('button', { name: 'Generate ML suggestions', exact: true }).click();
  await visible(ml().getByText('outside frozen model product coverage', { exact: true }));
  await ml().getByRole('button', { name: 'Prepare doctor-review draft', exact: true }).click();
  await doctor().getByRole('button', { name: 'Select all compatible medicines', exact: true }).click();
  assert.equal(await doctor().getByRole('checkbox', { name: /^Select / }).count(), 1, 'Generic ORS and reference-only medicines remain excluded');
  await doctor().getByLabel('Doctor decision reason', { exact: true }).fill('Fictional doctor independently selected the exact reviewed product after checking RF abstention.');
  await doctor().getByLabel('I reviewed the selected medicines, fixed screened regimens, exclusions and model limitations for this visit.', { exact: true }).check();
  await doctor().getByRole('button', { name: 'Approve selected medicines', exact: true }).click();
  await visible(page.locator('#prescription-slip'));
  const slip = page.locator('#prescription-slip');
  await visible(slip.getByText(/dissolve each sachet in exactly 200 mL drinking water/));
  await visible(slip.getByText(/No fixed daily frequency or course/));
  assert.equal((await slip.innerText()).includes('doses per day for'), false, 'Event-based ORS is not formatted as a fixed tablet schedule');
  assert.equal(/\b(?:undefined|null)\b/.test(await slip.innerText()), false, 'Qualitative/event-based regimens never print absent numeric values');
  for (const width of [1440, 390]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.locator('main').evaluate((node) => node.scrollWidth > node.clientWidth + 1), false); }
  mkdirSync(artifacts, { recursive: true }); await slip.screenshot({ path: join(artifacts, 'approved-exact-ors.png') });
  assert.deepEqual(errors, []);
  console.log('PASS: pending product reviewed through UI, exact identity gate, generic ORS exclusion, saved screening, RF abstention, independent doctor approval and event-based A6 rendering.');
} catch (error) {
  mkdirSync(artifacts, { recursive: true }); await page.screenshot({ path: join(artifacts, 'failure.png'), fullPage: true });
  console.error('Page:', page.url(), 'Errors:', errors, 'API requests:', apiLog); console.error((await page.locator('body').innerText()).slice(-6000)); throw error;
} finally { await browser.close(); child.stdin.end(); }
