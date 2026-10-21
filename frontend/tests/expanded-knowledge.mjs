// Expanded source definitions, mocked HTTP only; no live patient data or review writes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://127.0.0.1:3000';
const py = spawnSync(fileURLToPath(new URL('../../.venv/Scripts/python.exe', import.meta.url)), ['-c', `
import os,json
os.environ['DJANGO_SETTINGS_MODULE']='medicare_project.test_settings'
import django; django.setup()
from medicine_knowledge.condition_knowledge import definitions
from medicine_knowledge.additional_candidates import additional_definitions
pending={'status':'pending','is_current':False,'reason':'Not reviewed.','reviewer_name':None,'reviewed_at':None,'notes':''}
print(json.dumps([dict(d,updated_at='2026-10-16T09:00:00Z',content_review=pending,safety_review=pending,live_screening_enabled=False) for d in definitions()+additional_definitions()]))
`], { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), encoding: 'utf8' });
assert.equal(py.status, 0, py.stderr);
const scopes = JSON.parse(py.stdout);
const contents = JSON.parse(readFileSync(new URL('../../backend/medicine_knowledge/data/pilot_catalogue.json', import.meta.url), 'utf8'));
const rules = JSON.parse(readFileSync(new URL('../../backend/prescription_drafts/data/safety_profiles.json', import.meta.url), 'utf8'));
const doctor = { id: 101, role: 'doctor', username: 'synthetic_catalogue_test', doctorID: 'TEST' };
const entries = contents.map((content, i) => ({ id: content.id, content, content_hash: String(i + 1).repeat(64), review_is_current: true, review_status: 'reviewed',
  reviewer_name: doctor.username, reviewed_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T08:00:00Z', review_notes: 'Mocked existing current review.' }));
const profiles = entries.map((entry) => ({ medicine: entry.id, generic_name: entry.content.generic_name, content: rules[entry.id],
  content_hash: 'a'.repeat(64), medicine_content_hash: entry.content_hash, review_is_current: true, review_status: 'reviewed', catalogue_review_current: true,
  reviewer_name: doctor.username, reviewed_at: entry.reviewed_at, review_notes: entry.review_notes, updated_at: entry.updated_at,
  sources: entry.content.sources.filter((source) => rules[entry.id].source_ids.includes(source.id)), product: entry.content, conditions: entry.content.uses.map((use) => use.condition) }));
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath && !existsSync(chromium.executablePath()) && process.env.LOCALAPPDATA) {
  const cache = join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (existsSync(cache)) executablePath = readdirSync(cache).filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((name) => join(cache, name, 'chrome-win64', 'chrome.exe')).find(existsSync);
}
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage(), errors = [], writes = [];
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url());
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (request.method() !== 'GET') { writes.push(request.url()); throw new Error('Unexpected write'); }
  const send = (json) => route.fulfill({ json, headers });
  if (url.pathname === '/session/') return send({ user: doctor, csrfToken: 'mock-csrf' });
  if (url.pathname === '/api/prescription/medicines/') return send(entries);
  if (url.pathname === '/api/prescription/condition-knowledge/') return send(scopes);
  if (url.pathname === '/api/prescription/safety-profiles/') return send(profiles.filter((row) => !url.searchParams.has('medicine') || row.medicine === url.searchParams.get('medicine')));
  throw new Error('Unexpected request: ' + url.pathname);
});
const catalogue = () => page.getByRole('region', { name: 'Medicine catalogue', exact: true });
const panel = () => page.getByRole('region', { name: 'Additional condition knowledge', exact: true });
const pick = (name) => catalogue().getByRole('button', { name: new RegExp('^' + name) }).click();
try {
  await page.goto(origin + '/doctor/medicine-knowledge');
  await catalogue().waitFor({ state: 'visible' });
  assert.equal(await catalogue().getByRole('button').count(), 16);
  for (const [condition, count] of [['influenza', 5], ['chickenpox', 4], ['measles', 2], ['mumps', 2], ['viral_conjunctivitis', 2], ['viral_gastroenteritis', 4]]) {
    await page.getByLabel('Condition filter', { exact: true }).selectOption(condition);
    assert.equal(await catalogue().getByRole('button').count(), count, condition);
  }
  await page.getByLabel('Condition filter', { exact: true }).selectOption('all');
  for (const name of ['Zanamivir', 'Peramivir', 'Baloxavir', 'Valacyclovir', 'Vitamin A', 'Loperamide', 'Bismuth', 'Zinc', 'Oral rehydration']) {
    await pick(name);
    const safety = panel().getByRole('region', { name: /^Safety rule review for / });
    assert.equal(await safety.getByRole('combobox').inputValue(), 'reviewed', name);
    assert.equal(await safety.locator('option[value="reviewed"]').count(), 1, name);
    assert.match(await safety.locator('option[value="reviewed"]').textContent(), /Reference safety scope reviewed/);
    assert.equal(await safety.getByRole('button', { name: 'Save safety rule review', exact: true }).isDisabled(), true);
    await panel().getByText(/Exact product identity or executable rule coverage is incomplete/).waitFor({ state: 'visible' });
  }
  await pick('Hypromellose');
  await panel().getByText(/NDC 72094-001-03.*No verified RxNorm concept/).waitFor({ state: 'visible' });
  assert.equal(await panel().getByRole('combobox').last().locator('option[value="reviewed"]').count(), 1);
  await pick('Ibuprofen');
  await panel().getByText(/RxCUI 310965/).waitFor({ state: 'visible' });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('main').evaluate((node) => node.scrollWidth > node.clientWidth + 1), false);
  }
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  console.log('PASS: 16 identities, 19 condition mappings, nine incomplete safety blocks, NDC-only product, desktop/mobile, no writes.');
} finally { await browser.close(); }
