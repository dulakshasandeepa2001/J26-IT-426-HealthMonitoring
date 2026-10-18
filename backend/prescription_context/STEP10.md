# Step 10: Experimental ML proposals, doctor decisions and compact print view

Implemented 2026-10-18. This adds a separate doctor-decision stage after the
existing six-condition screening draft. The saved model is reused; no model is
trained during a request. The connected flow is explicitly synthetic-demo-only.
Real-patient prescribing, dispensing validity and patient publication remain
disabled. The original frozen research demo remains available separately.

## Doctor workflow

1. Choose an assigned **PP1 demo** visit, receive/load the Member 1 JSON and
   confirm the diagnosis. Review patient history and clinical inputs as before.
   Applicable catalogue/rule reviews must genuinely be current.
2. Preview candidates and save the screening draft. Its safety findings and
   regimens remain authoritative; it is not a doctor approval.
3. Below the saved draft, enable **Experimental ML proposal for this synthetic
   demo**, then click **Generate medicine proposal**.
4. Inspect the available screened candidates and provisional model labels.
   Relevant model outputs supply the proposed selection. Unsupported products,
   unknown/unseen inputs and model abstentions have no invented prediction.
   If there is no automatic suggestion, **Edit medicines** can inspect the
   remaining screened choices; a doctor's choice is recorded as such.
5. Use **Edit medicines** to include/remove available candidates. Choose at most
   one alternative per treatment purpose/role. Multiple selected medicines need
   an explicit independent combination/interaction review. Arbitrary dose edits
   are not accepted; outside-rule regimens require a separate reviewed pathway.
6. Enter the decision reason (at least 10 characters), confirm the review and
   choose **Save edits**, **Approve selected medicines**, or **Reject proposal**.
   Saving edits records an unapproved version. Reconfirm before later approval.
   Approval requires at least one available medicine; rejection has no selection.
7. Only approval exposes **Open approved demo prescription**. That view contains
   the registered patient name/age, approval date, approved medicines and their
   exact screened instructions, and the doctor's recorded profile details.
8. **Print A6 prescription demo** rechecks current approval, then opens the
   browser print dialog. Paper size is A6 portrait (105 × 148 mm); long contents
   may continue onto another page rather than being clipped. Select A6 in the
   printer dialog if the driver requires it. No PDF generation/storage library
   is used, and this flow does not export a PDF itself.

The printed slip is clearly marked **RESEARCH DEMO — NOT FOR DISPENSING**.
Doctor qualifications/university are profile data, not verified credentials.
There is a signature/authorized-seal space; the software does not manufacture a
doctor signature, SLMC number or official seal.

## What the ML stage does

- Loads the validation-selected `categorical_tree` artifact from the completed
  three-model experiment, verifies the frozen hashes and performs inference only.
- Uses a strict input set: condition, candidate ID, purpose, model clinical role
  and doctor-verified positive symptom presences. Other symptom presences stay
  unknown. No labels, teacher scores, review decisions, safety findings, approval
  outputs or patient identifiers are model inputs.
- Retains the frozen model's condition/product/purpose coverage. The clinical
  adapter's influenza/varicella Paracetamol role names have an explicit narrow
  translation to the original model's fever/aches or fever roles. This changes
  neither the fitted model nor its provisional labels.
- Changed strength, form, route or standard-product reference falls outside the
  frozen model's product coverage and abstains rather than reusing its ID alone.
- Scores only candidates already available through deterministic screening.
  Unavailable products are withheld before prediction; untrained products such
  as the added Ibuprofen identity abstain instead of receiving a fake ranking.
- Suggests the `relevant` candidates, preserving purpose groups. More than one
  relevant alternative in one group is not automatically combined. The model
  is a small provisional rule-imitation baseline; it does not establish a
  clinically best medicine, calibrated medical confidence or meaningful
  within-group ranking where only one candidate was trained.
- Reads no real-patient consultation through this new route: existing
  `is_demo` access scope, a server feature flag and explicit request opt-in are
  required. Do not label real clinical visits as synthetic to bypass that scope.
  Demo context and prediction snapshots remain in private workflow tables;
  research datasets, models and evaluation artifacts are never updated.

## State, authorization and audit

`MedicineProposal` stores an immutable source draft, model provenance, inputs,
predictions and default selection. `DoctorDecision` stores immutable edit,
approval and rejection versions, chosen medicines, reason, acting doctor and
server timestamp. An edited/rejected proposal has no printable prescription.
Once approved/rejected, a proposal's final decision is not overwritten; generate
a new proposal for a later revision.

Both writes use idempotency keys. Lost responses can be retried without duplicate
approvals; reusing a key with another request is rejected. Expected decision
revision and proposal hash prevent stale-tab overwrites. Visit/patient/knowledge
locks and full current deterministic screening run again before decisions.
Blocked products, duplicate ingredients and multiple same-purpose alternatives
cannot be admitted by an ML prediction or doctor selection.

