# Step 8E: read-only synthetic Experimental ML workspace

The doctor workspace now has an **Experimental ML** panel that loads the frozen
[Step 8D](STEP8D.md) validation-selected categorical tree. It predicts provisional
candidate relevance for an explicitly selected **fictional research fixture**.
It does not train, rank interchangeable treatments, screen the registered patient
with ML, save a draft, clear clinical reviews or publish a prescription.

## Changed files

| File | Purpose |
| --- | --- |
| `backend/prescription_context/experimental_ml.py` | Hash-verified saved-artifact options/inference; assigned-doctor and synthetic-demo access |
| `backend/prescription_context/urls.py` | Separate scoped read-only inference endpoint |
| `backend/medicare_project/settings.py` | One default-off feature flag; database configuration unchanged |
| `backend/prescription_context/test_experimental_ml.py` | Isolated access, no-fit/no-write, provenance and safety checks |
| `frontend/src/features/prescription-intelligence/experimentalMLApi.ts` | Strict response binding and research/safety flag validation |
| `frontend/src/features/prescription-intelligence/ExperimentalMLPanel.tsx` | Per-visit opt-in, fixture picker, provenance, limits, learned explanation and static safety findings |
| `frontend/src/features/prescription-intelligence/PrescriptionWorkspace.tsx` | Replace the old model placeholder; retain the existing clinical workflow |
| `frontend/tests/experimental-ml.mjs` | Actual offline model responses in a mocked browser flow |
| `STEP5.md`, `STEP8D.md`, `STEP8E.md` | Workflow, exact commands and limitations |

The training implementation, frozen data/models/results, clinical catalogue,
engine and review bindings are reused unchanged. No migrations, package installs,
new accounts, clinical-record writes or fabricated approvals are required.

## Enable and run locally

From the repository root in a VS Code PowerShell terminal, stop the existing
backend in its own terminal with **Ctrl+C**, then run:

```powershell
cd backend
$env:PRESCRIPTION_EXPERIMENTAL_ML_ENABLED = 'True'
..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

This changes the environment of that local server process; no `.env` or database
configuration edit is needed. A server started without this flag remains disabled
by default (unless the developer explicitly sets it in their environment).
To disable the local demo, stop the backend and restart with the flag set to
`'False'`. No model-training command is needed for inference.

In a second terminal, from the repository root:

```powershell
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Reuse an already-running frontend instead of starting another on the same port.
Open `http://127.0.0.1:3000/doctor/prescription-workspace`, sign in as an existing
approved doctor, and select an assigned **synthetic demo** consultation. Then:

1. Open the **Experimental ML** section and check **Enable frozen synthetic research demo**.
2. Choose a **Frozen fictional scenario** and **Research medicine candidate**.
3. Click **Predict synthetic relevance**.
4. Inspect the provisional label, frozen rule reference, learned path, input
   nulls, fictional context, source references and independent research findings.

A useful boundary example is `SIX-acute_multi_symptom-06` with
`ors-low-osmolarity-powder`: the tree predicts **relevant**, while deterministic
research findings remain **blocked** because the exact ORS product identity,
composition, dilution and identifier are unresolved. No regimen or prescription
eligibility is created. Selecting an unrelated candidate or an unknown-etiology
fixture demonstrates abstention outside the fitted task.

## Access, inputs and lifecycle

`GET /api/prescription/consultations/<uuid>/experimental-ml/` returns verified
fixture/candidate choices and experiment metadata. The browser does not call it
before opt-in. The server requires the feature flag, an active approved doctor,
their assigned consultation, an active approved patient and `is_demo=true`.
The consultation supplies authorization scope only. Its DOB, patient context,
analysis and diagnosis are never used by this inference code.

`POST` to the same URL accepts **only**:

```json
{
  "synthetic_demo": true,
  "scenario_id": "SIX-acute_multi_symptom-06",
  "candidate_id": "ors-low-osmolarity-powder"
}
```

