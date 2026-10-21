// Real review APIs against disposable in-memory SQLite; no live HTTP writes.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://127.0.0.1:3000';
const child = spawn(fileURLToPath(new URL('../../.venv/Scripts/python.exe', import.meta.url)), ['-u', fileURLToPath(new URL('./six_condition_api_bridge.py', import.meta.url))], { stdio: ['pipe', 'pipe', 'pipe'] });
const queue = [];
let readyResolve, readyReject, stderr = '';
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
child.stderr.on('data', (data) => { stderr += data; });
createInterface({ input: child.stdout }).on('line', (line) => {
  try { const result = JSON.parse(line); if (result.ready) readyResolve(result); else { const pending = queue.shift(); if (result.bridge_error) pending?.reject(new Error(result.bridge_error)); else pending?.resolve(result); } }
  catch (error) { readyReject(error); queue.shift()?.reject(error); }
});
child.on('exit', (code) => { if (code) { const error = new Error(`Bridge exited ${code}: ${stderr}`); readyReject(error); queue.splice(0).forEach((item) => item.reject(error)); } });
let chain = Promise.resolve();
function ask(message) {
  const result = chain.then(() => new Promise((resolve, reject) => { queue.push({ resolve, reject }); child.stdin.write(JSON.stringify(message) + '\n'); }));
  chain = result.catch(() => {}); return result;
}
const { cases } = await ready;
await ask({ action: 'pending_safety_review', medicine: 'oseltamivir-75mg-capsule' });
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1])).map((name) => join(cache, name, 'chrome-win64', 'chrome.exe')).find(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [], writes = [];
let signedIn = true;
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), method = request.method();
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (url.pathname === '/session/' && !signedIn) return route.fulfill({ json: { user: null, csrfToken: 'signed-out-fixture' }, headers });
  if (method === 'POST') { assert.ok(request.headers()['x-csrftoken']); writes.push({ path: url.pathname, body: request.postDataJSON() }); }
  const result = await ask({ method, path: url.pathname + url.search, ...(method === 'POST' ? { body: request.postDataJSON() } : {}) });
  return route.fulfill({ status: result.status, json: result.data, headers });
});
const visible = (locator) => locator.waitFor({ state: 'visible' });
const base = () => page.getByRole('article', { name: 'Oseltamivir medicine knowledge', exact: true }).getByRole('region', { name: 'Safety rule review', exact: true });
const scope = () => page.getByRole('region', { name: 'Safety rule review for Influenza', exact: true });
try {
  await page.goto(origin + '/doctor/medicine-knowledge?medicine=oseltamivir-75mg-capsule');
  await visible(base().getByRole('heading', { name: 'Safety rule review · Pending review', exact: true }));
  await base().getByLabel('Safety rule review notes', { exact: true }).fill('Isolated fixture doctor inspected this exact executable rule version and evidence.');
  await base().getByLabel('I reviewed the executable rules, dose policies and exclusions against the linked evidence.', { exact: true }).check();
  await base().getByRole('button', { name: 'Save safety rule review', exact: true }).click();
  await visible(base().getByRole('heading', { name: 'Safety rule review · Completed for this version', exact: true }));
  assert.equal(writes.length, 1);
  await page.reload();
  await visible(base().getByRole('heading', { name: 'Safety rule review · Completed for this version', exact: true }));
  assert.equal(await base().getByRole('button', { name: 'Save safety rule review', exact: true }).count(), 0);
  signedIn = false; await page.reload(); await visible(page.getByText('Sign in with an approved doctor account to open medicine knowledge.', { exact: true }));
  signedIn = true; await page.reload();
  await visible(base().getByRole('heading', { name: 'Safety rule review · Completed for this version', exact: true }));
  assert.equal(writes.length, 1, 'Returning sessions never re-attest a saved review');

  await page.goto(origin + '/doctor/medicine-knowledge?medicine=baloxavir-reference');
  await visible(scope().getByRole('combobox'));
  assert.match(await scope().locator('option[value="reviewed"]').textContent(), /Reference safety scope reviewed/);
  await scope().getByRole('textbox').fill('Inspected reference sources and documented gaps; exact product and executable rules are still absent.');
  assert.equal(await scope().getByRole('button', { name: 'Save safety rule review', exact: true }).isDisabled(), true);
  await scope().getByRole('checkbox').check();
  await scope().getByRole('button', { name: 'Save safety rule review', exact: true }).click();
  await visible(scope().getByRole('heading', { name: 'Safety rule review · Reference scope reviewed for this version', exact: true }));
  assert.equal(writes.length, 2); assert.equal(writes[1].body.review_scope, 'reference_only');
  await page.reload();
  await visible(scope().getByRole('heading', { name: 'Safety rule review · Reference scope reviewed for this version', exact: true }));
  assert.equal(await scope().getByRole('button', { name: 'Save safety rule review', exact: true }).count(), 0);
  const stored = await ask({ method: 'GET', path: '/api/prescription/condition-knowledge/flu-baloxavir/' });
  assert.equal(stored.data.safety_review.reference_review_is_current, true);
  assert.equal(stored.data.safety_review.is_current, false);
  const metadata = await ask({ method: 'GET', path: `/api/prescription/consultations/${cases[0].visit}/clinical-screening/inputs/` });
  const result = await ask({ method: 'POST', path: `/api/prescription/consultations/${cases[0].visit}/clinical-screening/preview/`, body: {
    diagnosis_id: metadata.data.confirmed_diagnoses[0].id, expected_context_updated_at: metadata.data.expected_context_updated_at,
    expected_analysis_hash: metadata.data.expected_analysis_hash, clinical: cases[0].clinical,
  } });
  assert.equal(result.status, 200);
  const candidate = result.data.result.candidates.find((row) => row.medicine_id === 'baloxavir-reference');
  assert.equal(candidate.status, 'unavailable'); assert.equal(candidate.regimen, null);
  assert.ok(candidate.checks.some((check) => check.category === 'product_rule_coverage' && check.blocks_availability));
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('main').evaluate((node) => node.scrollWidth > node.clientWidth + 1), false);
  }
  mkdirSync(join(tmpdir(), 'meditrack-safety-review'), { recursive: true });
  await scope().screenshot({ path: join(tmpdir(), 'meditrack-safety-review', 'reference-reviewed.png') });
  assert.equal(writes.length, 2);
  const oldHistory = await ask({ method: 'GET', path: '/api/prescription/condition-knowledge/conjunctivitis-hypromellose/history/' });
  await ask({ action: 'outdated_scope', scope: 'conjunctivitis-hypromellose' });
  await page.goto(origin + '/doctor/medicine-knowledge?medicine=hypromellose-03pct-eye-drops');
  const changed = page.getByRole('region', { name: 'Safety rule review for Viral conjunctivitis', exact: true });
  await visible(changed.getByRole('textbox'));
  await changed.getByRole('textbox').fill('Inspected this fictional scope before detecting the stale imported implementation.');
  await changed.getByRole('checkbox').check();
  await changed.getByRole('button', { name: 'Save safety rule review', exact: true }).click();
  await visible(changed.getByRole('alert'));
  await changed.getByRole('button', { name: 'Refresh current scope version', exact: true }).click();
  await visible(page.getByRole('status').filter({ hasText: 'Current scope version loaded for Viral conjunctivitis' }));
  const newHistory = await ask({ method: 'GET', path: '/api/prescription/condition-knowledge/conjunctivitis-hypromellose/history/' });
  assert.deepEqual(newHistory.data, oldHistory.data, 'Version refresh never invents, replaces or deletes a review');
  assert.equal(writes.length, 4, 'One failed review and one explicit import; no automatic approval');
  assert.deepEqual(errors, []);
  console.log('PASS: actual executable review saved once and reused after returning session; explicit reference review persists without enabling product/dose/prescription; safe version refresh retains genuine history; desktop/mobile and no automatic writes.');
} finally { await browser.close(); child.stdin.end(); }
