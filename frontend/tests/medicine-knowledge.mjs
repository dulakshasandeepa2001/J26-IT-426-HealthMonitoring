// Local UI checks only: every backend request is intercepted; no live review is saved.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://localhost:3000';
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), 'meditrack-medicine-knowledge');
const contents = JSON.parse(readFileSync(new URL('../../backend/medicine_knowledge/data/pilot_catalogue.json', import.meta.url), 'utf8'));
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
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
const doctor = { id: 101, role: 'doctor', username: 'knowledge_test_doctor', doctorID: 'DOC-TEST' };
let signedIn = false;
let catalogueDenied = false;
let failedReview = 0;
let reviewRequests = 0;
let catalogueRequests = 0;
let normalizeDelay = false;
let entries = contents.map((content, index) => ({ id: content.id, content, content_hash: String(index + 1).repeat(64), review_status: 'pending', review_is_current: false,
  reviewed_by: null, reviewer_name: null, reviewed_at: null, review_notes: '', updated_at: '2026-10-13T10:00:00Z' }));
const reviews = [];
const visit = { id: '00000000-0000-4000-8000-000000000001', doctor: doctor.id, patient: 201, patient_name: 'Medicine test patient', reason: 'UI fixture', is_demo: true,
  assigned_by: 1, started_at: '2026-10-13T10:00:00Z', created_at: '2026-10-13T10:00:00Z' };
const patientContext = { id: 1, patient: 201, date_of_birth: '1990-01-01', age_years: 36, dob_status: 'valid', weight: null, weight_unit: null,
  allergy_status: 'confirmed', allergies: ['Existing recorded allergy'], medicine_status: 'confirmed', current_medicines: ['paracetamol'],
  updated_by: doctor.id, updated_at: '2026-10-13T10:00:00Z', provenance: {} };
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path === '/session/') return send({ user: signedIn ? doctor : null, csrfToken: 'test-csrf-token' });
  if (path === '/api/prescription/medicines/') {
    catalogueRequests++;
    return catalogueDenied ? send({ detail: 'Doctor approval revoked.' }, 403) : send(entries);
  }
  const reviewPath = path.match(/^\/api\/prescription\/medicines\/([^/]+)\/review\/$/);
  if (reviewPath) {
    reviewRequests++;
    assert.equal(request.headers()['x-csrftoken'], 'test-csrf-token');
    const body = request.postDataJSON();
    assert.deepEqual(Object.keys(body).sort(), ['decision', 'evidence_checked', 'expected_content_hash', 'expected_updated_at', 'notes']);
    const entry = entries.find((row) => row.id === reviewPath[1]);
    assert.equal(body.expected_content_hash, entry.content_hash);
    assert.equal(body.expected_updated_at, entry.updated_at);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (failedReview) return send({ detail: failedReview === 409 ? 'Catalogue content or review has changed. Refresh and review the latest entry.' : 'Test review save failure.' }, failedReview);
    if (body.decision === 'reviewed') assert.equal(body.evidence_checked, true);
    const saved = { ...entry, review_status: body.decision, review_is_current: body.decision === 'reviewed', reviewed_by: doctor.id,
      reviewer_name: doctor.username, review_notes: body.notes, reviewed_at: '2026-10-13T10:01:00Z', updated_at: `2026-10-13T10:01:${String(reviewRequests).padStart(2, '0')}Z` };
    reviews.unshift({ id: reviews.length + 1, reviewer_name: doctor.username, decision: body.decision, previous_status: entry.review_status,
      notes: body.notes, content_hash: entry.content_hash, catalogue_version: entry.content.catalogue_version, recorded_at: saved.reviewed_at });
    entries = entries.map((row) => row.id === saved.id ? saved : row);
    return send(saved);
  }
  if (/\/medicines\/[^/]+\/history\/$/.test(path)) return send([...reviews, { id: 0, reviewer_name: 'Catalogue import', decision: 'pending',
    previous_status: 'pending', notes: 'Imported catalogue content; clinician review required.', content_hash: 'a'.repeat(64), catalogue_version: 'pp1-2026-10-13-v1', recorded_at: '2026-10-13T10:00:00Z' }]);
  if (path === '/api/prescription/medicines/normalize/') {
    assert.equal(request.headers()['x-csrftoken'], 'test-csrf-token');
    const names = request.postDataJSON().names;
    if (normalizeDelay) await new Promise((resolve) => setTimeout(resolve, 350));
    return send({ safety_assessed: false, results: names.map((input) => {
      const ingredient = input.toLowerCase().trim() === 'paracetamol';
      const product = input.toLowerCase().trim() === 'paracetamol 500 mg tablet';
      const entry = entries.find((row) => row.id === 'paracetamol-500mg-tablet');
      return { input, status: ingredient || product ? 'recognized' : 'unrecognized', requires_clarification: !product,
        reason: ingredient ? 'Strength and formulation must be clarified.' : product ? 'Identity match only; clinical safety has not been assessed.' : 'No exact supported alias; check the full product name and ingredients.',
        matches: ingredient || product ? [{ entry_id: entry.id, generic_name: entry.content.generic_name, match_level: product ? 'product' : 'ingredient',
          ingredients: ['acetaminophen'], matched_alias: input, standard_concept: product ? entry.content.standard_concept : null, review_status: entry.review_status }] : [] };
    }) });
  }
  if (path === '/api/prescription/patients/') return send([{ id: 201, username: 'medicine_test_patient', display_name: visit.patient_name, birthday: '1990-01-01', age_years: 36, dob_status: 'valid' }]);
  if (path === '/api/prescription/consultations/') return send([visit]);
  if (path === '/api/prescription/patient-contexts/') return send([patientContext]);
  if (path === '/api/prescription/analyses/' || path === '/api/prescription/diagnoses/') return send([]);
  throw new Error('Unmocked backend request: ' + request.method() + ' ' + path);
});
const detail = () => page.getByRole('region', { name: 'Evidence and content review' });
const catalogue = () => page.getByRole('region', { name: 'Medicine catalogue' });
const reviewNotes = () => page.getByRole('textbox', { name: 'Review notes' });
async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
async function pick(name) { await catalogue().getByRole('button', { name: new RegExp('^' + name) }).click(); }

