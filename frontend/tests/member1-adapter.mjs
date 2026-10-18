// Run against the local Next server. All backend calls are mocked; no live data is written.
// Fixtures use the actual Python adapter in isolated test settings to check the UI contract.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://localhost:3000';
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), 'meditrack-member1-adapter');
const original = JSON.parse(readFileSync(new URL('../../backend/prescription_context/samples/member1_influenza_demo.json', import.meta.url), 'utf8'));
const doctor = { id: 101, role: 'doctor', username: 'member1_browser_doctor', doctorID: 'DOC-TEST' };
const patients = [
  { id: 201, username: 'member1_patient_a', display_name: 'Member 1 Patient A', birthday: '1990-01-01', age_years: 36, dob_status: 'valid' },
  { id: 202, username: 'member1_patient_b', display_name: 'Member 1 Patient B', birthday: null, age_years: null, dob_status: 'missing' },
];
const ids = [1, 2, 3].map((index) => '00000000-0000-4000-8000-' + String(index).padStart(12, '0'));
const visits = ids.map((id, index) => ({ id, patient: index === 2 ? 202 : 201, doctor: doctor.id, assigned_by: 1,
  patient_name: patients[index === 2 ? 1 : 0].display_name, is_demo: index !== 1, reason: 'Member 1 UI fixture',
  started_at: '2026-10-14T01:00:00Z', created_at: '2026-10-14T01:00:00Z' }));
const wires = visits.map((visit) => ({ ...structuredClone(original), schema_version: '2.0',
  patient_id: visit.patient, doctor_id: doctor.id, consultation_id: visit.id,
  analysis_reference: original.analysis_reference + ':' + visit.id,
  source: visit.is_demo ? 'component_1_sample' : 'component_1', is_demo: visit.is_demo,
  model_version: visit.is_demo ? 'synthetic-demo-member1-v1' : 'producer-test-v2', review_status: 'unconfirmed' }));
wires[1].payload.primary_diagnosis = { condition_code: 'VIRAL_URTI', condition_label: 'Producer URTI label', confidence: 0.87, severity_level: 'Moderate' };
wires[1].payload.differential_diagnoses = [
  { condition_code: 'INFLUENZA', condition_label: 'Influenza alternative', confidence: 0.99 },
  { condition_code: 'DENGUE_EARLY', condition_label: 'Dengue suspicion alternative', confidence: 0.45 },
];
wires[1].payload.extracted_symptoms[0].duration = 'about three days';
wires[2].payload.extracted_clinical_notes.chief_complaint = '<img src=x onerror="window.member1Injected=true">';
const interpreter = fileURLToPath(new URL(process.platform === 'win32' ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python', import.meta.url));
const python = spawnSync(interpreter, ['-X', 'utf8', '-c',
  'import os,json,sys; os.environ["DJANGO_SETTINGS_MODULE"]="medicare_project.test_settings"; import django; django.setup(); from prescription_context.member1_adapter import adapt_member1_output; print(json.dumps([adapt_member1_output(item) for item in json.load(sys.stdin)]))'], {
  cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), input: JSON.stringify(wires), encoding: 'utf8',
});
assert.equal(python.status, 0, python.stderr);
const normalized = JSON.parse(python.stdout);
const patientContext = { id: 1, patient: 201, updated_by: doctor.id, date_of_birth: '1990-01-01', age_years: 36, dob_status: 'valid',
  weight: null, weight_unit: null, allergy_status: 'confirmed', allergies: ['Existing verified allergy'],
  medicine_status: 'confirmed', current_medicines: ['Existing verified medicine'], provenance: {}, updated_at: '2026-10-14T00:00:00Z' };
const before = structuredClone(patientContext);
let analyses = [];
let diagnoses = [];
let demoRequests = 0;
let failDemo = false;
let accessDenied = false;
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
function result(index) { return { id: index + 1, consultation: ids[index], imported_by: index === 1 ? 1 : doctor.id,
  analysis_reference: normalized[index].analysis_reference, payload: normalized[index], imported_at: '2026-10-14T01:10:00Z' }; }
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path === '/session/') return send({ user: doctor, csrfToken: 'test-csrf-token' });
  if (path === '/api/prescription/patients/') return send(patients);
  if (path === '/api/prescription/consultations/') return send(visits);
  if (path === '/api/prescription/patient-contexts/') return send([patientContext]);
  if (path === '/api/prescription/safety-profiles/' || path === '/api/prescription/drafts/') return send([]);
  if (path === '/api/prescription/analyses/') {
    if (accessDenied) return send({ detail: 'consultation analysis fixture access revoked.' }, 403);
    const id = url.searchParams.get('consultation');
    return send(id ? analyses.filter((item) => item.consultation === id) : analyses);
  }
  if (path.endsWith('/history-identities/')) return send({ detail: 'Identity choices unavailable in this analysis fixture.' }, 503);
  const demo = path.match(/^\/api\/prescription\/consultations\/([^/]+)\/demo-analysis\/$/);
  if (demo) {
    demoRequests++;
    assert.equal(request.headers()['x-csrftoken'], 'test-csrf-token');
    assert.deepEqual(request.postDataJSON(), { scenario: 'member1_influenza' });
    if (failDemo) return send({ detail: 'Test Member 1 save failure.' }, 500);
    const index = ids.indexOf(demo[1]);
    assert.equal(visits[index].is_demo, true);
    const saved = result(index);
    analyses.push(saved);
    return send(saved, 201);
  }
  if (path === '/api/prescription/diagnoses/') {
    if (request.method() === 'POST') {
      assert.equal(request.headers()['x-csrftoken'], 'test-csrf-token');
      const body = request.postDataJSON();
      assert.equal(body.analysis_reference, analyses.find((item) => item.consultation === body.consultation).analysis_reference);
      const saved = { ...body, id: diagnoses.length + 1, doctor: doctor.id, confirmed_at: '2026-10-14T01:20:00Z' };
      diagnoses.push(saved); return send(saved, 201);
    }
    return send(diagnoses);
  }
  throw new Error('Unmocked backend request: ' + request.method() + ' ' + path);
});
async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
const diagnosis = () => page.getByRole('textbox', { name: /^Diagnosis context/ });

