# Step 15: cloud database latency during Preview

## Diagnosis

The 30-second browser deadline included a fresh `/session/` database lookup,
another cold database connection for the protected Preview request, and the
screening queries. Read-only live diagnostics observed a 21.89-second failed
connection attempt, a successful 8.919-second handshake, and 9.415 seconds for
just the five catalogue-definition queries. Individual SQL timeout limits do not
bound the sum of multiple sequential statements. These measurements explain why
a valid cloud request can exceed the previous browser deadline.

After the local connection-reuse change, a cold health request still failed after
21.47 seconds, the next connected in 15.60 seconds, and the following health
request succeeded in 3.39 seconds. Each health request runs a real `SELECT 1`.
These observations confirm continued external connection variability; they are
not a live-patient Preview benchmark or a guarantee of future response time.

## Changes

- Preview reuses the most recently fetched CSRF token in page memory, avoiding
  an unnecessary session/database request. Django still authenticates the request
  and validates CSRF. A specific CSRF rejection refreshes the token and retries
  the read-only Preview once. Authorization denials and other errors are not
  retried. Saved writes retain their fresh-token/idempotency behavior.
- The browser allows 75 seconds for Preview and shows a cloud-wait message after
  15 seconds. It still cancels hung requests, ignores stale results, and retains
  clinical entries. This is not a claim that the external database is always
  available or that every request will finish within that time.
- Transient Preview errors offer **Try preview again**, which preserves the
  clinical form, rather than reloading and replacing the entered assessment.
- Session/authentication database failures now return a safe, non-cacheable 503
  with Retry-After, including failures before the screening view is entered.
  No cached authorization or partial screening result is returned.
- PostgreSQL WSGI connections can be reused for 60 seconds with health checks.
  Host, port, credentials, database selection, TLS and connect timeout are unchanged.
- For this local development run, Django uses `--nothreading`. Django's threaded
  development server explicitly closes its database connections after requests,
  so it cannot benefit from connection reuse. The local serial setting avoids
  concurrent cold pooler handshakes. It is not a production serving strategy.

No clinical rule, medicine-review hash, patient record or model artifact changed.
Existing lock/statement/idle-transaction limits and deterministic blocks remain.

## Local backend command

From the repository root, in its own PowerShell terminal:

```powershell
$env:PRESCRIPTION_EXPERIMENTAL_ML_ENABLED = 'True'
.\.venv\Scripts\python.exe -u backend\manage.py runserver 127.0.0.1:8000 --noreload --nothreading
```

The feature flag remains restricted to the existing synthetic research workflow.
An unavailable Supabase service still requires network/service recovery; no SQLite
fallback, invented candidate or safety override is introduced.

## Verification

From `frontend`:

```powershell
node tests/preview-csrf.mjs
node tests/six-condition-workspace.mjs
node tests/doctor-review.mjs
node node_modules/typescript/bin/tsc --noEmit
```

From `backend`, using mocked or in-memory database tests:

```powershell
..\.venv\Scripts\python.exe -m unittest medicare_project.test_database
..\.venv\Scripts\python.exe manage.py test medicare_project.test_database_availability medicine_knowledge.test_patient_screening --settings=medicare_project.test_settings --noinput
```

The 14 configuration/diagnostic tests and 25 availability/screening tests pass.
Browser checks verify a valid held response after the old 30-second boundary,
slow-status feedback, the 75-second cancellation, preserved inputs, stale results,
all six conditions, explicit reviews and the complete ML/doctor-decision/print
flow. The CSRF check verifies reuse, token rotation, the one-retry limit,
authorization denial, unchanged write behavior and abort propagation.
