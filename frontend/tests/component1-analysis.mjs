// Run: node tests/component1-analysis.mjs against the local Next dev server.
// All backend calls are intercepted. Real accounts and patient records are untouched.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const origin = process.env.MEDITRACK_TEST_URL || "http://localhost:3000";
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), "meditrack-component1-analysis");
const samples = Object.fromEntries(["influenza", "chickenpox"].map((name) => [name,
  JSON.parse(readFileSync(new URL("../../backend/prescription_context/samples/" + name + "_demo.json", import.meta.url), "utf8")),
]));
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, "ms-playwright");
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
    .map((name) => join(cache, name, "chrome-win64", "chrome.exe")).find(existsSync);
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));
const doctor = { id: 101, role: "doctor", username: "component1_test_doctor", doctorID: "DOC-TEST" };
const patients = [
  { id: 201, username: "analysis_patient_a", display_name: "Analysis Patient A", birthday: "1990-01-01", age_years: 36, dob_status: "valid" },
  { id: 202, username: "analysis_patient_b", display_name: "Analysis Patient B", birthday: null, age_years: null, dob_status: "missing" },
];
const ids = [1, 2, 3].map((number) => "00000000-0000-4000-8000-" + String(number).padStart(12, "0"));
const consultations = ids.map((id, index) => ({ id, doctor: doctor.id, patient: index === 1 ? 202 : 201,
  patient_name: index === 1 ? patients[1].display_name : patients[0].display_name,
  reason: index === 2 ? "Producer integration fixture" : "PP1 sample fixture", is_demo: index !== 2,
  assigned_by: 1, started_at: "2026-10-12T08:00:00Z", created_at: "2026-10-12T08:00:00Z",
}));
const patientContexts = [{ id: 1, patient: 201, date_of_birth: "1990-01-01", age_years: 36, dob_status: "valid", weight: null, weight_unit: null,
  allergy_status: "confirmed", allergies: ["Existing allergy A"], medicine_status: "confirmed", current_medicines: ["Existing current medicine A"],
  provenance: {}, updated_at: "2026-10-12T07:00:00Z", updated_by: doctor.id,
}];
const originalContext = structuredClone(patientContexts);
let analyses = [];
let diagnoses = [];
let demoRequests = 0;
let failDemo = false;
const analysisQueries = [];

function sampleResult(visit, scenario) {
  const payload = structuredClone(samples[scenario]);
  payload.patient_id = visit.patient;
  payload.consultation_id = visit.id;
  payload.analysis_reference += ":" + visit.id;
  return { id: analyses.length + 1, consultation: visit.id, imported_by: doctor.id,
    analysis_reference: payload.analysis_reference, payload, imported_at: "2026-10-12T08:30:00Z" };
}

await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname;
  const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type,x-csrftoken", "access-control-allow-methods": "GET,POST,OPTIONS" };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
  if (path === "/session/") return send({ user: doctor, csrfToken: "test-csrf-token" });
  if (path === "/api/prescription/patients/") return send(patients);
  if (path === "/api/prescription/consultations/") return send(consultations);
  if (path === "/api/prescription/patient-contexts/") return send(patientContexts);
  if (path === "/api/prescription/analyses/") {
    const id = url.searchParams.get("consultation");
    if (id) analysisQueries.push(id);
    return send(id ? analyses.filter((item) => item.consultation === id) : analyses);
  }
  const demoPath = path.match(/^\/api\/prescription\/consultations\/([^/]+)\/demo-analysis\/$/);
  if (demoPath) {
    demoRequests++;
    assert.equal(request.headers()["x-csrftoken"], "test-csrf-token");
    const body = request.postDataJSON();
    assert.deepEqual(Object.keys(body), ["scenario"], "Patient and visit IDs must be bound by the server");
    if (failDemo) return send({ detail: "Test demo result save failure." }, 500);
    const visit = consultations.find((item) => item.id === demoPath[1]);
    assert.equal(visit.is_demo, true);
    const saved = sampleResult(visit, body.scenario);
    analyses.push(saved);
    return send(saved, 201);
  }
  if (path === "/api/prescription/diagnoses/") {
    if (request.method() === "POST") {
      assert.equal(request.headers()["x-csrftoken"], "test-csrf-token");
      const body = request.postDataJSON();
      const analysis = analyses.find((item) => item.consultation === body.consultation);
      assert.equal(body.analysis_reference, analysis.analysis_reference);
      const saved = { ...body, doctor: doctor.id, id: diagnoses.length + 1, confirmed_at: "2026-10-12T08:45:00Z" };
      diagnoses.push(saved);
      return send(saved, 201);
    }
    return send(diagnoses);
  }
  throw new Error("Unmocked backend request: " + request.method() + " " + path);
});

async function visible(locator) { await locator.waitFor({ state: "visible" }); }
const diagnosisInput = () => page.getByRole("textbox", { name: /^Diagnosis context/ });

