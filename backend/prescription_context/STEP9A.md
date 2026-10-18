# Step 9A: six-condition Workspace preview, saved drafts and Records

Implemented 2026-10-17. This connects the Step 9 APIs to the existing doctor UI.
It reuses the reviewed catalogue, deterministic engine, private draft model and
per-visit patient-history flow. No migrations, catalogue imports, review decisions,
account changes, database configuration changes or model retraining are needed.

## Doctor workflow

1. Open Prescription Workspace and select an assigned registered patient and visit.
2. Receive/load the Member 1 analysis and explicitly confirm the diagnosis.
3. Review/save allergies and current medicines for this visit. Existing history
   is retained across visits but does not automatically verify a new visit.
4. The Generate section loads registered DOB age, current diagnosis/history
   bindings and the backend's unknown clinical template.
5. Review the prepared summary and answer missing clinical questions using
   [Step 9B quick review](STEP9B.md). Source observations are proposals requiring
   confirmation. Use the full editor for corrections, then explicitly confirm
   the summary and symptom targets. Unknown facts remain unknown.
6. Click **Preview medicine candidates**. Inspect candidates, regimens, evidence,
   exclusions and any alternatives requiring a clinician choice. Clinical inputs
   can still be corrected; changing one immediately invalidates the preview.
7. Acknowledge the displayed preview, then click **Generate Prescription Draft**.
   If no medicine candidate is available, the button is **Save assessment draft**;
   it records the assessment and exclusion reasons, not a prescription.
8. Inspect the saved version in Workspace or Prescription Records. Historical
   versions retain their snapshots. Records includes both the original pilot
   drafts and new six-condition drafts, without migrating/deleting the originals.

All saved versions remain unapproved and unpublished. Multiple same-purpose
candidates are explicitly alternatives requiring clinician choice, not a combined
treatment package. The saved artifact is the candidate screening assessment;
final medicine selection, prescription approval and patient publication are
separate future work. No print/publication/approval action was added.

## Scope and behavior

- All six canonical diagnoses use the Step 9 backend. Unsupported manual diagnoses
  show a clear prerequisite message and cannot generate a plan.
- Only applicable assessment controls are displayed. The full server contract is
  still sent with unknown/null defaults for other fields. Adult age is never
  assumed; pediatric weight is shown only where applicable to the original pilot.
- Independent concern dropdowns use actual booleans or null. Source positives
  cannot be silently cleared. There is no bulk “mark all safe” control.
- No medicine or dose override is sent from the browser. Product/rule review and
  patient-specific safety decisions remain authoritative on the server.
- Catalogue-only options, ORS gaps, pending reviews and unknown assessments keep
  their existing blocks. Six-condition UI support does not make all 16 catalogue
  identities automatically prescribable. Ibuprofen still needs its own current
  genuine safety review in the configured project data.
- Inputs, preview, save and history are bound to the current visit. Changing
  patient, visit, registered DOB, analysis, diagnosis or saved history resets the
  screen's review state. Late preview responses cannot restore an obsolete plan.
- Save requires a separate preview acknowledgement. The identical request key
  and body are reused after a lost response, allowing the backend's idempotent
  retry. A 409 conflict removes the preview and requires refreshed inputs/review.
- Authorization failures clear displayed private drafts. Records fails closed if
  either draft source cannot be loaded; it does not silently present partial data.
- Scheduled oral, oral PRN, qualitative topical and ophthalmic PRN regimens use
  distinct renderers. Eye drops retain drop units; no fixed course/frequency or
  invented drop-to-mL conversion is introduced. Reassessment limits are labelled
  separately from prescribed course lengths.
- This flow is deterministic and unranked. The separate Experimental ML panel,
  frozen datasets/model and provisional-label provenance remain unchanged.

## Changed files

Under `frontend/src/features/prescription-intelligence/`:

- `clinicalScreeningApi.ts`: typed inputs/preview/save/history requests and response
  binding guards for the existing Step 9 APIs.
- `clinicalAssessmentFields.ts`: unknown defaults and condition-specific labels,
  concerns, symptom targets and assessment options.
- `SixConditionDraftFlow.tsx`: prerequisites, independent assessment, preview,
  acknowledgement, safe retries and saved version display.
- `ClinicalScreeningResult.tsx`: candidate groups, source-linked exclusions,
  bounded regimen display and unapproved saved assessment view.
- `PrescriptionWorkspace.tsx`: uses the six-condition flow for all diagnoses.
- `DraftRecords.tsx`: combines new and legacy immutable drafts; guards against
  late responses and clears private results on loading/access failure.
- `Member1Report.tsx`: updates the obsolete notice that all four additional
  conditions have no screening pathway.

Verification files under `frontend/tests/`:

- `six_condition_api_bridge.py`: disposable in-memory Django API bridge; only
  test accounts, synthetic clinical contexts and test-only review decisions.
- `six-condition-workspace.mjs`: browser-to-real-API workflow coverage.
- `prescription-drafts.mjs`: existing entry point now delegates to that suite,
  replacing the obsolete two-condition UI fixture contract.
- `six-condition-handoff.mjs`: preserves diagnosis/handoff checks with the new
  prerequisite UI; source facts do not verify patient history or clinical inputs.

No production backend engine, model, review or configuration source was changed.

## Exact verification commands

From `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

From `frontend`, with the local Next development server running:

```powershell
node tests/prescription-drafts.mjs
node tests/six-condition-handoff.mjs
node tests/component1-analysis.mjs
node tests/medicine-knowledge.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/clinicalScreeningApi.ts src/features/prescription-intelligence/clinicalAssessmentFields.ts src/features/prescription-intelligence/SixConditionDraftFlow.tsx src/features/prescription-intelligence/ClinicalScreeningResult.tsx src/features/prescription-intelligence/PrescriptionWorkspace.tsx src/features/prescription-intelligence/DraftRecords.tsx src/features/prescription-intelligence/Member1Report.tsx
```

`node tests/six-condition-workspace.mjs` runs the same new suite directly. It
requires the existing `.venv`, installed frontend Playwright and local Chromium.
All browser backend requests are intercepted and forwarded to real Django APIs
inside SQLite memory. They never go to the configured live clinical database.

Actual results: **180 backend tests passed**. Browser checks passed for all six
diagnoses, unknown defaults, independently entered assessments, preview/save and
refresh persistence, no available GI medicine, qualitative/drop regimens,
same-purpose alternatives, lost-response retry without duplicate saves, ignored
late preview, real stale-context conflict, six new drafts coexisting with a legacy
draft in Records, mobile width and revoked-access clearing. Existing Member 1
handoff/delivery and medicine-review flows passed. TypeScript, targeted ESLint and
the frozen selected-model validation passed. These are software workflow tests,
not clinical validation or clinical accuracy measurements.

The local frontend and backend were started on ports 3000 and 8000. Workspace and
Records return HTTP 200; the new draft API returns 403 without doctor login.

## Remaining work

The immediate Generate/preview/save/Records integration is complete. Next, define
and implement explicit final clinician medicine-choice/edit decisions and their
revalidation/audit before considering an approval or publication workflow. Resolve
exact products and source-based executable rules for unavailable options
separately; content-review badges never bypass those gaps. Expanding the ML
experiment to new candidates requires a separately versioned dataset/evaluation
and does not enable it for live patient decisions.
