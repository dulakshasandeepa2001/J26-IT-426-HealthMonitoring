// Run: node tests/doctor-navigation.mjs
// Requires Playwright and Chromium; uses the already installed local browser when available.
// Existing task endpoints are mocked: this check never creates/deletes database records.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { chromium } from "playwright";

const origin = process.env.MEDITRACK_TEST_URL || "http://127.0.0.1:3000";
const artifacts = process.env.MEDITRACK_TEST_RESULTS_DIR || join(tmpdir(), "meditrack-doctor-navigation");
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, "ms-playwright");
  if (existsSync(cache)) {
    executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
      .sort((left, right) => Number(right.split("-")[1]) - Number(left.split("-")[1]))
      .map((name) => join(cache, name, "chrome-win64", "chrome.exe")).find(existsSync);
  }
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const requests = [];
let tasks = [];
await context.addInitScript(() => localStorage.setItem("meditrack_user", JSON.stringify({ role: "doctor", username: "navigation_preview", doctorID: "DOC-UI-PREVIEW" })));

await context.route(/\/get-tasks\/$/, async (route) => {
  const body = route.request().postDataJSON();
  requests.push({ endpoint: "get-tasks", body });
  await route.fulfill({ json: { tasks: tasks.filter((task) => task.task_date === body.task_date) } });
});
await context.route(/\/create-task\/$/, async (route) => {
  const body = route.request().postDataJSON();
  requests.push({ endpoint: "create-task", body });
  tasks = [{ ...body, task_id: 900001, is_completed: false }];
  await route.fulfill({ json: { message: "Mock schedule task created for UI verification" } });
});
await context.route(/\/delete-task\/\d+\/$/, async (route) => {
  requests.push({ endpoint: "delete-task", method: route.request().method(), url: route.request().url() });
  tasks = [];
  await route.fulfill({ json: { message: "Mock schedule task deleted" } });
});

async function visible(locator) { await locator.waitFor({ state: "visible" }); }
async function nav(label) { return page.locator("aside").getByRole("link", { name: label, exact: true }); }
async function navigate(label, path) {
  await (await nav(label)).click();
  await page.waitForURL(`${origin}${path}`);
  await visible(page.getByRole("heading", { name: label === "Dashboard" ? "Doctor Dashboard" : label, exact: true }));
  assert.equal(await (await nav(label)).getAttribute("aria-current"), "page");
  assert.equal(await page.locator("aside a[aria-current='page']").count(), 1);
}

