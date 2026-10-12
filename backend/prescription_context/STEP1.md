# Step 1: registered patients and saved visits

An approved doctor can select an assigned registered patient, open a saved visit,
and create another consultation for that patient. Every consultation receives a
server-generated UUID and timestamp. The patient's `accounts.User.id` remains
the same across visits. Existing patient context is read by patient ID and is not
copied, cleared, or changed when a new consultation is created.

## First appointment while Component 1 is unfinished

Use an existing registered test patient and approved doctor. Do not use the
doctor dashboard's sample queue as real registered patients.

1. Sign into `http://localhost:3000/login` using your existing active, approved
   MediTrack admin account (`role='admin'`). A Django staff account is not required.
2. In **Admin Dashboard**, find **Assign patient to doctor**.
3. Choose **Approved doctor** and **Registered patient**, enter **Visit reason**,
   leave **PP1 demo encounter** checked for the demonstration, and select
   **Assign and create consultation**. The saved ID and latest assignments appear
   below. The server records your logged-in admin account as the assigner.
4. Log out of the admin dashboard, then sign into `http://localhost:3000/login`
   with that doctor account. Open **Prescription Workspace** and select the
   assigned patient.
5. The assigned first visit can be opened immediately. For a later visit, enter
   **Reason for visit** and select **Start new consultation**.
6. Refresh the workspace: the selected saved visit is restored. Select another
   patient to see only that patient's visits.

If the doctor is still pending approval, approve their registration in the same
admin dashboard. The doctor selection then refreshes automatically. After a new
patient registers, use **Refresh doctors and patients** to update the choices.
Each assignment creates a new visit; an existing patient's medical context is
preserved. Neither the admin nor the browser can replace an existing visit's ID.

The original Django admin form at `http://localhost:8000/admin/` remains an
optional alternative for users who already have Django staff access.

Alternatively, from `backend`, assign the first encounter with existing numeric
`accounts.User.id` values. Replace the example IDs with your own; `doctorID`
such as `DOC-0001` is a display identifier and is not used here.

```powershell
..\.venv\Scripts\python.exe manage.py assign_consultation --doctor-id 12 --patient-id 23 --assigned-by 1 --reason "PP1 first appointment" --demo
```

The command validates the roles and active/approved accounts, records the admin
or staff assigner, and creates only one consultation. It does not create accounts,
allergy records, medicines, diagnoses, or voice-analysis data. Each invocation represents
a separate appointment; do not rerun it merely to refresh the browser.

Once Component 1 is ready, its trusted backend appointment flow should create
the same consultation link using the authenticated/authorized doctor, registered
patient ID, reason, assignment actor, and appropriate demo status. The integration
contract and analysis import will be implemented separately; this is a temporary
manual assignment workflow, not a simulated prediction service.

## API and access rules

- `GET /session/` returns the current server session and a CSRF token.
- `POST /login/` creates a Django session; `POST /logout/` ends it. Both require
  an `X-CSRFToken` obtained from `/session/` with cookies enabled.
- `GET /api/prescription/admin/assignments/options/` returns active, approved
  registered doctors and patients for an authenticated approved admin.
- `POST /api/prescription/admin/assignments/` accepts
  `{ "doctor": 12, "patient": 23, "reason": "PP1 first visit", "is_demo": true }`.
  The authenticated admin is always the assigner. This does not require or grant
  Django staff privileges. `GET` on the same endpoint returns the latest 10
  assignments, including their saved consultation IDs.
- `GET /api/prescription/patients/` returns only active, approved patients with
  a consultation assigned to the authenticated doctor.
- `GET /api/prescription/consultations/` returns only that doctor's consultations.
  `?patient=<id>` narrows this scope and cannot grant access to another doctor.
- `POST /api/prescription/consultations/` accepts `{ "patient": 23, "reason": "Follow-up visit" }`.
  The patient must already be assigned to the doctor. Identity, doctor, timestamp,
  and demo status are set by the server. Demo status follows the latest assigned
  encounter. A new visit does not inherit its analysis or confirmed diagnosis.
- Analyses, context, revisions, and diagnoses are also scoped to the doctor.
  The general context, analysis and revision endpoints remain read-only.
  [Step 2](STEP2.md) adds an authenticated, encounter-specific patient context
  review/save action. Consultation records cannot be reassigned or deleted.

Use the same hostname for frontend and backend (`localhost` with `localhost`, or
`127.0.0.1` with `127.0.0.1`) so browser SameSite session cookies work. If setting
`NEXT_PUBLIC_API_URL`, use the matching backend host. The default API helper
matches the frontend hostname automatically. Existing sessions stored only in
localStorage must sign in again; localStorage supplies display details only.

The session and role checks protect the prescription API and the existing admin
doctor approval/rejection endpoints. The other components' remaining account and
scheduling endpoints need their own authorization review when they are integrated.

## Verification

Backend integration tests use SQLite in memory, never Supabase or `db.sqlite3`:

```powershell
# From backend
..\.venv\Scripts\python.exe manage.py test prescription_context --settings=medicare_project.test_settings --noinput
```

The browser workflow checks use Playwright/Chromium and an already running local
Next dev server. All backend requests are intercepted; their fixtures are not saved
to the real database:

```powershell
# From frontend, with the existing local Playwright installation
node tests/prescription-encounters.mjs
node tests/admin-assignments.mjs
# If your dev server uses a different origin:
$env:MEDITRACK_TEST_URL = "http://127.0.0.1:3000"
node tests/prescription-encounters.mjs
```

No live migration is needed: Step 1 uses the existing prescription tables. The
UUID and timestamp defaults execute in Python. No live patient/demo records are
inserted as part of automated verification.

Manual allergy/current medicine entry and per-visit confirmation are now available
in [Step 2](STEP2.md), with DOB and age loaded from registration.
Draft generation, safety checks, persisted approval and publication remain
unavailable until their later implementation steps.
