// Local browser regression: all HTTP APIs are mocked. Actual Python adapter and
// rule engine calculate the fixtures; no clinical data or reviews are written.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://localhost:3000';
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), 'meditrack-prescription-drafts');
const contents = JSON.parse(readFileSync(new URL('../../backend/medicine_knowledge/data/pilot_catalogue.json', import.meta.url), 'utf8'));
const policies = JSON.parse(readFileSync(new URL('../../backend/prescription_drafts/data/safety_profiles.json', import.meta.url), 'utf8'));
const original = JSON.parse(readFileSync(new URL('../../backend/prescription_context/samples/member1_influenza_demo.json', import.meta.url), 'utf8'));
const chickenpox = JSON.parse(readFileSync(new URL('../../backend/prescription_context/samples/chickenpox_demo.json', import.meta.url), 'utf8'));
const interpreter = fileURLToPath(new URL(process.platform === 'win32' ? '../../.venv/Scripts/python.exe' : '../../.venv/bin/python', import.meta.url));
const backend = fileURLToPath(new URL('../../backend/', import.meta.url));
function python(program, value) {
  const run = spawnSync(interpreter, ['-X', 'utf8', '-c', program], { cwd: backend, input: JSON.stringify(value), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); return JSON.parse(run.stdout);
}
const doctor = { id: 101, role: 'doctor', username: 'automatic_plan_doctor', doctorID: 'DOC-TEST' };
const patients = [36, 36, 10].map((age, i) => ({ id: 201 + i, username: 'plan_patient_' + i, display_name: 'Plan Patient ' + (i + 1),
  birthday: age === 10 ? '2016-01-01' : '1990-01-01', age_years: age, dob_status: 'valid' }));
const visits = patients.map((patient, i) => ({ id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), patient: patient.id, doctor: doctor.id,
  patient_name: patient.display_name, assigned_by: 1, reason: 'Isolated automatic plan fixture', is_demo: true, started_at: '2026-10-14T01:00:00Z', created_at: '2026-10-14T01:00:00Z' }));
const wire = { ...structuredClone(original), consultation_id: visits[0].id, patient_id: 201, doctor_id: doctor.id,
  analysis_reference: 'BROWSER-VOICE:flu', schema_version: '2.0', source: 'component_1_sample', is_demo: true, model_version: 'synthetic-demo-member1-v1', review_status: 'unconfirmed' };
const flu = python('import os,json,sys; os.environ["DJANGO_SETTINGS_MODULE"]="medicare_project.test_settings"; import django; django.setup(); from prescription_context.member1_adapter import adapt_member1_output; print(json.dumps(adapt_member1_output(json.load(sys.stdin))))', wire);
const analyses = visits.map((visit, i) => ({ id: i + 1, consultation: visit.id, imported_by: doctor.id, imported_at: '2026-10-14T01:01:00Z',
  analysis_reference: i === 0 ? flu.analysis_reference : 'BROWSER-VOICE:chickenpox:' + i,
  payload: i === 0 ? flu : { ...structuredClone(chickenpox), patient_id: visit.patient, consultation_id: visit.id, analysis_reference: 'BROWSER-VOICE:chickenpox:' + i } }));
const diagnoses = visits.map((visit, i) => ({ id: i + 1, consultation: visit.id, doctor: doctor.id, condition_code: i ? 'chickenpox' : 'influenza',
  condition_label: i ? 'Chickenpox' : 'Influenza', analysis_reference: analyses[i].analysis_reference, confirmed_at: '2026-10-14T01:02:00Z' }));
const contexts = visits.map((visit, i) => ({ id: i + 1, patient: visit.patient, date_of_birth: patients[i].birthday, age_years: patients[i].age_years, dob_status: 'valid',
  weight: '65.00', weight_unit: 'kg', allergy_status: 'none', allergies: [], medicine_status: 'none', current_medicines: [], updated_by: doctor.id,
  updated_at: '2026-10-14T01:03:00Z', provenance: { last_reviewed_consultation: visit.id, last_reviewed_by: doctor.id } }));