try {
  const dashboard = await page.goto(`${origin}/doctor/dashboard`);
  assert.equal(dashboard.status(), 200);
  await visible(page.getByRole("heading", { name: "Doctor Dashboard" }));
  assert.equal(await page.locator("aside nav a").count(), 6);
  assert.equal(await page.locator("aside").getByRole("link", { name: /outbreak|symptom|matching|recovery|reminder|lab management|analytics/i }).count(), 0);
  await visible(page.getByText("Chief Consultation Complaint", { exact: true }));
  await visible(page.getByText("Lab Details & Clinical History", { exact: true }));
  await visible(page.getByText("Kasun Perera", { exact: true }).last());
  await page.getByLabel("Consultation notes").fill("UI regression note: remains available after navigation.");
  await page.getByLabel("Search prescription history").fill("Montelukast");
  assert.equal(await page.getByRole("button", { name: /^View sample prescription/ }).count(), 1);
  await page.getByRole("button", { name: "View sample prescription REC-0105" }).focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.getByRole("button", { name: "View sample prescription REC-0105" }).getAttribute("aria-expanded"), "true");
  await page.getByLabel("Search prescription history").fill("");
  await page.getByRole("button", { name: "Start Voice" }).click();
  await visible(page.getByText("Capturing Audio", { exact: true }));
  await page.getByRole("button", { name: "Listening..." }).click();
  await page.getByLabel("Consultation notes").fill("UI regression note: remains available after navigation.");
  await page.getByRole("button", { name: "Next Patient", exact: true }).click();
  await visible(page.getByRole("heading", { name: "Nimali Fernando", level: 2, exact: true }));
  assert.equal(await page.getByLabel("Consultation notes").inputValue(), "Listening for patient consultation notes...");
  await page.getByRole("button", { name: "Select sample patient Kasun Perera", exact: true }).click();
  await page.getByLabel("Consultation notes").fill("UI regression note: remains available after navigation.");

  await page.getByRole("button", { name: /^Schedule \(/ }).click();
  await visible(page.getByText("Doctor Schedule", { exact: true }));
  await page.getByLabel("Schedule date").fill("2026-10-08");
  await page.getByRole("button", { name: "New Task", exact: true }).click();
  await page.getByPlaceholder("e.g. Morning OPD Consultation").fill("Navigation verification session (mock)");
  await page.getByPlaceholder("Notes, clinic room number, or special instructions...").fill("UI regression only. No database writes.");
  await page.getByRole("button", { name: "Add to Schedule", exact: true }).click();
  await visible(page.getByText("Navigation verification session (mock)", { exact: true }));
  const created = requests.find((request) => request.endpoint === "create-task");
  assert.equal(created.body.doctor_id, "DOC-UI-PREVIEW");
  assert.equal(created.body.task_date, "2026-10-08");
  assert.equal(created.body.start_time, "09:00:00");
  assert.equal(created.body.end_time, "10:00:00");
  await page.getByTitle("Reload Tasks", { exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Delete Task", { exact: true }).click();
  await visible(page.getByText("No tasks on this date", { exact: true }));
  assert.equal(requests.find((request) => request.endpoint === "delete-task").method, "DELETE");
  console.log("PASS: overview data, patient queue, editable notes, sample voice toggle, searchable history and mocked schedule fetch/create/delete.");

  const destinations = [
    ["Prescription Workspace", "/doctor/prescription-workspace"],
    ["Prescription Records", "/doctor/prescription-records"],
    ["Patient Medication History", "/doctor/patient-medication-history"],
    ["Medicine Knowledge", "/doctor/medicine-knowledge"],
    ["Validation and Approval History", "/doctor/validation-approval-history"],
    ["Profile and Settings", "/doctor/profile-settings"],
    ["Dashboard", "/doctor/dashboard"],
  ];
  for (const [label, path] of destinations) {
    await navigate(label, path);
    const response = await context.request.get(`${origin}${path}`);
    assert.equal(response.status(), 200, path);
  }
  assert.equal(await page.getByLabel("Consultation notes").inputValue(), "UI regression note: remains available after navigation.");
  console.log("PASS: every destination returns HTTP 200, route activation is exclusive, overview patient and notes survive navigation.");

  await navigate("Patient Medication History", "/doctor/patient-medication-history");
  assert.equal(await page.getByLabel("Authorized patient", { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: /^View sample prescription/ }).count(), 0);
  await page.getByRole("button", { name: "Preview with existing sample patients" }).click();
  await visible(page.getByText("Penicillin", { exact: true }));
  await visible(page.getByText("Current medication list unavailable", { exact: true }));
  await page.getByLabel("Sample patient from overview").selectOption("PAT-102");
  await visible(page.getByText("Sulfa Drugs", { exact: true }));
  await page.getByLabel("Search prescription history").fill("Sinusitis");
  assert.equal(await page.getByRole("button", { name: /^View sample prescription/ }).count(), 1);

  await navigate("Prescription Workspace", "/doctor/prescription-workspace");
  assert.equal(await page.getByLabel("Authorized encounter", { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel("Diagnosis context", { exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole("checkbox", { name: "I confirm the diagnosis context for this authorized patient encounter." }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "Continue to ML suggestions", exact: true }).count(), 1);
  for (const label of ["Continue to ML suggestions", "Edit draft", "Revalidate edited version", "Reject", "Approve", "Publish Approved Version"]) {
    assert.equal(await page.getByRole("button", { name: label, exact: true }).isDisabled(), true);
  }
  assert.deepEqual(await page.getByRole("list", { name: "Prescription workflow" }).locator("li").allTextContents(), [
    "1Encounter and voice analysis", "2Confirm diagnosis context", "3Generate and screen candidates", "4Clinician review and approval", "5Publish approved version",
  ]);
  await visible(page.getByText("Structured voice-analysis result unavailable", { exact: true }));
  await visible(page.getByText("No generated draft available", { exact: true }));
  await visible(page.getByText("Safety checks have not run", { exact: true }));
  await visible(page.getByText("No eligible candidate ranking available", { exact: true }));
  await visible(page.getByText("Reviewed evidence unavailable", { exact: true }));
  await visible(page.getByText("Required inputs cannot be assessed yet", { exact: true }));
  assert.equal(await page.getByRole("button", { name: "Preview with existing sample patients" }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Review sample draft", exact: true }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "Add medicine", exact: true }).count(), 0);
  await page.getByText("Correction controls — available after generation", { exact: true }).click();
  assert.equal(await page.getByLabel("Doctor-proposed dose", { exact: true }).isDisabled(), true);
  assert.equal(await page.getByLabel("Doctor-proposed dose", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel("Diagnosis context", { exact: true }).inputValue(), "");
  assert.equal(await page.getByLabel(/weight/i).count(), 0);
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "prescription-workflow.png"), fullPage: true });
  console.log("PASS: encounter-linked structured analysis and diagnosis confirmation precede generation; missing services block generation and decisions; corrections follow a generated draft; dose stays clinician-entered; sample data cannot bypass the workflow.");

  await navigate("Dashboard", "/doctor/dashboard");
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: join(artifacts, "doctor-sidebar-expanded.png"), fullPage: true });
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Expand sidebar", exact: true }).getAttribute("aria-expanded"), "false");
  const compactLink = await nav("Validation and Approval History");
  await compactLink.hover();
  await visible(page.locator("[data-sidebar-tooltip]"));
  await compactLink.focus();
  await visible(page.locator("[data-sidebar-tooltip]"));
  await navigate("Prescription Records", "/doctor/prescription-records");
  await page.screenshot({ path: join(artifacts, "doctor-sidebar-compact.png"), fullPage: true });
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  console.log("PASS: expanded and compact navigation, accessible labels, hover/focus tooltips and compact active routes.");

  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/doctor/dashboard", "/doctor/prescription-workspace", "/doctor/patient-medication-history"]) {
      await page.goto(`${origin}${path}`);
      const overflow = await page.locator("main").evaluate((element) => element.scrollWidth > element.clientWidth + 1);
      assert.equal(overflow, false, `Content overflow at ${width}px: ${path}`);
    }
  }
  await page.getByRole("button", { name: "Open doctor navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Doctor navigation" });
  await visible(drawer);
  assert.equal(await page.getByRole("button", { name: "Open doctor navigation" }).getAttribute("aria-expanded"), "true");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "hidden");
  await page.screenshot({ path: join(artifacts, "doctor-sidebar-mobile.png"), fullPage: false });
  await page.getByRole("button", { name: "Close doctor navigation" }).focus();
  await page.keyboard.press("Shift+Tab");
  assert.equal(await drawer.evaluate((element) => element.contains(document.activeElement)), true);
  await page.keyboard.press("Escape");
  await drawer.waitFor({ state: "hidden" });
  assert.equal(await page.getByRole("button", { name: "Open doctor navigation" }).getAttribute("aria-expanded"), "false");
  assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  assert.equal(await page.getByRole("button", { name: "Open doctor navigation" }).evaluate((element) => element === document.activeElement), true);
  await page.getByRole("button", { name: "Open doctor navigation" }).click();
  await drawer.getByRole("link", { name: "Medicine Knowledge", exact: true }).click();
  await visible(page.getByRole("heading", { name: "Medicine Knowledge", exact: true }));
  assert.equal(await drawer.isVisible(), false);
  await page.getByRole("button", { name: "Open doctor navigation" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await drawer.waitFor({ state: "hidden" });
  assert.equal(await (await nav("Medicine Knowledge")).getAttribute("aria-current"), "page");
  console.log("PASS: desktop/tablet/phone layouts, mobile focus containment, Escape and focus return, drawer navigation and resize cleanup.");

  await page.goto(`${origin}/doctor/outbreak-radar`);
  assert.equal(await page.getByRole("navigation", { name: "Doctor navigation" }).count(), 0);
  await visible(page.getByRole("heading", { name: "Disease Trend & Regional Outbreak Surveillance" }));
  for (const path of ["/patient/dashboard", "/admin/dashboard", "/lab/dashboard"]) {
    const response = await context.request.get(`${origin}${path}`);
    assert.equal(response.status(), 200, path);
    assert.equal((await response.text()).includes('aria-label="Doctor navigation"'), false);
  }
  await page.goto(`${origin}/doctor/dashboard`);
  await page.locator("aside").getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL(`${origin}/login`);
  assert.equal(await page.evaluate(() => localStorage.getItem("meditrack_user")), null);
  assert.deepEqual(pageErrors, []);
  console.log("PASS: unrelated doctor page/other dashboards retain their layouts, logout removes the existing session, no browser runtime errors.");
} finally {
  await browser.close();
}
