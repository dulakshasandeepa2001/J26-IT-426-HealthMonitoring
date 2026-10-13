# Step 4: Component 1 JSON handoff

The supplied influenza and chickenpox examples are bundled in
`prescription_context/samples/influenza_demo.json` and
`prescription_context/samples/chickenpox_demo.json`. The original Downloads files
are not needed at runtime. Their scores remain fixed sample values, not measured
model performance or confirmed diagnoses.

## PP1 demo

1. Use the existing admin dashboard to assign an approved doctor and registered
   test patient. Keep **PP1 demo encounter** checked.
2. Sign in as that doctor and open **Prescription Workspace**. Select the patient
   and the saved demo consultation.
3. Under **Structured voice-analysis result**, choose **Demo analysis scenario**
   (Influenza or Chickenpox), then select **Load demo analysis**.
4. The backend replaces the template's zero patient/consultation placeholders
   with this registered patient ID and consultation UUID. It gives the reference
   a consultation-specific suffix and saves the linked analysis in the existing
   analysis table. The bundled sample file itself is not modified.
5. Review the displayed symptoms, condition candidates, reported severity and
   synthetic sample score. The suggested diagnosis is prefilled but unconfirmed.
6. Correct the diagnosis if necessary, then explicitly confirm it. The doctor
   confirmation is stored separately with the current analysis reference.
7. To demonstrate the other disease, create/select another demo visit. Each visit
   keeps its own immutable analysis; changing the scenario cannot overwrite it.

Allergies, current medicines, registered DOB and age remain the Step 2 data. No
analysis import writes or infers those fields. Prescription generation, medicine
ranking, safety checks and approval remain later implementation steps. The pilot
medicine catalogue and clinician content review are available in [Step 5](STEP5.md).

## Automatic Component 1 receiver

When the real Component 1 finishes processing a consultation, its backend sends
the result to:

```text
POST /api/prescription/component-1/results/
Content-Type: application/json
X-Component1-Key: <backend-only shared secret>
```

The receiver and demo loader use the same validation/storage service. The doctor
workspace checks for a result every five seconds while a visible visit is open
and no analysis/diagnosis is saved yet. It also checks when the page regains focus.
A newly delivered result appears without a manual file upload or page refresh.
Existing typed diagnosis text is preserved; a model result cannot confirm itself.

The receiver is disabled with empty default credentials. When Member 1 is ready,
configure these locally in `backend/.env`, then restart the backend:

```dotenv
# Replace these placeholders locally; never put the key in a frontend variable.
COMPONENT1_API_KEY=<random shared secret with at least 32 characters>
COMPONENT1_SERVICE_USER_ID=<existing active approved admin accounts.User.id>
```

An existing approved MediTrack admin account can be the service identity without
Django staff privileges. No account is created or promoted by this feature. The
receiver records that configured identity in `imported_by`; doctor demo imports
record the signed-in doctor instead. A browser login cookie cannot substitute for
the worker's key. Share the key only between the two backends.

The receiver is ready; Member 1 must still implement the producer callback and
agree to this contract. This step does not implement their prediction model.

## JSON contract 1.0

The supplied templates define the complete shape. Required fields:

| Field | Rule |
| --- | --- |
| `schema_version` | `"1.0"` |
| `analysis_reference` | Stable non-empty reference, up to 150 characters; letters, numbers, `_ . : -` |
| `patient_id` | Positive registered patient ID matching the consultation |
| `consultation_id` | Existing non-zero consultation UUID |
| `source` | `component_1_sample` for demo, `component_1` for real results |
| `is_demo` | Must match the consultation's demo status |
| `symptoms` | 1–50 unique codes, presence flags, and duration in days (0–365 or null) |
| `condition_candidates` | 1–2 unique pilot codes: `influenza` / `chickenpox`; finite score from 0 to 1 |
| `severity` | `mild`, `moderate`, `severe` or `unknown`; up to 20 reported red flag strings |
| `review_status` | Always `unconfirmed`; only the doctor creates a separate confirmation |
| `model_version` | Non-empty model identifier; synthetic/demo identifiers cannot claim real results |

Unexpected root or nested fields are rejected. Payload contents are data; they
cannot supply instructions, overwrite patient context, or approve a diagnosis.
Zero IDs are accepted only in the bundled templates before the demo loader binds
the real IDs. They are rejected by the ingestion contract.

The pilot currently accepts these two diseases. Other disease codes need a
reviewed contract extension before Member 1 publishes them to this receiver.

## Storage and retry behavior

- A doctor may load samples only for their own active patient's demo consultation.
- A valid worker key and approved service identity are required for automatic
  server-to-server delivery. The linked patient and doctor must be active/approved.
- The first result returns HTTP 201. An identical retry returns HTTP 200 with the
  original row/reference/timestamp, including after doctor confirmation.
- Different data for an already saved analysis returns HTTP 409. A late result
  for a manually confirmed visit is also blocked. No saved evidence is replaced.
- Confirmation is serialized with ingestion and must reference the exact saved
  analysis. If a new result arrives before a manual confirmation request completes,
  a stale/missing reference is rejected: refresh and review before confirming.

Doctor demo route:

```text
POST /api/prescription/consultations/<uuid>/demo-analysis/
{ "scenario": "influenza" }
```

This route requires the doctor session and CSRF token. The caller does not supply
patient IDs, paths, scores, source metadata, or the imported-by actor.

## Verification

```powershell
# From backend: SQLite in memory, never the live database
..\.venv\Scripts\python.exe manage.py test prescription_context --settings=medicare_project.test_settings --noinput

# From frontend with the local Next server running; all backend calls are mocked
node tests/component1-analysis.mjs
node tests/prescription-encounters.mjs
node tests/admin-assignments.mjs
```

Checks cover both supplied samples, registered patient/visit binding, doctor
access, CSRF, worker authentication, malformed input, immutable evidence,
idempotent retries, explicit confirmation, automatic delivery, preservation of
manual context, and desktop/mobile layout. No live migrations are required and
verification does not insert real patient/analysis records.