try {
  await page.goto(origin + '/doctor/prescription-workspace');
  await page.getByLabel('Assigned registered patient').selectOption('201');
  await page.getByLabel('Active encounter / consultation').selectOption(ids[0]);
  await page.getByLabel('Analysis scenario').selectOption('member1_influenza');
  failDemo = true;
  await page.getByRole('button', { name: 'Load analysis' }).click();
  await visible(page.getByText('Test consultation analysis save failure.', { exact: true }));
  assert.equal(analyses.length, 0);
  failDemo = false;
  await page.getByRole('button', { name: 'Load analysis' }).evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByText('Sample confidence: 94%', { exact: true }));
  assert.equal(demoRequests, 2);
  assert.equal(analyses.length, 1);
  assert.equal(await diagnosis().inputValue(), 'Influenza');
  await visible(page.getByText('Seasonal Influenza (Flu A / H3N2)', { exact: true }));
  await visible(page.getByText('Early Viral Pyrexia / Dengue Suspicion', { exact: true }));
  assert.equal(await page.getByText('Outside the influenza/chickenpox prescription pilot.', { exact: true }).count(), 2);
  await visible(page.getByText('Red flags were not assessed in this output. Clinician assessment is required.', { exact: true }));
  await visible(page.getByText('Diagnosis has not been confirmed by the doctor.', { exact: true }));
  await page.getByText('Extracted symptom details', { exact: true }).click();
  await visible(page.getByText('Reported extraction score: 96%', { exact: true }));
  await visible(page.getByText('Penicillin (Rash)', { exact: true }));
  await visible(page.getByText('Paracetamol 500mg SOS', { exact: true }));
  assert.equal(await page.getByLabel('Allergies', { exact: true }).inputValue(), 'Existing verified allergy\nPenicillin (Rash)');
  assert.equal(await page.getByLabel('Current medicines', { exact: true }).inputValue(), 'Existing verified medicine\nParacetamol 500mg SOS');
  assert.equal(diagnoses.length, 0);
  assert.equal(await page.getByText('Confirm recorded identities', { exact: true }).count(), 0);
  assert.equal(await page.locator('[aria-label="Resolve recorded history identities"]').count(), 0);
  assert.equal(await page.getByTestId('current-visit-complaint').textContent(), wires[0].payload.extracted_clinical_notes.chief_complaint);
  await page.getByText('View structured clinical details', { exact: true }).click();
  const sourceDetails = page.locator('details').filter({ has: page.getByText('View structured clinical details', { exact: true }) });
  assert.deepEqual(JSON.parse(await sourceDetails.locator('pre').textContent()), wires[0].payload);
  assert.deepEqual(analyses[0].payload.member1.raw_output, wires[0], 'Original source provenance remains stored');
  assert.deepEqual(patientContext, before);
  console.log('PASS: actual Python adapter displays clinical details with product labels and retains original provenance; failed/rapid imports preserve verified patient data.');

  mkdirSync(artifacts, { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator('main').evaluate((el) => el.scrollWidth > el.clientWidth + 1), false);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: join(artifacts, 'member1-voice-output.png'), fullPage: true });
  await page.reload();
  await visible(page.getByText('Sample confidence: 94%', { exact: true }));
  await page.getByRole('button', { name: 'Confirm Diagnosis', exact: true }).click();
  await visible(page.getByText('Doctor diagnosis confirmation is saved separately.', { exact: true }));
  assert.equal(diagnoses[0].condition_code, 'influenza');
  assert.equal(await page.getByRole('button', { name: 'Continue to ML suggestions' }).isDisabled(), true);
  console.log('PASS: desktop/mobile output, refresh persistence and explicit reference-bound doctor confirmation; prescription generation remains disabled.');

  await page.getByLabel('Active encounter / consultation').selectOption(ids[1]);
  assert.equal(await page.getByTestId('current-visit-complaint').count(), 0, 'A new visit cannot inherit the previous complaint');
  assert.equal(await page.getByLabel('Analysis scenario').count(), 0);
  await page.getByRole('button', { name: 'Edit allergies and current medicines', exact: true }).click();
  await page.getByLabel('Current medicines', { exact: true }).fill('Doctor typing before analysis arrives');
  await page.getByRole('checkbox', { name: 'I reviewed allergies and current medicines with the patient for this visit.', exact: true }).check();
  analyses.push(result(1));
  await page.getByText('Producer URTI label', { exact: true }).waitFor({ state: 'visible', timeout: 12000 });
  assert.equal(await page.getByLabel('Current medicines', { exact: true }).inputValue(), 'Doctor typing before analysis arrives', 'Late JSON does not overwrite manual edits');
  assert.equal(await page.getByRole('checkbox', { name: 'I reviewed allergies and current medicines with the patient for this visit.', exact: true }).isChecked(), false, 'New analysis invalidates unsaved review acknowledgement');
  await page.getByRole('button', { name: 'Use reported and saved history', exact: true }).click();
  assert.equal(await page.getByLabel('Current medicines', { exact: true }).inputValue(), 'Existing verified medicine\nParacetamol 500mg SOS');
  assert.equal(await page.getByTestId('current-visit-complaint').textContent(), wires[1].payload.extracted_clinical_notes.chief_complaint);
  assert.equal(await diagnosis().inputValue(), '');
  await visible(page.getByText('Influenza alternative', { exact: true }));
  await visible(page.getByText('Input clarification required', { exact: true }));
  assert.equal(await page.getByRole('button', { name: 'Confirm Diagnosis', exact: true }).count(), 0);
  assert.equal(await page.getByText('Sample confidence: 94%', { exact: true }).count(), 0);
  await diagnosis().fill('Doctor pending assessment');
  await page.reload();
  await visible(page.getByText('Producer URTI label', { exact: true }));
  console.log('PASS: automatic v2 producer delivery retains unsupported primary/differentials and uncertain durations without promoting a higher-scoring alternative.');

  await page.getByLabel('Assigned registered patient').selectOption('202');
  await page.getByLabel('Analysis scenario').selectOption('member1_influenza');
  await page.getByRole('button', { name: 'Load analysis' }).click();
  await visible(page.getByText('Chief complaint: <img src=x onerror="window.member1Injected=true">', { exact: true }));
  assert.equal(await page.evaluate(() => window.member1Injected), undefined);
  assert.equal(await page.locator('main img').count(), 0);
  assert.equal(await page.getByLabel('Allergy status').inputValue(), 'confirmed');
  assert.equal(await page.getByLabel('Current medicine status').inputValue(), 'confirmed');
  assert.equal(await page.getByTestId('allergy-summary').textContent(), 'Penicillin (Rash)');
  assert.equal(await page.getByTestId('medicine-summary').textContent(), 'Paracetamol 500mg SOS');
  assert.equal(await page.getByRole('checkbox', { name: 'I reviewed allergies and current medicines with the patient for this visit.', exact: true }).isChecked(), false);
  assert.equal(await page.getByRole('button', { name: 'Save patient information', exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel('Allergies', { exact: true }).isVisible(), false);
  assert.equal(await page.getByText('Producer URTI label', { exact: true }).count(), 0);
  assert.deepEqual(patientContext, before);
  accessDenied = true;
  await page.reload();
  await visible(page.getByText('consultation analysis fixture access revoked.', { exact: true }));
  assert.equal(await page.getByText('Penicillin (Rash)', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Seasonal Influenza (Flu A / H3N2)', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: patient isolation, JSON history prefill stays unreviewed, source HTML is rendered as text, and revoked access clears voice-derived information.');
  console.log('Screenshot: ' + join(artifacts, 'member1-voice-output.png'));
} catch (err) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, 'member1-failure.png'), fullPage: true });
  console.error('Browser errors:', errors);
  console.error('Visible page:', (await page.locator('body').innerText()).slice(0, 6000));
  throw err;
} finally { await browser.close(); }
