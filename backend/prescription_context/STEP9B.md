# Step 9B: quick clinical review

Implemented 2026-10-17 on top of the existing six-condition Workspace flow.
This reduces repeated entry while keeping the backend screening rules and
genuine version-bound reviews authoritative.

## Doctor workflow

1. Select the patient and visit, load Member 1 analysis and confirm the diagnosis.
2. Review/save allergies and current medicines for this visit as before.
3. In **Quick clinical review**, check the prepared patient summary. Registered
   DOB supplies age; saved history supplies the displayed allergies/medicines.
   Explicit structured Member 1 observations are proposed for confirmation.
4. Answer **Questions to clarify**. By default these are missing facts relevant
   to candidates with current content/safety reviews and executable coverage.
   Use **Edit all clinical details** to correct any proposed fact or inspect the
   complete condition-specific form. Unknown is allowed and remains unknown.
5. Tick **I checked the summary, symptom targets, corrections and remaining
   unknowns for this visit.** This explicitly confirms the clinical review and
   symptom targets together; it does not fill missing assessments.
6. Click **Preview medicine candidates**, inspect candidates/exclusions, then
   acknowledge the preview and save the unapproved draft. An empty plan is an
   assessment draft. Correcting clinical data invalidates the preview and review
   confirmation, so confirm and preview again before saving.

An explicit influenza guideline choice can optionally be remembered using the
**Remember** checkbox. Only that protocol choice is stored in this browser,
scoped by doctor ID and engine version. Patient facts and review confirmation
are not stored in that preference. Each visit still requires confirmation.
No guideline is chosen by default; existing CDC/WHO pathway differences remain.

## Data and safety behavior

- Proposed facts are limited to supported structured values. Actual boolean
  observations remain distinct from missing values and strings such as `"false"`.
  Missing/ambiguous symptom observations are not invented.
- An empty red-flag list does not imply a negative assessment. Only an explicit
  Member 1 `red_flag_assessment="assessed"` can propose no reported red flags,
  and the doctor must still confirm. Positive source flags retain their blocks.
- Fever duration is not substituted for influenza/chickenpox onset. Only an
  explicit onset value is proposed. Pediatric weight requires an explicit
  measurement and timestamp; adult weight is not requested unnecessarily.
- Care setting, renal/hepatic assessments and special-population clearance are
  never guessed from unrelated negative flags, visit location or free text.
- Current review metadata determines question priority only. The server still
  checks all clinical requirements and current coverage at preview/save time.
  Unknown facts, changed reviews, unsupported products and missing rules can
  withhold candidates. Extra answers cannot resolve missing product coverage.
- If coverage metadata cannot load, the full editor remains available and the
  server remains authoritative. Access failures clear private screen data.
- Changing patient, visit, diagnosis, analysis, DOB or saved history resets the
  corresponding review context. Lost-response retry, stale-input protection,
  immutable drafts and the separate preview acknowledgement are retained.

No clinical rule, dose, catalogue version, review decision or model was changed.
No migrations, seeds, accounts, live patient records or database configuration
were modified. This flow does not use ML, approve prescriptions or publish them
to patients. Final clinician medicine selection/edit/approval remains separate
work after this candidate-screening stage.

## Implementation

- `backend/medicine_knowledge/screening_views.py`: exposes engine version and
  explicit source red-flag assessment in the existing authorized inputs response.
- `frontend/src/features/prescription-intelligence/clinicalScreeningApi.ts`:
  types those two response fields.
- `frontend/src/features/prescription-intelligence/quickReviewData.ts`: strict
  source proposals, current-coverage question priority and isolated guideline
  preference helpers. No clinical eligibility or dose rules run here.
- `frontend/src/features/prescription-intelligence/QuickClinicalReview.tsx`:
  summary, missing questions, full correction editor and explicit confirmation.
- `frontend/src/features/prescription-intelligence/SixConditionDraftFlow.tsx`:
  loads source/coverage, prepares proposals and invalidates review on edits.
- `frontend/src/features/prescription-intelligence/PrescriptionWorkspace.tsx`:
  adds a history anchor for the summary's correction link.
- `frontend/tests/quick-review-data.mjs`: exercises the actual TypeScript helpers.
- `frontend/tests/six-condition-workspace.mjs`: exercises quick review and full
  corrections through the real six-condition APIs in disposable test storage.

## Verification and commands

From `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

From `frontend`, with the existing local Next development server running:

```powershell
node tests/quick-review-data.mjs
node tests/prescription-drafts.mjs
node tests/prescription-encounters.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/clinicalScreeningApi.ts src/features/prescription-intelligence/quickReviewData.ts src/features/prescription-intelligence/QuickClinicalReview.tsx src/features/prescription-intelligence/SixConditionDraftFlow.tsx src/features/prescription-intelligence/PrescriptionWorkspace.tsx
```

Actual results: **180 backend tests passed**. Helper checks, TypeScript and
targeted ESLint passed. Browser checks passed for all six conditions, including
Influenza preview/save through missing-only quick review without opening the
full editor, explicit guideline preference restoration, fresh confirmation after
reload, corrections, idempotent retries, stale-input conflict, Records, mobile
layout and revoked access. Encounter/history regression checks passed. Browser
API writes used fictional contexts through the in-memory SQLite test bridge,
not the configured clinical database. Frozen research-model validation passed
without retraining. These are software checks, not clinical validation.

The backend was restarted to load the two additional response fields. Frontend
Workspace and Records return HTTP 200; the private draft API returns HTTP 403
without login. Refresh the browser to load the updated UI.
