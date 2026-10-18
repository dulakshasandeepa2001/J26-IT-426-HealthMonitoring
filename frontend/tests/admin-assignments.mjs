// Run: node tests/admin-assignments.mjs (requires the local Next dev server).
// Every backend request is intercepted. No real accounts or patient data change.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const origin = process.env.MEDITRACK_TEST_URL || "http://localhost:3000";
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), "meditrack-admin-assignments");
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
page.on("pageerror", (err) => pageErrors.push(err.message));
const admin = { id: 1, username: "portal_admin_fixture", role: "admin", is_staff: false, doctorID: null, lab_name: null, license_id: null, lab_address: null };
const doctor = { ...admin, id: 101, username: "doctor_fixture", role: "doctor", doctorID: "DOC-TEST-101" };
const doctors = [{ id: 101, username: doctor.username, display_name: "Test Doctor One", doctorID: doctor.doctorID, working_hospital: "Test Hospital" }];
const patients = [{ id: 201, username: "patient_fixture", display_name: "Test Patient One", birthday: "1990-01-01", age_years: 36, dob_status: "valid" }];
let pending = [{ id: 901, username: "pending_fixture", email: "test@example.invalid", phone: "0000000000", NIC_number: "TEST00000001", doctorID: "", degrees: "Test degree", university: "Test University", working_hospital: "Test Hospital", birthday: "1990-01-01", created_at: "2026-10-12T08:00:00Z" }];
let user = null;
let assignments = [];
let directoryRequests = 0;
let creates = 0;
let failSave = false;
let denyAssignments = false;
const savedId = "00000000-0000-4000-8000-000000000012";
await context.addInitScript(() => localStorage.setItem("meditrack_user", JSON.stringify({ role: "admin", username: "stale_admin_display" })));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request();
  const path = new URL(request.url()).pathname;
  const headers = { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type,x-csrftoken", "access-control-allow-methods": "GET,POST,OPTIONS" };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
  if (path === "/session/") return send({ user, csrfToken: "test-csrf-token" });
  if (path === "/pending-doctors/") return send({ pending_doctors: pending });
  if (path === "/approve-doctor/901/") {
    assert.equal(request.headers()["x-csrftoken"], "test-csrf-token");
    pending = [];
    doctors.push({ id: 103, username: "new_approved_fixture", display_name: "New Approved Doctor", doctorID: null, working_hospital: "Test Hospital" });
    return send({ message: "Doctor approved" });
  }
  if (path.startsWith("/api/prescription/admin/") && denyAssignments) return send({ detail: "Admin assignment access expired." }, 403);
  if (path === "/api/prescription/admin/assignments/options/") {
    directoryRequests++;
    return send({ doctors, patients });
  }
  if (path === "/api/prescription/admin/assignments/") {
    if (request.method() === "POST") {
      creates++;
      assert.equal(request.headers()["x-csrftoken"], "test-csrf-token");
      const body = request.postDataJSON();
      assert.deepEqual(body, { doctor: 101, patient: 201, reason: "PP1 admin assigned visit", is_demo: true });
      if (failSave) return send({ detail: "Test assignment save failure." }, 500);
      const saved = { ...body, id: savedId, assigned_by: admin.id, doctor_name: doctors[0].display_name, patient_name: patients[0].display_name, started_at: "2026-10-12T08:30:00Z", created_at: "2026-10-12T08:30:00Z" };
      assignments = [saved, ...assignments];
      return send(saved, 201);
    }
    return send(assignments);
  }
  if (path === "/api/prescription/patients/") return send(patients.filter((patient) => assignments.some((item) => item.patient === patient.id && item.doctor === user?.id)));
  if (path === "/api/prescription/consultations/") return send(assignments.filter((item) => item.doctor === user?.id));
  if (["/api/prescription/analyses/", "/api/prescription/diagnoses/", "/api/prescription/patient-contexts/"].includes(path)) return send([]);
  throw new Error("Unmocked backend request: " + request.method() + " " + path);
});