try {
  await page.addInitScript(() => localStorage.setItem('meditrack_user', JSON.stringify({ id: 101, role: 'doctor', username: 'forged-doctor' })));
  await page.goto(origin + '/doctor/medicine-knowledge');
  await visible(page.locator('main').getByRole('alert'));
  assert.equal(catalogueRequests, 0);
  assert.equal(await page.getByRole('button', { name: 'Save content review' }).count(), 0);
  signedIn = true;
  await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await visible(catalogue());
  assert.equal(await catalogue().getByRole('button').count(), 4);
  await pick('Acyclovir');
  await visible(detail().getByText('No clinician has reviewed this version.', { exact: true }));
  const label = detail().getByRole('link', { name: /^Acyclovir tablets — 400 mg and 800 mg/ });
  assert.match(await label.getAttribute('href'), /^https:\/\/dailymed\.nlm\.nih\.gov\//);
  console.log('PASS: server session controls catalogue access; four source-linked entries begin pending and expose warnings and scope.');

  await page.getByLabel('Condition filter').selectOption('influenza');
  assert.equal(await catalogue().getByRole('button').count(), 2);
  await page.getByLabel('Search medicines').fill('no-matching-medicine');
  await visible(page.getByText('No medicines match these filters.', { exact: true }));
  await page.getByLabel('Search medicines').fill('');
  await pick('Oseltamivir');
  assert.equal(await page.getByRole('button', { name: 'Save content review' }).isDisabled(), true);
  await reviewNotes().fill('Checked product identity, label and pilot scope.');
  assert.equal(await page.getByRole('button', { name: 'Save content review' }).isDisabled(), true);
  await page.getByRole('checkbox', { name: /I reviewed the listed evidence/ }).check();
  failedReview = 500;
  await page.getByRole('button', { name: 'Save content review' }).click();
  await visible(page.getByText('Test review save failure.', { exact: true }));
  assert.equal(await reviewNotes().inputValue(), 'Checked product identity, label and pilot scope.');
  assert.equal(entries.find((row) => row.id === 'oseltamivir-75mg-capsule').review_status, 'pending');
  failedReview = 0;
  await page.getByRole('button', { name: 'Save content review' }).evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByText('Content review saved. Prescription generation remains a later step.', { exact: true }));
  assert.equal(reviewRequests, 2);
  await page.getByRole('button', { name: 'Load review history' }).click();
  await visible(page.getByText('Content reviewed · knowledge_test_doctor', { exact: true }));
  console.log('PASS: review requires evidence acknowledgement; failure preserves notes; rapid clicks save one version-bound review with real actor and history.');

  await page.reload();
  await visible(catalogue());
  await pick('Oseltamivir');
  await visible(detail().getByText('Checked product identity, label and pilot scope.', { exact: true }));
  await page.getByLabel('Review status filter').selectOption('reviewed');
  assert.equal(await catalogue().getByRole('button').count(), 1);
  await page.getByLabel('Review status filter').selectOption('all');
  failedReview = 409;
  await reviewNotes().fill('Another draft review must not replace newer data.');
  await page.getByRole('checkbox', { name: /I reviewed the listed evidence/ }).check();
  await page.getByRole('button', { name: 'Save content review' }).click();
  await visible(page.getByText('Catalogue content or review has changed. Refresh and review the latest entry.', { exact: true }));
  assert.equal(await reviewNotes().inputValue(), 'Another draft review must not replace newer data.');
  failedReview = 0;
  await page.getByLabel('Review decision').selectOption('rejected');
  await page.getByRole('button', { name: 'Save content review' }).click();
  await visible(detail().getByText('Rejected', { exact: true }));
  console.log('PASS: saved review survives refresh; stale responses preserve edits; rejection removes reviewed status.');

  const names = page.getByRole('textbox', { name: 'Medicine names to check' });
  await names.fill('paracetamol\nparacetamol 500 mg tablet\nunknown medicine');
  await page.getByRole('button', { name: 'Check medicine names' }).click();
  await visible(page.getByText('Exact product name recognized', { exact: true }));
  assert.equal(await page.getByText('Clarification required', { exact: true }).count(), 2);
  await visible(page.getByText(/Product RxCUI 198440/));
  normalizeDelay = true;
  await names.fill('unknown medicine');
  await page.getByRole('button', { name: 'Check medicine names' }).click();
  await names.fill('new unsent medicine');
  await page.waitForTimeout(500);
  assert.equal(await page.getByText('Clarification required', { exact: true }).count(), 0);
  normalizeDelay = false;
  console.log('PASS: ingredients, exact products and unsupported names have distinct clarification states; late checks cannot display results for edited input.');

  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
  }
  mkdirSync(artifacts, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: join(artifacts, 'medicine-catalogue.png'), fullPage: true });
  catalogueDenied = true;
  await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await visible(page.getByText('Doctor approval revoked.', { exact: true }));
  assert.equal(await catalogue().count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Save content review' }).count(), 0);
  catalogueDenied = false;
  await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await visible(catalogue());
  console.log('PASS: desktop/mobile layout and revoked access clear catalogue/review state; retry restores permitted access.');

  await page.goto(origin + '/doctor/prescription-workspace');
  await page.getByLabel('Assigned registered patient').selectOption('201');
  await visible(page.getByRole('textbox', { name: 'Current medicines', exact: true }));
  await page.getByRole('button', { name: 'Check medicine names' }).click();
  await visible(page.getByText('Strength and formulation must be clarified.', { exact: true }));
  assert.equal(await page.getByLabel('Current medicines', { exact: true }).inputValue(), 'paracetamol');
  assert.equal(await page.getByLabel('Allergies', { exact: true }).inputValue(), 'Existing recorded allergy');
  await page.getByLabel('Current medicines', { exact: true }).fill('paracetamol 500 mg tablet');
  assert.equal(await page.getByText('Clarification required', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Check medicine names' }).click();
  await visible(page.getByText('Exact product name recognized', { exact: true }));
  assert.equal(await page.getByRole('button', { name: 'Generate Prescription Draft' }).isDisabled(), true);
  assert.deepEqual(patientContext.current_medicines, ['paracetamol']);
  assert.deepEqual(errors, []);
  console.log('PASS: current-medicine form supports name checks without saving or changing patient data; generation remains disabled.');
  console.log('Screenshot: ' + join(artifacts, 'medicine-catalogue.png'));
} catch (err) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'medicine-failure.png'), fullPage: true });
  console.error('Browser errors:', errors);
  console.error('Visible page:', (await page.locator('body').innerText()).slice(0, 4500));
  throw err;
} finally { await browser.close(); }
