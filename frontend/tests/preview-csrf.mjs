// The real shared API helper, with fetch replaced; no HTTP or patient records.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(name) {
  const source = readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from ["']\.\/([^"']+)["']/g, (_, dependency) => `from '${moduleUrl(dependency)}'`);
  return 'data:text/javascript;base64,' + Buffer.from(js).toString('base64');
}
const { apiRequest, getSession, ApiError } = await import(moduleUrl('api'));
const originalFetch = globalThis.fetch;
let calls = [], replies = [];
globalThis.fetch = async (url, options) => {
  calls.push({ path: new URL(url).pathname, options });
  if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const next = replies.shift();
  assert.ok(next, 'Unexpected network call');
  return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
};
const preview = '/api/prescription/consultations/fictional/clinical-screening/preview/';
const post = { method: 'POST', body: '{}' };
try {
  replies = [{ body: { user: { role: 'doctor' }, csrfToken: 'first-token' } }];
  await getSession();
  calls = []; replies = [{ body: { checked: true } }];
  assert.deepEqual(await apiRequest(preview, post, 'reuse'), { checked: true });
  assert.deepEqual(calls.map((c) => c.path), [preview], 'Preview avoids a redundant cold session lookup');
  assert.equal(calls[0].options.headers.get('X-CSRFToken'), 'first-token');
  assert.equal(calls[0].options.credentials, 'include', 'Server session authentication remains enabled');

  calls = []; replies = [{ status: 403, body: { detail: 'CSRF Failed: token rotated.' } },
    { body: { user: { role: 'doctor' }, csrfToken: 'rotated-token' } }, { body: { checked: true } }];
  await apiRequest(preview, post, 'reuse');
  assert.deepEqual(calls.map((c) => c.path), [preview, '/session/', preview]);
  assert.equal(calls[2].options.headers.get('X-CSRFToken'), 'rotated-token');

  calls = []; replies = [{ status: 403, body: { detail: 'Doctor access revoked.' } }];
  await assert.rejects(apiRequest(preview, post, 'reuse'), (error) => error instanceof ApiError && error.status === 403);
  assert.equal(calls.length, 1, 'Authorization denial is never retried as a token problem');

  calls = []; replies = [{ body: { csrfToken: 'fresh-write-token', user: { role: 'doctor' } } }, { status: 503, body: { detail: 'Database unavailable.' } }];
  await assert.rejects(apiRequest('/api/prescription/consultations/fictional/patient-context/', post), /Database unavailable/);
  assert.deepEqual(calls.map((c) => c.path), ['/session/', '/api/prescription/consultations/fictional/patient-context/'], 'Writes retain fresh-token behavior and are not automatically replayed');

  const decision = '/api/prescription/medicine-proposals/fictional/decisions/';
  const keyedWrite = { method: 'POST', body: JSON.stringify({ request_key: 'fictional-idempotency-key' }) };
  calls = []; replies = [{ body: { saved: true } }];
  await apiRequest(decision, keyedWrite, 'reuse');
  assert.deepEqual(calls.map((c) => c.path), [decision], 'Explicit request-key writes avoid a redundant session lookup');
  calls = []; replies = [{ status: 403, body: { detail: 'CSRF Failed: token rotated.' } }, { body: { csrfToken: 'new-write-token' } }, { body: { saved: true } }];
  await apiRequest(decision, keyedWrite, 'reuse');
  assert.deepEqual(calls.map((c) => c.path), [decision, '/session/', decision]);
  assert.equal(calls[0].options.body, calls[2].options.body, 'CSRF rotation preserves the request key and entire original body');
  calls = []; replies = [{ status: 503, body: { detail: 'Database unavailable.' } }];
  await assert.rejects(apiRequest(decision, keyedWrite, 'reuse'), /Database unavailable/);
  assert.equal(calls.length, 1, 'An ambiguous write failure never replays automatically');

  calls = []; replies = [{ status: 403, body: { detail: 'CSRF Failed: token rotated.' } }, { body: { csrfToken: 'still-invalid' } }, { status: 403, body: { detail: 'CSRF Failed: still invalid.' } }];
  await assert.rejects(apiRequest(preview, post, 'reuse'), (error) => error instanceof ApiError && error.status === 403);
  assert.equal(calls.length, 3, 'A rotated token is refreshed at most once');

  const controller = new AbortController(); controller.abort();
  calls = []; replies = [];
  await assert.rejects(getSession({ signal: controller.signal }), (error) => error.name === 'AbortError');
  assert.equal(calls[0].options.signal, controller.signal, 'Cancellation reaches the session lookup too');
  console.log('PASS: preview token reuse, fresh-session avoidance, rotation recovery, one-retry limit, authorization denial, write semantics and cancellation.');
} finally { globalThis.fetch = originalFetch; }
