// Run against a local Next dev server: node tests/prescription-encounters.mjs
// Every backend request is intercepted. This never writes to the real database.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const origin = process.env.MEDITRACK_TEST_URL || "http://localhost:3000";
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), "meditrack-prescription-encounters");
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, "ms-playwright");
  if (existsSync(cache)) {
    executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
      .sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]))
      .map((name) => join(cache, name, "chrome-win64", "chrome.exe")).find(existsSync);
  }
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const doctor = { id: 101, username: "encounter_test_doctor", role: "doctor", doctorID: "DOC-TEST", lab_name: null, license_id: null, lab_address: null };
let user = null;
let denyAccess = false;
let failCreation = false;
let directoryRequests = 0;
let createRequests = 0;
let successfulCreates = 0;
let contextWrites = 0;
let failContextSave = false;
const patients = [
  { id: 201, username: "test_patient_a", display_name: "Test Patient A", birthday: "1990-01-01", age_years: 36, dob_status: "valid" },
  { id: 202, username: "test_patient_b", display_name: "Test Patient B", birthday: null, age_years: null, dob_status: "missing" },
];
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const newId = "00000000-0000-4000-8000-000000000003";
let consultations = patients.map((patient, index) => ({
  id: index ? secondId : firstId, patient: patient.id, patient_name: patient.display_name,
  doctor: doctor.id, assigned_by: 1, reason: "Assigned first visit", is_demo: true,
  started_at: "2026-10-10T08:00:00Z", created_at: "2026-10-10T08:00:00Z",
}));
const contexts = [{
  id: 1, patient: 201, date_of_birth: "1990-01-01", weight: "65.00", weight_unit: "kg",
  allergy_status: "confirmed", allergies: ["Test allergy A"], medicine_status: "unknown",
  current_medicines: [], provenance: {}, updated_at: "2026-10-10T08:00:00Z", updated_by: doctor.id,
}];
const analyses = [{ id: 1, consultation: firstId, imported_by: doctor.id, analysis_reference: "TEST-ANALYSIS-A", payload: { fixture: true }, imported_at: "2026-10-10T08:00:00Z" }];
const diagnoses = [{ id: 1, consultation: firstId, doctor: doctor.id, condition_code: "TEST", condition_label: "Test diagnosis A", analysis_reference: null, confirmed_at: "2026-10-10T08:00:00Z" }];
await context.addInitScript(() => localStorage.setItem("meditrack_user", JSON.stringify({ role: "doctor", username: "stale_display_only" })));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type,x-csrftoken", "access-control-allow-methods": "GET,POST,OPTIONS" };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
  if (path === "/session/") return send({ user, csrfToken: "test-csrf-token" });
  if (path === "/logout/") {
    assert.equal(request.headers()["x-csrftoken"], "test-csrf-token");
    user = null;
    return send({ message: "Logged out" });
  }
  if (path.startsWith("/api/prescription/") && denyAccess) return send({ detail: "Access denied for this doctor." }, 403);
  if (path === "/api/prescription/patients/") { directoryRequests++; return send(patients); }
  const reviewPath = path.match(/^\/api\/prescription\/consultations\/([^/]+)\/patient-context\/$/);
  if (reviewPath) {
    contextWrites++;
    assert.equal(request.method(), "POST");
    assert.equal(request.headers()["x-csrftoken"], "test-csrf-token");
    const body = request.postDataJSON();
    assert.deepEqual(Object.keys(body).sort(), ["allergies", "allergy_status", "current_medicines", "expected_updated_at", "medicine_status", "reviewed"].sort());
    assert.equal(body.reviewed, true);
    if (failContextSave) return send({ detail: "Test patient information save failure." }, 500);
    const encounter = consultations.find((item) => item.id === reviewPath[1]);
    const patient = patients.find((item) => item.id === encounter.patient);
    const previous = contexts.find((item) => item.patient === patient.id);
    if (body.expected_updated_at !== (previous?.updated_at ?? null)) {
      return send({ detail: "Patient information has changed. Refresh the workspace and review the latest values before saving." }, 409);
    }
    const timestamp = "2026-10-12T09:15:" + String(contextWrites).padStart(2, "0") + "Z";
    const saved = {
      ...previous, id: previous?.id ?? contexts.length + 1, patient: patient.id,
      date_of_birth: patient.birthday, age_years: patient.age_years, dob_status: patient.dob_status,
      weight: previous?.weight ?? null, weight_unit: previous?.weight_unit ?? null,
      allergy_status: body.allergy_status, allergies: body.allergies,
      medicine_status: body.medicine_status, current_medicines: body.current_medicines,
      updated_at: timestamp, updated_by: doctor.id,
      provenance: { last_reviewed_consultation: encounter.id, last_reviewed_by: doctor.id, last_reviewed_at: timestamp, source: "doctor_manual_review" },
    };
    const index = contexts.findIndex((item) => item.patient === patient.id);
    if (index >= 0) contexts[index] = saved;
    else contexts.push(saved);
    return send(saved);
  }
  if (path === "/api/prescription/consultations/") {
    if (request.method() === "POST") {
      createRequests++;
      assert.equal(request.headers()["x-csrftoken"], "test-csrf-token");
      const payload = request.postDataJSON();
      assert.deepEqual(Object.keys(payload).sort(), ["patient", "reason"]);
      if (failCreation) return send({ detail: "Test save failure. Retry this visit." }, 500);
      const id = "00000000-0000-4000-8000-" + String(3 + successfulCreates++).padStart(12, "0");
      const saved = { ...consultations[0], ...payload, id, patient_name: patients.find((item) => item.id === payload.patient).display_name, assigned_by: null, started_at: "2026-10-10T09:00:00Z" };
      consultations = [saved, ...consultations];
      return send(saved, 201);
    }
    return send(consultations);
  }
  if (path === "/api/prescription/patient-contexts/") return send(contexts);
  if (path === "/api/prescription/safety-profiles/" || path === "/api/prescription/drafts/") return send([]);
  if (path === "/api/prescription/analyses/") return send(analyses);
  if (path === "/api/prescription/diagnoses/") return send(diagnoses);
  throw new Error("Unmocked backend request: " + request.method() + " " + path);
});