const entries = contents.map((content, i) => ({ id: content.id, content, content_hash: String(i + 1).repeat(64), review_status: 'pending', review_is_current: false,
  reviewed_by: null, reviewer_name: null, reviewed_at: null, review_notes: '', updated_at: '2026-10-14T01:00:00Z' }));
const profiles = entries.map((entry) => ({ medicine: entry.id, generic_name: entry.content.generic_name, content: policies[entry.id], content_hash: 'a'.repeat(64),
  medicine_content_hash: entry.content_hash, review_status: 'pending', review_is_current: false, catalogue_review_current: false,
  reviewer_name: null, reviewed_at: null, review_notes: '', updated_at: '2026-10-14T01:00:00Z',
  sources: entry.content.sources.filter((source) => policies[entry.id].source_ids.includes(source.id)),
  conditions: entry.content.uses.map((use) => use.condition), product: { strength: entry.content.strength, form: entry.content.form, route: entry.content.route, standard_concept: entry.content.standard_concept } }));
let drafts = [], generationBodies = [], ruleWrites = 0, failedRule = false, failedGenerate = false, denied = false, failedPreview = false, delayedPreview = false;
function fixture(visitId, body) {
  const index = visits.findIndex((row) => row.id === visitId), condition = diagnoses[index].condition_code;
  const eligible = profiles.filter((row) => row.conditions.includes(condition) && row.review_is_current && row.catalogue_review_current);
  const snapshot = structuredClone({ as_of_date: '2026-10-14', patient: patients[index], context: contexts[index], analysis: analyses[index], clinical: body.clinical,
    is_demo: true, diagnosis: { id: body.diagnosis_id, condition, condition_label: diagnoses[index].condition_label }, proposals: [],
    omitted_unreviewed: entries.filter((entry) => entry.content.uses.some((use) => use.condition === condition) && !eligible.some((row) => row.medicine === entry.id))
      .map((entry) => ({ medicine_id: entry.id, generic_name: entry.content.generic_name, reason: 'Catalogue content or executable rule review is missing/outdated.' })) });
  const data = { snapshot, profiles: eligible, medicines: contents.filter((entry) => eligible.some((row) => row.medicine === entry.id)) };
  const computed = python('import json,sys; from types import SimpleNamespace as S; from prescription_drafts.engine import suggest_regimens,run_screening; data=json.load(sys.stdin); entries=[S(pk=item["id"],content=item,content_hash="fixture") for item in data["medicines"]]; profiles={item["medicine"]:S(content=item["content"],content_hash=item["content_hash"]) for item in data["profiles"]}; suggestions=suggest_regimens(entries,profiles,data["snapshot"],[]); proposed={item["medicine_id"]:item["dose"] for item in suggestions if item["status"]=="suggested"}; result=run_screening(entries,profiles,data["snapshot"],proposed,[]); result["candidates"]=[item for item in result["candidates"] if item["medicine_id"] in proposed]; result["selection_mode"]="automatic"; result["excluded_candidates"]=[item for item in suggestions if item["status"]!="suggested"]; [item.update(regimen_origin="rule_suggestion") for item in result["candidates"]]; print(json.dumps({"suggestions":suggestions,"result":result}))', data);
  const planHash = createHash('sha256').update(JSON.stringify({ ...snapshot, clinical: { ...snapshot.clinical, reviewed: false }, profiles: eligible, suggestions: computed.suggestions })).digest('hex');
  return { snapshot, computed, planHash };
}
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((name) => join(cache, name, 'chrome-win64', 'chrome.exe')).find(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path === '/session/') return send({ user: doctor, csrfToken: 'test-csrf-token' });
  if (path.startsWith('/api/prescription/') && denied) return send({ detail: 'Test screening access revoked.' }, 403);
  if (path === '/api/prescription/patients/') return send(patients);
  if (path === '/api/prescription/consultations/') return send(visits);
  if (path === '/api/prescription/patient-contexts/') return send(contexts);
  if (path === '/api/prescription/analyses/') return send(url.searchParams.has('consultation') ? analyses.filter((row) => row.consultation === url.searchParams.get('consultation')) : analyses);
  if (path === '/api/prescription/diagnoses/') return send(diagnoses);
  if (path === '/api/prescription/medicines/') return send(entries);
  if (path === '/api/prescription/safety-profiles/') return send(url.searchParams.has('medicine') ? profiles.filter((row) => row.medicine === url.searchParams.get('medicine')) : profiles);
  if (path === '/api/prescription/drafts/') return send(url.searchParams.has('consultation') ? drafts.filter((row) => row.consultation_id === url.searchParams.get('consultation')) : drafts);
  const review = path.match(/^\/api\/prescription\/(medicines|safety-profiles)\/([^/]+)\/review\/$/);
  if (review) {
    assert.equal(request.headers()['x-csrftoken'], 'test-csrf-token');
    const body = request.postDataJSON(); assert.equal(body.evidence_checked, true);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const entry = entries.find((row) => row.id === review[2]), profile = profiles.find((row) => row.medicine === review[2]);
    if (review[1] === 'medicines') {
      Object.assign(entry, { review_is_current: true, review_status: 'reviewed', reviewer_name: doctor.username, reviewed_by: doctor.id, reviewed_at: '2026-10-14T01:04:00Z', updated_at: '2026-10-14T01:04:00Z', review_notes: body.notes });
      profile.catalogue_review_current = true; return send(entry);
    }
    ruleWrites++;
    if (failedRule) return send({ detail: 'Test rule review failed.' }, 500);
    Object.assign(profile, { review_is_current: true, review_status: 'reviewed', reviewer_name: doctor.username, reviewed_at: '2026-10-14T01:05:00Z', updated_at: '2026-10-14T01:05:00Z', review_notes: body.notes });
    return send(profile);
  }
  const preview = path.match(/^\/api\/prescription\/drafts\/regimens\/([^/]+)\/$/);
  if (preview) {
    assert.equal(request.headers()['x-csrftoken'], 'test-csrf-token');
    const body = request.postDataJSON(); assert.equal(body.clinical.reviewed, false);
    const { snapshot, computed, planHash } = fixture(preview[1], body);
    if (delayedPreview && body.clinical.onset_hours === '24') await new Promise((resolve) => setTimeout(resolve, 1200));
    if (failedPreview) return send({ detail: 'Test automatic selection failed.' }, 500);
    return send({ consultation_id: preview[1], diagnosis_id: body.diagnosis_id, context_updated_at: snapshot.context.updated_at, approved: false, published: false,
      suggestions: computed.suggestions, plan_hash: planHash, omitted_unreviewed: snapshot.omitted_unreviewed });
  }
  const generate = path.match(/^\/api\/prescription\/drafts\/generate\/([^/]+)\/$/);
  if (generate) {
    assert.equal(request.headers()['x-csrftoken'], 'test-csrf-token');
    const body = request.postDataJSON(); generationBodies.push(body);
    assert.equal(body.selection_mode, 'automatic'); assert.deepEqual(body.proposals, []); assert.equal(body.clinical.reviewed, true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (failedGenerate) return send({ detail: 'Test draft save failed; retry unchanged inputs.' }, 500);
    const { snapshot, computed, planHash } = fixture(generate[1], body), latest = drafts.find((row) => row.consultation_id === generate[1]);
    assert.match(body.expected_plan_hash, /^[0-9a-f]{64}$/);
    if (body.expected_plan_hash !== planHash) return send({ detail: 'The automatic plan or its evidence changed. Review the refreshed plan before saving.' }, 409);
    assert.equal(body.expected_latest_revision, latest?.revision ?? 0);
    snapshot.selection_mode = 'automatic'; snapshot.regimen_suggestions = computed.suggestions; snapshot.reviewed_plan_hash = planHash;
    snapshot.proposals = computed.suggestions.filter((row) => row.status === 'suggested').map((row) => ({ medicine_id: row.medicine_id, dose: row.dose, origin: 'rule_suggestion' }));
    const saved = { id: '10000000-0000-4000-8000-' + String(drafts.length + 1).padStart(12, '0'), consultation_id: generate[1], patient: snapshot.patient.id, doctor: doctor.id,
      revision: (latest?.revision ?? 0) + 1, request_key: body.request_key, created_at: new Date().toISOString(), snapshot, result: computed.result, current_state: { is_current: true, reason: null } };
    drafts = [saved, ...drafts.map((row) => row.consultation_id === generate[1] ? { ...row, current_state: { is_current: false, reason: 'A newer draft version exists.' } } : row)];
    return send(saved, 201);
  }
  throw new Error('Unmocked API: ' + request.method() + ' ' + path);
});
const plan = () => page.getByRole('region', { name: 'Automatically selected medicines' });
const savedDraft = () => page.getByRole('region', { name: 'Saved prescription screening draft' });
const acknowledge = () => page.getByRole('checkbox', { name: 'I reviewed these clinical inputs and proposed doses for this visit.' });
const verifySymptoms = () => page.getByRole('checkbox', { name: 'I verified these symptom targets and durations for this visit.' });
const generate = () => page.getByRole('button', { name: 'Generate Prescription Draft', exact: true });
async function visible(locator) { await locator.waitFor({ state: 'visible' }); }
async function selectPatient(index) {
  await page.getByLabel('Assigned registered patient').selectOption(String(patients[index].id));
  await page.getByLabel('Active encounter / consultation').selectOption(visits[index].id);
  await visible(page.getByRole('button', { name: 'Refresh drafts and rules' }));
}
async function clinical(index) {
  await page.getByLabel('Red-flag assessment').selectOption('none');
  await page.getByLabel('Renal dosing assessment').selectOption('standard');
  await page.getByLabel('Hepatic and alcohol-risk assessment').selectOption('standard');
  await page.getByLabel('Special population assessment').selectOption('standard');
  if (index === 0) {
    await page.getByLabel('Live intranasal influenza vaccine timing').selectOption('no_conflict');
    await page.getByLabel('Hours since influenza symptom onset').fill('24');
  } else {
    await page.getByLabel('Varicella indication assessment').selectOption(index === 2 ? 'typical_uncomplicated_child' : 'risk_group_confirmed');
    await page.getByLabel('Topical use assessment').selectOption('standard');
    await page.getByLabel('Hours since varicella rash onset').fill('24');
  }
  await verifySymptoms().check();
}
async function save(version) { await acknowledge().check(); await generate().click(); await visible(page.getByText('Screening draft version ' + version + ' saved. It is unapproved.', { exact: true })); }
try {
  await page.goto(origin + '/doctor/prescription-workspace'); await selectPatient(0);
  await visible(page.getByText('No relevant medicine has both current catalogue and executable-rule reviews.', { exact: true }));
  assert.equal(await generate().isDisabled(), true);
  await page.goto(origin + '/doctor/medicine-knowledge');
  for (let i = 0; i < entries.length; i++) {
    await page.getByRole('region', { name: 'Medicine catalogue' }).getByRole('button', { name: new RegExp('^' + entries[i].content.generic_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await page.getByRole('link', { name: '1. Content review', exact: true }).click();
    await page.getByLabel('Review notes', { exact: true }).fill('Isolated browser fixture: checked content and source identity.');
    await page.getByRole('checkbox', { name: /I reviewed the listed evidence/ }).check();
    await page.getByRole('button', { name: 'Save content review' }).click();
    await visible(page.getByText('Content review saved. Executable safety rules need a separate current review before screening.', { exact: true }));
    await page.getByRole('link', { name: '2. Safety rule review', exact: true }).click();
    await page.getByLabel('Safety rule review notes').fill('Isolated browser fixture: checked rule scope and dosage source.');
    await page.getByRole('checkbox', { name: /I reviewed the executable rules/ }).check();
    if (i === 0) {
      failedRule = true; await page.getByRole('button', { name: 'Save safety rule review' }).click();
      await visible(page.getByText('Test rule review failed.', { exact: true })); failedRule = false;
      assert.match(await page.getByLabel('Safety rule review notes').inputValue(), /Isolated browser fixture/);
    }
    await page.getByRole('button', { name: 'Save safety rule review' }).evaluate((button) => { button.click(); button.click(); });
    await visible(page.getByText('Safety rule review saved for this version.', { exact: true }));
  }
  assert.equal(ruleWrites, 5);
  console.log('PASS: four catalogue/rule reviews, evidence acknowledgement, CSRF, failure retention and duplicate click protection.');
  await page.goto(origin + '/doctor/prescription-workspace'); await selectPatient(0);
  assert.equal(await page.getByLabel(/Proposed amount|Doses per day|Duration \(days\)/).count(), 0);
  assert.equal(await page.getByLabel('Fever: verified duration (hours)').inputValue(), '72');
  assert.equal(await verifySymptoms().isChecked(), false);
  await clinical(0);
  await visible(plan().getByRole('article', { name: 'Oseltamivir', exact: true }));
  await visible(plan().getByRole('article', { name: 'Paracetamol (acetaminophen)', exact: true }));
  assert.equal(await plan().getByRole('article').count(), 2);
  await visible(plan().getByText(/1000 mg when needed.*Maximum 3 doses \(3000 mg\)/));
  await visible(plan().getByText('75 mg, 2 doses/day for 5 days (oral)', { exact: true }));
  failedGenerate = true; await acknowledge().check(); await generate().click();
  await visible(page.getByText('Test draft save failed; retry unchanged inputs.', { exact: true }));
  failedGenerate = false; await generate().evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByText('Screening draft version 1 saved. It is unapproved.', { exact: true }));
  assert.equal(generationBodies.length, 2); assert.equal(generationBodies[0].request_key, generationBodies[1].request_key);
  assert.equal(drafts[0].result.candidates.length, 2); assert.equal(drafts[0].result.approved, false);
  console.log('PASS: complete automatic influenza plan with PRN limits, no manual dose controls and safe retry persistence.');
  await page.getByLabel('Fever requires symptom relief').uncheck(); await page.getByLabel('Body aches requires symptom relief').uncheck(); await verifySymptoms().check();
  await visible(plan().getByRole('article', { name: 'Oseltamivir', exact: true }));
  assert.equal(await plan().getByRole('article').count(), 1);
  await acknowledge().check();
  profiles[0].updated_at = '2026-10-14T01:06:00Z';
  await generate().click();
  await visible(page.getByText('The automatic plan or its evidence changed. Review the refreshed plan before saving.', { exact: true }));
  assert.equal(drafts.length, 1);
  await visible(plan().getByRole('article', { name: 'Oseltamivir', exact: true }));
  assert.equal(await acknowledge().isChecked(), false);
  assert.equal(await generate().isDisabled(), true);
  await save(2);
  await page.getByLabel('Hours since influenza symptom onset').fill('72');
  await visible(plan().getByText(/No automatic medicine selected/));
  await save(3);
  assert.equal(drafts[0].result.candidates.length, 0); assert.equal(drafts[0].result.excluded_candidates.length, 2);
  assert.equal(drafts[2].result.candidates.length, 2);
  await page.reload(); await visible(savedDraft());
  assert.equal(await savedDraft().getByText(/Inputs have unsaved changes/).count(), 0);
  await page.getByLabel('Saved screening version').selectOption(drafts[2].id);
  await visible(savedDraft().getByText(/A newer draft version exists/));
  console.log('PASS: target changes exclude unnecessary medicines; changed evidence requires review again; empty plans and immutable versions persist.');
  await selectPatient(1); await clinical(1);
  await visible(plan().getByRole('article', { name: 'Calamine + zinc oxide', exact: true }));
  assert.equal(await plan().getByRole('article').count(), 3);
  await visible(plan().getByText('800 mg, 4 doses/day for 5 days (oral)', { exact: true }));
  await visible(plan().getByText('Apply to affected skin as needed · Topical · No fixed amount or course', { exact: true }));
  await save(1);
  const adultSnapshot = structuredClone(drafts[0]);
  await page.getByLabel('Itching requires symptom relief').uncheck(); await verifySymptoms().check();
  await visible(plan().getByRole('article', { name: 'Acyclovir', exact: true }));
  assert.equal(await plan().getByRole('article').count(), 2);
  await save(2);
  assert.equal(adultSnapshot.result.candidates.length, 3);
  console.log('PASS: chickenpox selects all applicable regimens and removes calamine when itching is not verified.');
  await selectPatient(2);
  assert.equal(await page.getByLabel(/Measured weight/).inputValue(), '');
  assert.equal(await savedDraft().count(), 0);
  await clinical(2);
  await visible(plan().getByRole('article', { name: 'Calamine + zinc oxide', exact: true }));
  assert.equal(await plan().getByRole('article').count(), 1);
  await save(1);
  assert.deepEqual(drafts[0].result.candidates.map((row) => row.medicine_id), ['calamine-zinc-oxide-lotion']);
  assert.equal(drafts[0].result.candidates[0].proposed_dose.amount, null);
  mkdirSync(artifacts, { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('main').evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  }
  await plan().scrollIntoViewIfNeeded(); await page.screenshot({ path: join(artifacts, 'patient-specific-plan-mobile.png'), fullPage: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: healthy-child exclusions, qualitative topical instructions, patient isolation and desktop/mobile layout.');
  failedPreview = true; await page.getByRole('button', { name: 'Refresh dose suggestions' }).click();
  await visible(page.getByText(/Automatic medicine selection unavailable: Test automatic selection failed/));
  assert.equal(await generate().isDisabled(), true); assert.equal(await plan().getByRole('article').count(), 0);
  failedPreview = false; await page.getByRole('button', { name: 'Refresh dose suggestions' }).click();
  await visible(plan().getByRole('article', { name: 'Calamine + zinc oxide', exact: true }));
  await selectPatient(0);
  await visible(plan().getByText(/No automatic medicine selected/));
  delayedPreview = true;
  await page.getByLabel('Hours since influenza symptom onset').fill('24'); await page.waitForTimeout(550);
  await page.getByLabel('Hours since influenza symptom onset').fill('72'); await page.waitForTimeout(1500);
  await visible(plan().getByText(/No automatic medicine selected/));
  assert.equal(await plan().getByRole('article').count(), 0); delayedPreview = false;
  console.log('PASS: preview failures disable save and hide stale plans; late responses cannot restore an obsolete medicine.');
  const patientARecords = drafts.filter((row) => row.patient === 201);
  patientARecords[0].current_state = { is_current: false, reason: 'Patient information changed; reassess current inputs.' };
  await page.goto(origin + '/doctor/prescription-records'); await visible(page.getByLabel('Saved prescription draft'));
  assert.equal(await page.getByLabel('Saved prescription draft').locator('option').count(), 6);
  await page.getByLabel('Saved prescription draft').selectOption(patientARecords[0].id);
  await visible(savedDraft().getByText('Patient information changed; reassess current inputs.', { exact: true }));
  denied = true; await page.getByRole('button', { name: 'Refresh draft records' }).click();
  await visible(page.getByText('Test screening access revoked.', { exact: true })); assert.equal(await savedDraft().count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: automatic plans and exclusions persist in Records; stale reasons and revoked-access clearing remain intact.');
  console.log('Artifacts: ' + artifacts);
} finally { await browser.close(); }