These must identify existing frozen synthetic records. Arbitrary features,
patient IDs, model paths, fit options and query parameters are rejected. Session
authentication, CSRF and `Cache-Control: no-store` apply. POST is an inference
operation with no persistence; there are no update/delete/training actions.
Missing or changed code/data/artifact hashes return 503 without rebuilding.
Filesystem exception details are not returned to the browser.

Each request verifies and loads the existing saved model. It does not call fit,
select a model again, regenerate labels, retest the held-out cohort or read live
patient clinical features. Reference targets are returned separately for inspection, never
included in model inputs. Deterministic findings are **frozen simulations**, not
fresh safety clearance or a comprehensive interaction check. They retain
`simulation_only=true`, `review_gate_evaluated=false`, full clearance false and
all prescription/approval/publication flags false.

The browser clears results on input changes, failed or malformed responses,
opt-out, access loss and visit changes. Abort and request-sequence guards prevent
late results from restoring an old fixture/visit. Response encounter/case/model
bindings and safety/provenance flags must match before results are shown. The
normal live catalogue, reviews and pilot draft flow continue separately.

## Actual research limits

The unchanged batch contains **60 fictional contexts / 360 rows**. The saved tree
was fitted on **27 unique mapped inputs** using provisional `rule_derived`
researcher-defined criteria; every clinical review remains `not_reviewed`.
Its frozen test agreement is **21/27 overall**, including **10/16 (62.5%) on
inputs absent from training**; the six novel-input errors are retained. These are
agreement with provisional rule labels, not clinical accuracy or independent
validation. The novel-test majority baseline already agrees on 9/16 inputs.

The six condition mappings contain five reference products and an unresolved ORS
planning identity. One candidate per purpose/role group prevents meaningful
within-group alternative ranking. Unsupported/unmapped pairs abstain. Null
conditions and symptoms stay unknown; no patient values are invented. Training
leaf support is not calibrated medical confidence. The earlier frozen report's
`api_enabled=false` records the offline training delivery; its bytes and hashes
are preserved rather than rewriting experiment history for this optional wrapper.

## Verification commands

Backend, from `backend` (all Django tests use in-memory SQLite):

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context.test_experimental_ml --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m unittest discover -s prescription_research -t .
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

Frontend, from `frontend`, with the Next development server running. Browser
tests mock every backend call and load synthetic artifacts via the local Python:

```powershell
node tests/experimental-ml.mjs
node tests/six-condition-handoff.mjs
node tests/prescription-drafts.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/ExperimentalMLPanel.tsx src/features/prescription-intelligence/experimentalMLApi.ts src/features/prescription-intelligence/PrescriptionWorkspace.tsx
```

Actual verification on 2026-10-16: **11 new API checks**, **151 total isolated
backend tests**, **98 offline research tests**, all three browser flows above,
TypeScript and targeted ESLint passed. The new browser flow covered eight saved
pairs (six mapped conditions, one unknown condition and one unrelated candidate),
server-disabled behavior, missing-data preservation, ORS relevance with its
identity block, invalid responses, request failures, access loss, late responses,
visit reset and 390px layout. Existing handoff and automatic draft/Records flows
passed with all backend calls mocked. No live clinical writes were made.

Saved-model verification passed with unchanged frozen source/data/artifact hashes.
The original two-condition model retained its recorded SHA-256. Removing only the
new appended feature-flag block reproduces the pre-change settings-file hash;
database/account configuration was preserved.

## Next integration step

Review the recorded disagreement cases and define a separately versioned,
larger set of varied scenario families with **fresh held-out cases** before another
research comparison. Preserve these inspected results. Actual encounter-based
support for the four new conditions additionally needs resolved product identity,
appropriate independently reviewed evidence/rules and verified clinical inputs;
this synthetic demonstration does not provide those reviews or validation.
