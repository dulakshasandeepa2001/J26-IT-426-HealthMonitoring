// Frozen source definitions and mocked doctor reviews. No live HTTP writes.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.MEDITRACK_TEST_URL || 'http://127.0.0.1:3000';
const interpreter = fileURLToPath(new URL('../../.venv/Scripts/python.exe', import.meta.url));
const py = spawnSync(interpreter, ['-c', `
import os,json
os.environ['DJANGO_SETTINGS_MODULE']='medicare_project.test_settings'
import django
django.setup()
from medicine_knowledge.condition_knowledge import definitions
pending={'status':'pending','is_current':False,'reason':'This condition scope has not been reviewed.','reviewer_name':None,'reviewed_at':None,'notes':''}
print(json.dumps([dict(d,updated_at='2026-10-16T09:00:00Z',content_review=pending,safety_review=pending,live_screening_enabled=False) for d in definitions()]))
`], { cwd: fileURLToPath(new URL('../../backend/', import.meta.url)), encoding: 'utf8' });
assert.equal(py.status, 0, py.stderr);
let scopes = JSON.parse(py.stdout);
const contents = JSON.parse(readFileSync(new URL('../../backend/medicine_knowledge/data/pilot_catalogue.json', import.meta.url), 'utf8'));
const rules = JSON.parse(readFileSync(new URL('../../backend/prescription_drafts/data/safety_profiles.json', import.meta.url), 'utf8'));
const doctor = { id: 101, role: 'doctor', username: 'knowledge_browser_test', doctorID: 'TEST' };
const entries = contents.map((content, i) => ({ id: content.id, content, content_hash: String(i + 1).repeat(64), review_is_current: true, review_status: 'reviewed',
  reviewed_by: doctor.id, reviewer_name: doctor.username, reviewed_at: '2026-10-16T08:00:00Z', updated_at: '2026-10-16T08:00:00Z', review_notes: 'Previously inspected unchanged pilot content.' }));