async function visible(locator) { await locator.waitFor({ state: "visible" }); }
const submit = () => page.getByRole("button", { name: "Assign and create consultation", exact: true });
try {
  await page.goto(origin + "/admin/dashboard");
  await page.waitForURL(origin + "/login");
  await visible(page.getByRole("button", { name: "Sign In", exact: true }));
  assert.equal(directoryRequests, 0);
  console.log("PASS: forged admin localStorage cannot open the assignment form.");

  user = admin;
  await page.goto(origin + "/admin/dashboard");
  await visible(page.getByRole("heading", { name: "Assign patient to doctor" }));
  await page.getByLabel("Approved doctor", { exact: true }).selectOption("101");
  await page.getByLabel("Registered patient", { exact: true }).selectOption("201");
  assert.equal(await page.getByRole("checkbox", { name: "Synthetic research consultation" }).isChecked(), true);
  assert.equal(await submit().isDisabled(), true);
  await page.getByLabel("Visit reason", { exact: true }).fill("   ");
  assert.equal(await submit().isDisabled(), true);
  failSave = true;
  await page.getByLabel("Visit reason", { exact: true }).fill("  PP1 admin assigned visit  ");
  await submit().click();
  await visible(page.getByText("Test assignment save failure.", { exact: true }));
  assert.equal(await page.getByLabel("Visit reason", { exact: true }).inputValue(), "  PP1 admin assigned visit  ");
  assert.equal(assignments.length, 0);
  failSave = false;
  await submit().evaluate((button) => { button.click(); button.click(); });
  await visible(page.getByText("Consultation assigned successfully.", { exact: true }));
  assert.equal(creates, 2, "One failed request and one successful request; rapid clicks must not duplicate the assignment");
  assert.equal(assignments.length, 1);
  assert.equal(assignments[0].assigned_by, admin.id);
  assert.equal(await page.getByLabel("Visit reason", { exact: true }).inputValue(), "");
  assert.equal(await submit().isDisabled(), true);
  console.log("PASS: existing non-staff admin can assign a registered patient; failed saves and rapid clicks do not create false success or duplicate visits.");

  await page.reload();
  await visible(page.getByText(savedId, { exact: true }));
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.locator('#assignment-doctor option[value="103"]').waitFor({ state: "attached" });
  console.log("PASS: saved assignment survives refresh; doctor approvals remain protected by CSRF and automatically update available doctors.");

  user = doctor;
  await page.goto(origin + "/doctor/prescription-workspace");
  await page.getByLabel("Assigned registered patient").selectOption("201");
  await visible(page.getByTestId("consultation-id"));
  assert.equal(await page.getByTestId("consultation-id").textContent(), savedId);
  console.log("PASS: the assigned first visit becomes selectable in the selected doctor's workspace.");

  user = admin;
  await page.goto(origin + "/admin/dashboard");
  await visible(page.getByText(savedId, { exact: true }));
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "admin-assignment-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal(await page.locator("main").evaluate((element) => element.scrollWidth > element.clientWidth + 1), false);
  await page.screenshot({ path: join(artifacts, "admin-assignment-mobile.png"), fullPage: true });
  denyAssignments = true;
  await page.getByRole("button", { name: "Refresh doctors and patients", exact: true }).click();
  await visible(page.getByRole("link", { name: "Sign in with your admin account" }));
  assert.equal(await page.getByText(savedId, { exact: true }).count(), 0);
  assert.equal(await page.getByLabel("Approved doctor", { exact: true }).isDisabled(), true);
  assert.equal(await submit().isDisabled(), true);
  denyAssignments = false;
  await page.getByRole("button", { name: "Refresh doctors and patients", exact: true }).click();
  await visible(page.getByText(savedId, { exact: true }));
  assert.deepEqual(pageErrors, []);
  console.log("PASS: mobile layout, permission failures clear private assignment data, and retry restores permitted data.");
  console.log("Screenshots: " + artifacts);
} catch (error) {
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "admin-assignment-failure.png"), fullPage: true });
  console.error("Browser errors:", pageErrors);
  console.error("Visible page:", (await page.locator("body").innerText()).slice(0, 4500));
  throw error;
} finally {
  await browser.close();
}
