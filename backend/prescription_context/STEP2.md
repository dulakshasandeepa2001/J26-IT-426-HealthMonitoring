# Step 2: allergies, current medicines, and registered age

DOB comes from the patient's registration record (`accounts.User.birthday`).
The workspace displays that DOB and calculates completed years on the current
Sri Lankan calendar date. The doctor does not re-enter DOB or age. Missing or
future registration dates produce an unavailable age rather than an assumption.

## Doctor workflow

1. Sign in as the approved doctor and open **Prescription Workspace**.
2. Select an assigned registered patient and their saved consultation.
3. Under **Patient allergies and current medicines**, select the status for each:
   **Known**, **None reported**, or **Unknown / not established**.
4. For Known, enter one allergy or current medicine per line. Include allergy
   reactions or medicine strength/schedule if these are known. Unknown is the
   initial status; an empty list is not automatically treated as None.
5. Check **I reviewed allergies and current medicines with the patient for this
   visit**, then select **Save patient information**.
6. Refresh to verify the saved data. For a return visit, select **Start new
   consultation**: the patient's previous values remain filled, and the new visit
   needs a new review confirmation. Editing a field clears that checkbox.

Information is stored once per patient, independently of their individual visits.
Each save also records the doctor, consultation, time, before/after values, and
changed fields in the existing revision table. A review without changes still
records that the information was checked for that visit.

Saving a new prescription does not automatically add it to current medicines.
Current medicines remain information the doctor checks with the patient.

## Age and weight scope

There is no weight input in this form and weight is not required to save allergies
or current medicines. Existing stored weight data is preserved. The general
"weight missing" blocker has been removed from the workspace.

This does not mean weight is unnecessary for every later dose rule. For example,
the [official TAMIFLU prescribing information on DailyMed](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b)
uses body weight for pediatric dosing. When such rules are implemented, they must
require the relevant measured input before validating a dose. Age in completed
years is currently a display value; DOB remains available for more precise age
checks. Prescription generation and dose validation are not enabled in Step 2.

The registration record is the authoritative DOB source in API responses. A
registered DOB is copied into the context cache during save when it is available;
legacy cached DOBs are not substituted for a missing registered DOB.

## API

`POST /api/prescription/consultations/<consultation-uuid>/patient-context/`

```json
{
  "allergy_status": "none",
  "allergies": [],
  "medicine_status": "unknown",
  "current_medicines": [],
  "reviewed": true,
  "expected_updated_at": null
}
```

Use the latest context's exact `updated_at` value for `expected_updated_at` when
one already exists, or null only for the first entry. `confirmed` means Known and
requires a non-empty list. `none` and `unknown` require empty lists. Items are
trimmed and duplicates removed; each list supports up to 50 entries of 200
characters each. Only the doctor who owns the encounter may write. The patient,
doctor, DOB and review metadata are derived by the backend, not accepted from the
form. Session cookies and a fresh `X-CSRFToken` are required.

Writes are atomic and lock the patient row. If another authorized doctor or tab
has changed the saved context, the endpoint returns HTTP 409 and preserves the
newer information. Refresh and review it before trying to save again. History
write failure also rolls back the patient context change.

## Verification

Run the isolated backend tests from `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context --settings=medicare_project.test_settings --noinput
```

From `frontend`, with the local Next server running:

```powershell
node tests/prescription-encounters.mjs
node tests/admin-assignments.mjs
```

Backend tests use SQLite in memory. Browser checks intercept all backend requests
and never write real patient data. They cover registered DOB/age, first entry,
repeat-visit prefill and confirmation, status handling, stale changes, permissions,
CSRF, audit rollback and desktop/mobile layout. No live migration is required.

Component 1 JSON import, medicine normalization and prescription safety/ranking
remain later integration steps.
