// Actual Python v2.1 normalization + browser UI; every backend HTTP call is mocked.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://127.0.0.1:3000';
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), 'meditrack-six-condition-handoff');
const codes = ['influenza', 'chickenpox', 'measles', 'mumps', 'viral_conjunctivitis', 'viral_gastroenteritis'];
const labels = ['Influenza', 'Chickenpox', 'Measles', 'Mumps', 'Viral conjunctivitis', 'Viral gastroenteritis'];
const doctor = { id: 101, role: 'doctor', username: 'six_condition_test', doctorID: 'DOC-TEST' };
const patient = { id: 201, username: 'synthetic_test', display_name: 'Synthetic Test Patient', birthday: '1990-01-01', age_years: 36, dob_status: 'valid' };
const visits = [...codes, 'invalid'].map((code, index) => ({ id: `00000000-0000-4000-8000-${String(index + 21).padStart(12, '0')}`,
  patient: patient.id, doctor: doctor.id, assigned_by: 1, patient_name: patient.display_name,
  is_demo: true, reason: code, started_at: '2026-10-16T09:00:00Z', created_at: '2026-10-16T09:00:00Z' }));
const wires = codes.map((code, index) => {
  const wire = JSON.parse(readFileSync(new URL(`../../backend/prescription_context/samples/member1_v21/${code}.json`, import.meta.url), 'utf8'));
  Object.assign(wire, { patient_id: patient.id, doctor_id: doctor.id, consultation_id: visits[index].id });
  wire.analysis_reference += ':' + visits[index].id;
  return wire;
});
wires[5].payload.reported_assessments.ors_product_name = '<img src=x onerror="window.handoffInjected=true">';
const interpreter = fileURLToPath(new URL(process.platform === 'win32' ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python', import.meta.url));
const python = spawnSync(interpreter, ['-X', 'utf8', '-c',
  'import os,json,sys; os.environ["DJANGO_SETTINGS_MODULE"]="medicare_project.test_settings"; import django; django.setup(); from prescription_context.member1_v21 import adapt_member1_v21; print(json.dumps([adapt_member1_v21(item) for item in json.load(sys.stdin)]))'], {
  cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), input: JSON.stringify(wires), encoding: 'utf8',
});
assert.equal(python.status, 0, python.stderr);
const normalized = JSON.parse(python.stdout);
const patientContext = { id: 1, patient: patient.id, updated_by: doctor.id, date_of_birth: patient.birthday, age_years: 36, dob_status: 'valid',
  weight: null, weight_unit: null, allergy_status: 'confirmed', allergies: ['Existing verified allergy'],
  medicine_status: 'confirmed', current_medicines: ['Existing verified medicine'], provenance: {}, updated_at: '2026-10-16T08:00:00Z' };
const before = structuredClone(patientContext);
const analyses = [], diagnoses = [], requests = [];
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
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  requests.push(request.method() + ' ' + path);
  if (path === '/session/') return send({ user: doctor, csrfToken: 'synthetic-csrf' });
  if (path === '/api/prescription/patients/') return send([patient]);
  if (path === '/api/prescription/consultations/') return send(visits);
  if (path === '/api/prescription/patient-contexts/') {
    assert.equal(request.method(), 'GET', 'Handoff must never write patient context');
    return send([patientContext]);
  }
  if (path === '/api/prescription/safety-profiles/' || path === '/api/prescription/drafts/') return send([]);
  if (path === '/api/prescription/analyses/') {
    const id = url.searchParams.get('consultation');
    return send(id ? analyses.filter((item) => item.consultation === id) : analyses);
  }
  const demo = path.match(/^\/api\/prescription\/consultations\/([^/]+)\/demo-analysis\/$/);
  if (demo) {
    const index = visits.findIndex((visit) => visit.id === demo[1]);
    assert.equal(request.headers()['x-csrftoken'], 'synthetic-csrf');
    assert.deepEqual(request.postDataJSON(), { scenario: 'member1_v21_' + codes[index] });
    const saved = { id: index + 1, consultation: demo[1], imported_by: doctor.id, payload: normalized[index], analysis_reference: normalized[index].analysis_reference, imported_at: '2026-10-16T09:00:00Z' };
    analyses.push(saved); return send(saved, 201);
  }
  if (path === '/api/prescription/diagnoses/') {
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      assert.equal(body.analysis_reference, analyses.find((item) => item.consultation === body.consultation).analysis_reference);
      const saved = { ...body, id: diagnoses.length + 1, doctor: doctor.id, confirmed_at: '2026-10-16T09:15:00Z' };
      diagnoses.push(saved); return send(saved, 201);
    }
    return send(diagnoses);
  }
  throw new Error('Unmocked backend call: ' + request.method() + ' ' + path);
});
const visible = (locator) => locator.waitFor({ state: 'visible' });
try {
  await page.goto(origin + '/doctor/prescription-workspace');
  await page.getByLabel('Assigned registered patient').selectOption(String(patient.id));
  for (let index = 0; index < codes.length; index++) {
    await page.getByLabel('Active encounter / consultation').selectOption(visits[index].id);
    await page.getByLabel('Demo analysis scenario').selectOption('member1_v21_' + codes[index]);
    await page.getByRole('button', { name: 'Load demo analysis' }).click();
    await visible(page.getByText('Handoff schema: 2.1', { exact: true }));
    assert.equal(await page.getByRole('textbox', { name: /^Diagnosis context/ }).inputValue(), labels[index]);
    await visible(page.getByText('vomiting · Unknown', { exact: true }));
    if (index === 0) await visible(page.getByText('12 hours', { exact: true }).first());
    if (index === 3) await visible(page.getByText('fever · Not present', { exact: true }));
    assert.equal(await page.getByLabel('Allergies', { exact: true }).inputValue(), before.allergies[0]);
    assert.equal(await page.getByLabel('Current medicines', { exact: true }).inputValue(), before.current_medicines[0]);
    await page.getByText('Source-reported assessments — unverified', { exact: true }).click();
    await visible(page.getByText('Unknown / not reported', { exact: true }).first());
    if (index === 4) await visible(page.getByText('Reported no — unverified', { exact: true }));
    if (index === 5) {
      await visible(page.getByText(wires[5].payload.reported_assessments.ors_product_name, { exact: true }));
      assert.equal(await page.evaluate(() => window.handoffInjected), undefined);
      assert.equal(await page.locator('main img').count(), 0);
    }
    await page.getByText('View original Component 1 output', { exact: true }).click();
    const raw = page.locator('details').filter({ has: page.getByText('View original Component 1 output', { exact: true }) }).locator('pre');
    assert.deepEqual(JSON.parse(await raw.textContent()), wires[index]);
    await page.getByRole('button', { name: 'Confirm Diagnosis', exact: true }).click();
    await visible(page.getByText('Doctor diagnosis confirmation is saved separately.', { exact: true }));
    assert.equal(diagnoses[index].condition_code, codes[index]);
    if (index === 0) {
      assert.equal(await page.getByLabel('Fever: verified duration (hours)', { exact: true }).inputValue(), '12');
      assert.equal(await page.getByLabel('Body aches requires symptom relief', { exact: true }).isChecked(), false);
      assert.equal(await page.getByLabel('Hours since influenza symptom onset', { exact: true }).inputValue(), '');
      assert.equal(await page.getByRole('combobox', { name: /^Red-flag assessment/ }).inputValue(), 'unknown');
      assert.equal(await page.getByLabel('I verified these symptom targets and durations for this visit.', { exact: true }).isChecked(), false);
    }
    if (index >= 2) {
      await visible(page.getByText('Medicine support pending for this condition', { exact: true }));
      assert.equal(await page.getByRole('button', { name: 'Refresh drafts and rules', exact: true }).count(), 0);
    }
    console.log('PASS: v2.1 ' + codes[index] + ' loads and confirms separately; source facts stay unverified.');
  }
  assert.deepEqual(patientContext, before);
  assert.equal(requests.some((path) => path.includes('/regimen-suggestions/') || path.startsWith('POST /api/prescription/drafts/')), false);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('main').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  }
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'six-condition-handoff.png'), fullPage: true });
  await page.reload();
  await visible(page.getByText('Medicine support pending for this condition', { exact: true }));
  const bad = structuredClone(normalized[0]);
  bad.consultation_id = visits[6].id;
  bad.member1.raw_output.consultation_id = visits[6].id;
  bad.symptoms[0].present = 'true';
  analyses.push({ ...analyses[0], id: 7, consultation: visits[6].id, payload: bad });
  await page.getByLabel('Active encounter / consultation').selectOption(visits[6].id);
  assert.equal(await page.getByRole('textbox', { name: /^Diagnosis context/ }).inputValue(), '');
  assert.equal(await page.getByText('Handoff schema: 2.1', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: mobile layout, refresh persistence, no patient/context/draft writes, no publication and malformed v2.1 rejection.');
  console.log('Screenshot: ' + join(artifacts, 'six-condition-handoff.png'));
} finally {
  await browser.close();
}