const profiles = entries.map((entry) => ({ medicine: entry.id, generic_name: entry.content.generic_name, content: rules[entry.id],
  content_hash: 'a'.repeat(64), medicine_content_hash: entry.content_hash, review_is_current: true, review_status: 'reviewed', catalogue_review_current: true,
  reviewer_name: doctor.username, reviewed_at: entry.reviewed_at, review_notes: 'Previously inspected unchanged safety rules.', updated_at: entry.updated_at,
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
let fail = 0, denied = false, unavailable = false;
page.on('pageerror', (error) => errors.push(error.message));
await context.route(/^http:\/\/(?:localhost|127\.0\.0\.1):8000\//, async (route) => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname;
  const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type,x-csrftoken', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
  const send = (json, status = 200) => route.fulfill({ json, status, headers });
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
  if (path === '/session/') return send({ user: doctor, csrfToken: 'knowledge-test-csrf' });
  if (path === '/api/prescription/medicines/') return send(entries);
  if (path === '/api/prescription/safety-profiles/') return send(profiles.filter((row) => !url.searchParams.has('medicine') || row.medicine === url.searchParams.get('medicine')));
  if (path === '/api/prescription/condition-knowledge/') return denied ? send({ detail: 'Test approval revoked.' }, 403) : unavailable ? send({ detail: 'Unavailable' }, 503) : send(scopes);
  const review = path.match(/^\/api\/prescription\/condition-knowledge\/([^/]+)\/review\/(content|safety)\/$/);
  if (review) {
    assert.equal(request.method(), 'POST'); assert.equal(request.headers()['x-csrftoken'], 'knowledge-test-csrf');
    const body = request.postDataJSON(); writes.push({ id: review[1], kind: review[2], body });
    assert.deepEqual(Object.keys(body).sort(), ['decision', 'evidence_checked', 'expected_content_hash', 'expected_updated_at', 'notes']);
    const scope = scopes.find((row) => row.id === review[1]);
    assert.equal(body.expected_content_hash, review[2] === 'content' ? scope.content_hash : scope.rules_hash);
    assert.equal(body.expected_updated_at, scope.updated_at);
    if (fail) return send({ detail: 'Test review save failed.' }, fail);
    if (body.decision === 'reviewed') { assert.equal(body.evidence_checked, true); assert.ok(review[2] !== 'safety' || scope.content.identity_status !== 'unresolved'); }
    const saved = { ...scope, updated_at: `2026-10-16T09:10:${String(writes.length).padStart(2, '0')}Z`,
      [review[2] + '_review']: { status: body.decision, is_current: body.decision === 'reviewed', reason: null,
        reviewer_name: doctor.username, reviewed_at: '2026-10-16T09:10:00Z', notes: body.notes } };
    scopes = scopes.map((row) => row.id === saved.id ? saved : row); return send(saved);
  }
  throw new Error('Unexpected HTTP call: ' + request.method() + ' ' + path);
});
const visible = (locator) => locator.waitFor({ state: 'visible' });
const catalogue = () => page.getByRole('region', { name: 'Medicine catalogue', exact: true });
const pick = (name) => catalogue().getByRole('button', { name: new RegExp('^' + name) }).click();
const scopePanel = () => page.getByRole('region', { name: 'Additional condition knowledge', exact: true });
const reviewPanel = (kind, condition) => scopePanel().getByRole('region', { name: `${kind} for ${condition}`, exact: true });
const reviewedTotal = () => page.getByRole('region', { name: 'Catalogue coverage', exact: true }).getByText('Content reviewed', { exact: true }).locator('..').locator('p').last();
async function saveReview(kind, condition) {
  const panel = reviewPanel(kind, condition);
  await panel.getByRole('textbox', { name: kind + ' notes', exact: true }).fill('Inspected product, condition evidence and source-linked rules.');
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Save ' + kind.toLowerCase(), exact: true }).click();
  await visible(panel.getByRole('heading', { name: kind + ' · Completed for this version', exact: true }));
}
try {
  await page.goto(origin + '/doctor/medicine-knowledge'); await visible(catalogue());
  assert.equal(await catalogue().getByRole('button').count(), 6);
  assert.equal(await reviewedTotal().textContent(), '4');
  await pick('Paracetamol');
  assert.equal(await page.getByRole('navigation', { name: 'Medicine review steps', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Save content review', exact: true }).count(), 2, 'Only the two new scopes have content forms');
  const base = scopePanel().getByRole('article', { name: / medicine knowledge$/ });
  const reviewedBadgeColor = await base.getByText('Content reviewed', { exact: true }).evaluate((node) => getComputedStyle(node).backgroundColor);
  assert.equal(await page.getByRole('region', { name: 'Additional condition knowledge', exact: true }).count(), 1);
  assert.equal(await page.getByRole('region', { name: 'Evidence and content review', exact: true }).count(), 0);
  await visible(base.getByRole('heading', { name: 'Content review · Completed for this version', exact: true }));
  await visible(base.getByRole('heading', { name: 'Safety rule review · Completed for this version', exact: true }));
  assert.equal(await base.getByRole('button', { name: 'Save content review', exact: true }).count(), 0);
  assert.equal(await base.getByRole('button', { name: 'Save safety rule review', exact: true }).count(), 0);
  assert.equal(writes.length, 0, 'Current reviews are reused without new POSTs');
  const filters = [['influenza', 2], ['chickenpox', 3], ['measles', 1], ['mumps', 1], ['viral_conjunctivitis', 1], ['viral_gastroenteritis', 1]];
  for (const [code, count] of filters) {
    await page.getByLabel('Condition filter', { exact: true }).selectOption(code);
    assert.equal(await catalogue().getByRole('button').count(), count);
  }
  await page.getByLabel('Condition filter', { exact: true }).selectOption('measles');
  await page.getByLabel('Review status filter', { exact: true }).selectOption('reviewed');
  await visible(page.getByText('No medicines match these filters.', { exact: true }));
  await page.getByLabel('Review status filter', { exact: true }).selectOption('all');
  await saveReview('Content review', 'Measles'); await saveReview('Safety rule review', 'Measles');
  assert.equal(await reviewedTotal().textContent(), '4', 'Shared Paracetamol counts once across scopes and pilot content');
  assert.equal(writes.length, 2);
  await page.getByLabel('Condition filter', { exact: true }).selectOption('mumps');
  await page.getByLabel('Condition filter', { exact: true }).selectOption('measles');
  assert.equal(await scopePanel().getByRole('button', { name: /^Save / }).count(), 0);
  await page.reload(); await visible(catalogue());
  await page.getByLabel('Condition filter', { exact: true }).selectOption('measles');
  await visible(reviewPanel('Safety rule review', 'Measles').getByText('The saved review is current. No repeat review is required.', { exact: true }));
  assert.equal(await scopePanel().getByRole('button', { name: /^Save / }).count(), 0);
  assert.equal(writes.length, 2);
  await page.getByLabel('Condition filter', { exact: true }).selectOption('mumps');
  fail = 500;
  const mumpsContent = reviewPanel('Content review', 'Mumps');
  assert.equal(await catalogue().getByRole('button').getByText('Content reviewed', { exact: true }).count(), 0, 'A pilot review does not clear a different condition scope');
  await mumpsContent.getByRole('textbox').fill('Preserve these notes after a failed request.');
  await mumpsContent.getByRole('checkbox').check();
  await mumpsContent.getByRole('button', { name: 'Save content review', exact: true }).click();
  await visible(mumpsContent.getByRole('alert'));
  assert.equal(await reviewedTotal().textContent(), '4', 'Failed review writes do not change coverage');
  assert.equal(await mumpsContent.getByRole('textbox').inputValue(), 'Preserve these notes after a failed request.');
  fail = 0; await mumpsContent.getByRole('button', { name: 'Save content review', exact: true }).click();
  await visible(mumpsContent.getByRole('heading', { name: 'Content review · Completed for this version', exact: true }));
  await page.getByLabel('Condition filter', { exact: true }).selectOption('viral_conjunctivitis');
  await visible(scopePanel().getByText(/RxCUI 1188426/));
  assert.match(await scopePanel().textContent(), /ophthalmic/);
  await visible(catalogue().getByRole('button').getByText('Pending review', { exact: true }));
  await visible(scopePanel().getByText('Pending review', { exact: true }));
  await saveReview('Content review', 'Viral conjunctivitis');
  const eyeListBadge = () => catalogue().getByRole('button').getByText('Content reviewed', { exact: true });
  const eyeDetailBadge = () => scopePanel().getByText('Content reviewed', { exact: true });
  await visible(eyeListBadge()); await visible(eyeDetailBadge());
  assert.equal(await eyeListBadge().evaluate((node) => getComputedStyle(node).backgroundColor), reviewedBadgeColor, 'Additional medicine uses the same green badge as pilot medicines');
  assert.equal(await reviewedTotal().textContent(), '5', 'A newly reviewed additional medicine updates the total immediately');
  await page.reload(); await visible(catalogue());
  assert.equal(await reviewedTotal().textContent(), '5', 'The saved total survives refresh');
  await page.getByLabel('Condition filter', { exact: true }).selectOption('viral_conjunctivitis');
  await visible(eyeListBadge()); await visible(eyeDetailBadge());
  await saveReview('Safety rule review', 'Viral conjunctivitis');
  assert.equal(await reviewedTotal().textContent(), '5', 'Safety review does not inflate the content count');
  const eyeContent = reviewPanel('Content review', 'Viral conjunctivitis');
  await eyeContent.getByRole('button', { name: 'Change content review', exact: true }).click();
  await eyeContent.getByRole('combobox').selectOption('rejected');
  await eyeContent.getByRole('textbox').fill('This test-only content decision needs correction.');
  await eyeContent.getByRole('button', { name: 'Save content review', exact: true }).click();
  await visible(eyeContent.getByRole('heading', { name: 'Content review · Rejected', exact: true }));
  assert.equal(await reviewedTotal().textContent(), '4', 'Rejected content is removed from the total');
  await visible(catalogue().getByRole('button').getByText('Rejected', { exact: true }));
  await visible(scopePanel().getByRole('heading', { level: 3 }).locator('..').getByText('Rejected', { exact: true }));
  scopes = scopes.map((row) => row.condition === 'viral_conjunctivitis' ? { ...row, content_review: { ...row.content_review, status: 'reviewed', is_current: false } } : row);
  await page.getByRole('button', { name: 'Refresh catalogue', exact: true }).click();
  await visible(catalogue().getByRole('button').getByText('Pending review', { exact: true }));
  await visible(scopePanel().getByText('Pending review', { exact: true }));
  assert.equal(await eyeListBadge().count(), 0, 'Outdated review is not shown as current');
  await page.getByLabel('Condition filter', { exact: true }).selectOption('viral_gastroenteritis');
  const orsSafety = reviewPanel('Safety rule review', 'Viral gastroenteritis');
  assert.equal(await orsSafety.getByRole('combobox').inputValue(), 'pending');
  assert.equal(await orsSafety.getByRole('combobox').locator('option[value="reviewed"]').count(), 0);
  await orsSafety.getByRole('textbox').fill('Exact commercial ORS identity still needs resolution.');
  await orsSafety.getByRole('button', { name: 'Save safety rule review', exact: true }).click();
  await visible(page.getByRole('status').filter({ hasText: 'Review saved for Viral gastroenteritis' }));
  assert.equal(writes.at(-1).body.decision, 'pending');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator('main').evaluate((node) => node.scrollWidth > node.clientWidth + 1), false);
  }
  denied = true; await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await visible(page.getByText('Test approval revoked.', { exact: true }));
  assert.equal(await catalogue().count(), 0); assert.equal(await scopePanel().count(), 0);
  denied = false; unavailable = true; await page.getByRole('button', { name: 'Refresh catalogue' }).click();
  await visible(catalogue());
  await visible(page.getByText(/Additional condition knowledge could not be loaded/));
  assert.equal(await reviewedTotal().textContent(), 'Unavailable', 'Unavailable scope data must not appear as a complete pilot-only total');
  assert.equal(await catalogue().getByRole('button').count(), 0, 'Gastroenteritis filter must not invent ORS while its source API is unavailable');
  assert.deepEqual(errors, []);
  console.log('PASS: six conditions, six identities, completed review reuse, scope isolation, genuine review persistence, failure recovery, ORS block, mobile and revoked access.');
} finally { await browser.close(); }