Source history, registered patient name, DOB, analysis, diagnosis, date, medicine content, rule reviews,
implementation and frozen-model versions must remain current. New proposals
supersede old approvals. Print requests fail closed for stale inputs, edited or
rejected decisions, changed doctor identity, revoked access or changed model
artifacts. The browser refetches before invoking print and removes the slip on
failure. Printed paper cannot be remotely revoked after it leaves the system.

Session authentication, approved-doctor/assigned-visit checks and CSRF protect
the APIs. Actors, timestamps, patient data and regimens cannot be supplied as
decision shortcuts by the client. No patient-facing API/publication was added.

## Implementation files

- `backend/prescription_review/`: new app with strict contracts, frozen-model
  inference adapter, workflow service, views/routes and migration `0001_initial`.
- `backend/medicare_project/settings.py`, `urls.py`: register only the new app
  and its private API routes; existing database configuration is retained.
- Frontend `reviewApi.ts`, `DoctorReviewFlow.tsx`, `DoctorDecisionHistory.tsx`,
  `PrescriptionSlip.tsx`: typed API, doctor actions, history and A6 printing.
- `SixConditionDraftFlow.tsx`: connects the saved screening draft to the doctor
  stage and blocks decisions while clinical edits await a new saved draft.
- `DraftRecords.tsx` and the existing approval-history page: link to actual
  recorded doctor decisions instead of placeholder approval messages.
- `usePrescription.ts`: removes the unused approval/rejection no-op callbacks.
- `frontend/src/app/doctor/prescription-slip/[decisionId]/page.tsx`: private slip
  page using the installed Next async route-params contract.
- `backend/prescription_review/tests.py`, `frontend/tests/doctor-review.mjs`:
  focused state, safety, authorization, retry and browser-print verification.
  The existing in-memory browser bridge enables the feature only in its test
  settings; its fake doctors/reviews never enter the configured clinical DB.

## Setup and exact verification commands

From `backend`, inspect and apply the narrow new-table migration:

```powershell
..\.venv\Scripts\python.exe manage.py migrate prescription_review 0001 --plan
..\.venv\Scripts\python.exe manage.py migrate prescription_review 0001
```

The plan adds only the two workflow models and their constraints. It does not
modify existing account/clinical tables, import medicines or create doctor
reviews. Existing clinical/account/draft/review record counts were checked
before and after applying it.

Enable the existing synthetic experimental flag for a local server process:

```powershell
$env:PRESCRIPTION_EXPERIMENTAL_ML_ENABLED = 'True'
..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000 --noreload
```

This local process flag does not change saved database settings or require an
environment-file edit. Restarting without it uses the configured default.

Backend checks:

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts prescription_review --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

Frontend checks, with the local Next server running:

```powershell
node tests/doctor-review.mjs
node tests/six-condition-workspace.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/DoctorReviewFlow.tsx src/features/prescription-intelligence/reviewApi.ts src/features/prescription-intelligence/PrescriptionSlip.tsx src/features/prescription-intelligence/DoctorDecisionHistory.tsx src/features/prescription-intelligence/SixConditionDraftFlow.tsx src/features/prescription-intelligence/DraftRecords.tsx src/features/prescription-intelligence/usePrescription.ts 'src/app/doctor/prescription-slip/[decisionId]/page.tsx' src/app/doctor/validation-approval-history/page.tsx
```

The browser suite uses real Django APIs against disposable in-memory SQLite and
fictional patients. The print dialog is intercepted to verify invocation; no
physical printer or PDF export is used during tests. It checks edits before
approval, selected-only output, persisted history, approval response-loss retry,
A6 CSS/mobile layout, rejection, stale-slip denial and revoked-access clearing.

## Remaining scope

This completes the connected PP1 synthetic workflow, subject to the verification
results below. Wider product coverage, meaningful alternative ranking and
independent clinical evaluation require separately versioned evidence/data work.
Custom regimens, current-medicine continuation/replacement, comprehensive
interaction clearance, verified registration/signature assets and a legally
deployable live-patient prescription service remain separate work.

## Actual verification and local setup

The full isolated backend suite passed **197 tests**. After the final registered
name and frozen product-coverage guards were added, the focused review suite
passed **10 tests**. The saved-model check confirmed that no fitting occurs in
the API and that unknown symptom presences remain unknown. Existing source
screening behavior remains covered by the full suite.

Browser verification passed for saved-model proposals, saved edits, approval,
rejection, persisted decision history, lost-approval-response idempotency, an
approved-only selected-medicine slip, A6 print CSS, mobile layout, stale-slip
denial and revoked-access clearing. The six-condition Workspace regression
suite also passed, including the previous history-identity flow. TypeScript,
targeted ESLint and frozen model validation passed. These are software checks,
not independent clinical validation or a claim of best-medicine accuracy.

The narrow migration was applied and existing account/clinical/draft/review
counts remained unchanged. No existing patient record or clinician decision
was edited or fabricated. Local frontend and backend were started on ports
3000 and 8000; the backend process enables the synthetic demo flag. Environment
files and existing database settings were preserved. Refresh the browser to
load the new workflow.