try {
  await page.goto(origin + "/doctor/prescription-workspace");
  await page.getByLabel("Assigned registered patient").selectOption("201");
  await page.getByLabel("Active encounter / consultation").selectOption(ids[0]);
  assert.equal(await page.getByRole("button", { name: "Load demo analysis" }).isDisabled(), true);
  await page.getByLabel("Demo analysis scenario").selectOption("influenza");
  failDemo = true;
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await visible(page.getByText("Test demo result save failure.", { exact: true }));
  assert.equal(analyses.length, 0);
  failDemo = false;
  await page.getByRole("button", { name: "Load demo analysis" }).evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByText("Sample confidence: 82%", { exact: true }));
  assert.equal(demoRequests, 2);
  assert.equal(analyses.length, 1);
  await visible(page.getByText("Synthetic demo data — supplied JSON sample", { exact: true }));
  await visible(page.getByText("Diagnosis has not been confirmed by the doctor.", { exact: true }));
  assert.equal(await diagnosisInput().inputValue(), "Influenza");
  assert.equal(diagnoses.length, 0, "Import cannot confirm a diagnosis");
  assert.deepEqual(patientContexts, originalContext);
  await visible(page.getByText("Allergies: Existing allergy A", { exact: true }));
  assert.equal(await page.getByLabel("Current medicines", { exact: true }).inputValue(), "Existing current medicine A");
  console.log("PASS: supplied influenza JSON binds the selected visit, displays synthetic scores, survives import failures, and preserves manual patient context.");

  await page.reload();
  await visible(page.getByText("Sample confidence: 82%", { exact: true }));
  assert.equal(await diagnosisInput().inputValue(), "Influenza");
  await page.getByRole("button", { name: "Confirm Diagnosis", exact: true }).click();
  await visible(page.getByText("Doctor diagnosis confirmation is saved separately.", { exact: true }));
  assert.equal(diagnoses.length, 1);
  assert.equal(diagnoses[0].condition_code, "influenza");
  assert.equal(await diagnosisInput().isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Generate Prescription Draft", exact: true }).isDisabled(), true);
  console.log("PASS: refresh restores analysis; only explicit doctor confirmation stores the diagnosis, with the exact analysis reference.");

  await page.getByLabel("Assigned registered patient").selectOption("202");
  assert.equal(await diagnosisInput().inputValue(), "");
  await page.getByLabel("Demo analysis scenario").selectOption("chickenpox");
  await page.getByRole("button", { name: "Load demo analysis" }).click();
  await visible(page.getByText("Sample confidence: 79%", { exact: true }));
  assert.equal(await diagnosisInput().inputValue(), "Chickenpox");
  assert.equal(await page.getByText("Sample confidence: 82%", { exact: true }).count(), 0);
  assert.equal(analyses[1].payload.patient_id, 202);
  assert.equal(analyses[1].payload.consultation_id, ids[1]);
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "chickenpox-demo.png"), fullPage: true });
  console.log("PASS: chickenpox sample is isolated to the other patient and visit.");

  await page.getByLabel("Assigned registered patient").selectOption("201");
  await page.getByLabel("Active encounter / consultation").selectOption(ids[2]);
  assert.equal(await page.getByLabel("Demo analysis scenario").count(), 0, "Real visits must not offer sample import");
  await diagnosisInput().fill("Doctor's initial impression");
  const delivery = sampleResult(consultations[2], "influenza");
  delivery.analysis_reference = "producer-fixture-real-003";
  delivery.payload = { ...delivery.payload, analysis_reference: delivery.analysis_reference, source: "component_1", is_demo: false, model_version: "producer-test-fixture-v1" };
  analyses.push(delivery); // Simulate the receiver committing a result after the page opened.
  await page.getByText("Component 1 result — clinician review required", { exact: true }).waitFor({ state: "visible", timeout: 12000 });
  assert.equal(await diagnosisInput().inputValue(), "Doctor's initial impression", "Automatic delivery must preserve the doctor's draft");
  assert.equal(await page.getByText("Reported model score: 82%", { exact: true }).count(), 1);
  assert.equal(await page.getByText("Sample confidence: 79%", { exact: true }).count(), 0);
  assert.equal(diagnoses.length, 1);
  assert.ok(analysisQueries.includes(ids[2]));
  assert.deepEqual(patientContexts, originalContext);
  console.log("PASS: a producer result appears automatically without upload or refresh, preserves the doctor's draft, and cannot confirm itself.");

  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator("main").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  }
  assert.deepEqual(pageErrors, []);
  console.log("PASS: desktop/mobile layout; no browser errors.");
  console.log("Screenshot: " + join(artifacts, "chickenpox-demo.png"));
} catch (error) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "component1-failure.png"), fullPage: true });
  console.error("Browser errors:", pageErrors);
  console.error("Visible page:", (await page.locator("body").innerText()).slice(0, 4500));
  throw error;
} finally {
  await browser.close();
}