async function visible(locator) { await locator.waitFor({ state: "visible" }); }
async function disabledActions() {
  for (const name of ["Generate Prescription Draft", "Edit draft", "Revalidate edited version", "Reject", "Approve", "Publish Approved Version"]) {
    const action = page.getByRole("button", { name, exact: true });
    if (await action.count()) assert.equal(await action.isDisabled(), true, name);
  }
}

try {
  await page.goto(origin + "/doctor/prescription-workspace");
  await visible(page.getByRole("link", { name: "Sign in as a doctor" }));
  assert.equal(directoryRequests, 0, "LocalStorage must not grant server access");
  assert.equal(await page.getByLabel("Assigned registered patient").isDisabled(), true);
  console.log("PASS: stale localStorage cannot grant clinical access.");

  user = doctor;
  await page.reload();
  await page.getByLabel("Assigned registered patient").selectOption("201");
  await visible(page.getByText("TEST-ANALYSIS-A", { exact: true }));
  assert.equal(await page.getByRole("textbox", { name: /^Diagnosis context/ }).inputValue(), "Test diagnosis A");
  await disabledActions();
  assert.equal(await page.getByRole("button", { name: "Start new consultation", exact: true }).isDisabled(), true);
  await page.getByLabel("Reason for visit").fill("   ");
  assert.equal(await page.getByRole("button", { name: "Start new consultation", exact: true }).isDisabled(), true);

  failCreation = true;
  await page.getByLabel("Reason for visit").fill("PP1 repeat visit");
  await page.getByRole("button", { name: "Start new consultation", exact: true }).click();
  await visible(page.getByText("Test save failure. Retry this visit.", { exact: true }));
  assert.equal(await page.getByTestId("consultation-id").textContent(), firstId);
  assert.equal(await page.getByLabel("Reason for visit").inputValue(), "PP1 repeat visit");
  assert.equal(await page.getByText("New visit saved. The registered patient ID stays the same.").count(), 0);
  failCreation = false;
  await page.getByRole("button", { name: "Start new consultation", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByText("New visit saved. The registered patient ID stays the same."));
  assert.equal(createRequests, 2, "One failed request and one successful request; double click cannot duplicate the visit");
  assert.equal(await page.getByTestId("consultation-id").textContent(), newId);
  assert.equal(await page.getByRole("textbox", { name: /^Diagnosis context/ }).inputValue(), "");
  assert.equal(await page.getByText("TEST-ANALYSIS-A", { exact: true }).count(), 0);
  await visible(page.getByText("Allergies: Test allergy A", { exact: true }));
  await disabledActions();
  console.log("PASS: save failures keep the previous visit; new visits reset encounter data, retain patient context, and reject duplicate clicks.");

  await page.reload();
  await visible(page.getByTestId("consultation-id"));
  assert.equal(await page.getByTestId("consultation-id").textContent(), newId);
  assert.equal(await page.getByLabel("Assigned registered patient").inputValue(), "201");
  await visible(page.getByText("Allergies: Test allergy A", { exact: true }));
  await page.getByLabel("Active encounter / consultation").selectOption(firstId);
  await visible(page.getByText("TEST-ANALYSIS-A", { exact: true }));
  await page.getByLabel("Reason for visit").fill("Unsaved A-specific reason");
  await page.getByLabel("Assigned registered patient").selectOption("202");
  assert.equal(await page.getByTestId("consultation-id").textContent(), secondId);
  assert.equal(await page.getByLabel("Reason for visit").inputValue(), "");
  assert.equal(await page.getByRole("textbox", { name: /^Diagnosis context/ }).inputValue(), "");
  assert.equal(await page.getByText("TEST-ANALYSIS-A", { exact: true }).count(), 0);
  assert.equal(await page.getByText("Allergies: Test allergy A", { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Active encounter / consultation").locator("option").count(), 2);
  await page.getByLabel("Assigned registered patient").selectOption("201");
  assert.equal(await page.getByTestId("consultation-id").textContent(), newId);
  console.log("PASS: refresh restores the saved visit; patient changes never carry diagnosis, analysis, or unsaved visit details across patients.");

  await visible(page.getByText("Registered DOB: 1990-01-01", { exact: true }));
  await visible(page.getByText("Age: 36 years", { exact: true }));
  assert.equal(await page.getByLabel(/weight|date of birth|registered dob/i).count(), 0, "No manual DOB or weight field");
  assert.equal(await page.getByLabel("Allergies", { exact: true }).inputValue(), "Test allergy A");
  await page.getByLabel("Assigned registered patient").selectOption("202");
  await visible(page.getByText("Age: Unavailable", { exact: true }));
  assert.equal(await page.getByLabel("Allergy status", { exact: true }).inputValue(), "unknown");
  assert.equal(await page.getByLabel("Current medicine status", { exact: true }).inputValue(), "unknown");
  const reviewCheckbox = page.getByRole("checkbox", { name: "I reviewed allergies and current medicines with the patient for this visit.", exact: true });
  const saveInformation = page.getByRole("button", { name: "Save patient information", exact: true });
  assert.equal(await saveInformation.isDisabled(), true);
  await page.getByLabel("Allergy status", { exact: true }).selectOption("none");
  await page.getByLabel("Current medicine status", { exact: true }).selectOption("confirmed");
  await reviewCheckbox.check();
  assert.equal(await saveInformation.isDisabled(), true, "Known medicines need an entered item");
  await page.getByLabel("Current medicines", { exact: true }).fill("Test medicine B");
  assert.equal(await reviewCheckbox.isChecked(), false, "Editing clears the review confirmation");
  await reviewCheckbox.check();
  failContextSave = true;
  await saveInformation.click();
  await visible(page.getByText("Test patient information save failure.", { exact: true }));
  assert.equal(await page.getByLabel("Current medicines", { exact: true }).inputValue(), "Test medicine B");
  assert.equal(contexts.length, 1);
  failContextSave = false;
  await saveInformation.evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByText(/^Patient information reviewed and saved for this visit\./));
  assert.equal(contextWrites, 2);
  assert.equal(contexts.find((item) => item.patient === 202).weight, null);
  await page.reload();
  await visible(page.getByText(/^Patient information reviewed and saved for this visit\./));
  assert.equal(await page.getByLabel("Current medicines", { exact: true }).inputValue(), "Test medicine B");
  assert.equal(await page.getByLabel("Allergy status", { exact: true }).inputValue(), "none");
  await page.getByLabel("Reason for visit").fill("Patient B return visit");
  await page.getByRole("button", { name: "Start new consultation", exact: true }).click();
  await visible(page.getByText("Patient information has not been reviewed for this visit yet.", { exact: true }));
  assert.equal(await page.getByLabel("Current medicines", { exact: true }).inputValue(), "Test medicine B");
  assert.equal(await reviewCheckbox.isChecked(), false);
  assert.equal(await saveInformation.isDisabled(), true);
  await reviewCheckbox.check();
  await saveInformation.click();
  await visible(page.getByText(/^Patient information reviewed and saved for this visit\./));
  assert.equal(contexts.length, 2, "Return visits reuse the existing patient context");
  console.log("PASS: registered DOB and age are automatic; no weight input; manual medicine/allergy status saves persist, failures retain edits, and return visits require a new review.");

  const profileIndex = contexts.findIndex((item) => item.patient === 202);
  contexts[profileIndex] = { ...contexts[profileIndex], allergy_status: "confirmed", allergies: ["Changed in another session"], updated_at: "2026-10-12T12:00:00Z", provenance: {} };
  await page.getByLabel("Current medicines", { exact: true }).fill("Unsaved stale medicine change");
  await reviewCheckbox.check();
  await saveInformation.click();
  await visible(page.getByText("Patient information has changed. Refresh the workspace and review the latest values before saving.", { exact: true }));
  assert.deepEqual(contexts[profileIndex].current_medicines, ["Test medicine B"]);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await page.getByLabel("Allergies", { exact: true }).waitFor({ state: "visible" });
  assert.equal(await page.getByLabel("Allergies", { exact: true }).inputValue(), "Changed in another session");
  assert.equal(await page.getByLabel("Current medicines", { exact: true }).inputValue(), "Test medicine B");
  await page.getByLabel("Assigned registered patient").selectOption("201");
  assert.equal(await page.getByLabel("Allergies", { exact: true }).inputValue(), "Test allergy A");
  assert.equal(await page.getByLabel("Current medicine status", { exact: true }).inputValue(), "unknown");
  assert.equal(await page.getByLabel("Current medicines", { exact: true }).count(), 0);
  console.log("PASS: newer patient data cannot be overwritten by stale edits; refresh loads it and patient changes clear unsaved clinical information.");

  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "step1-encounter.png"), fullPage: true });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.locator("main").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  }
  denyAccess = true;
  await page.getByLabel("Reason for visit").fill("Expired session test");
  await page.getByRole("button", { name: "Start new consultation", exact: true }).click();
  await visible(page.getByRole("link", { name: "Sign in as a doctor" }));
  assert.equal(await page.getByTestId("consultation-id").count(), 0);
  assert.equal(await page.getByText("Allergies: Test allergy A", { exact: true }).count(), 0);
  denyAccess = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await visible(page.getByTestId("consultation-id"));
  denyAccess = true;
  await page.reload();
  await visible(page.getByRole("link", { name: "Sign in as a doctor" }));
  assert.equal(await page.getByTestId("consultation-id").count(), 0);
  denyAccess = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await visible(page.getByTestId("consultation-id"));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL(origin + "/login");
  await visible(page.getByRole("button", { name: /Sign In/i }));
  assert.equal(user, null);
  assert.equal(await page.evaluate(() => localStorage.getItem("meditrack_user")), null);
  assert.deepEqual(pageErrors, []);
  console.log("PASS: desktop/mobile layout, denied-access data clearing, and server logout.");
  console.log("Screenshot: " + join(artifacts, "step1-encounter.png"));
} catch (error) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "step1-failure.png"), fullPage: true });
  console.error("Page URL:", page.url());
  console.error("Browser errors:", pageErrors);
  console.error("Visible page:", (await page.locator("body").innerText()).slice(0, 5000));
  throw error;
} finally {
  await browser.close();
}
