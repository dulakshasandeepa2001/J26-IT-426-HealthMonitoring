# Step 20 — compact patient inputs and connected RF models

The standalone Quick clinical review section and its duplicate confirmation
button/checkbox have been removed. Clinical inputs now appear inside Patient
information, alongside the existing history form. JSON findings remain proposals;
missing facts remain unknown. Required questions and the full correction editor
are preserved, including weight/onset, guideline choice, concerns and symptom
durations. No patient history or clinical answer was changed by this work.

**Confirm inputs and screen medicines** explicitly confirms the visible visit
inputs and requests a preview in one action. Loading, editing and refreshing
never confirm facts or send a screening request. The request carries the
confirmation flags only after that action. It retains all unknown values.
Preview remains read-only; saving the acknowledged result still creates an
immutable assessment. Editing inputs invalidates the current preview and
cancels any pending request. Review refresh retains clinical entries.

## Connected models

The doctor-review workflow now uses a new versioned adapter,
`prescription_review/rf_inference.py`, with both existing saved RF bundles:

- `selected-rule-imitation-rf-2026-10-20-v1`: five classifiers for allergy,
  duplicates, selected interaction cautions, proposed-regimen comparison and
  provisional purpose applicability. Four source-reference products and seven
  condition/purpose-role mappings are supported.
- `synthetic-200-symptom-match-random-forest-2026-10-20-v1`: supplementary toy
  symptom-match classifier. It is labelled separately and does not supply
  clinical relevance, antiviral targets, safety clearance or prescribing dose.

This is an explicit extension from frozen-fixture CLI inspection to **saved
synthetic consultation screening inputs** through a separate adapter version:
`synthetic-screening-rf-adapter-2026-10-20-v1`. The original frozen model files,
training implementations, datasets, manifests and CLI contracts are unchanged.
The earlier frozen research viewer remains available as the earlier baseline;
its categorical-tree algorithm is not presented as the connected RF workflow.

Both the API and adapter require synthetic scope. The server must explicitly
enable `PRESCRIPTION_EXPERIMENTAL_ML_ENABLED`, the consultation must be marked
`is_demo`, and the doctor must opt into experimental suggestions. Authorization,
saved-screening freshness, deterministic revalidation, doctor decisions and
approved-only synthetic print access remain enforced. Real-patient prescribing
and publication are not enabled.

Model loading verifies all saved output hashes, training source bindings and
exact dependency versions. Full artifact audits run before first loading each
immutable bundle. Verified estimators are cached by manifest identities;
subsequent requests still recheck all file/source/environment hashes. Changed
artifacts fail closed even if estimators are cached. Requests never fit a model,
read Downloads, generate labels or write research files.

## Input mapping and decision boundary

Age comes from the saved screening snapshot's registered DOB calculation.
Clinical/history fields come from that same synthetic assessment. Exact product
strength/form/route/ingredients/concept and supported condition-purpose mappings
are checked against frozen coverage. Other scopes abstain.

The screening contract stores confirmed positive symptoms, not confirmed
negative symptoms. Therefore any unlisted symptom is explicitly encoded as
Unknown in both RF adapters, even when the visit's review flag is true. The
adapter never imports unverified analysis observations as clinical model facts.
Targets, teacher checks/reasons/scores, review decisions and post-decision data
do not enter model features.

For inspection, the API/UI return each learned rule prediction beside the
existing deterministic outcome. Disagreement and abstention are visible. A
permissive learned prediction cannot clear a block, unknown, incomplete product,
missing review or unresolved caution. RF disagreement/abstention prevents an
automatic default suggestion; it does not change deterministic findings or
invent a new clinical contraindication. The doctor can independently select
available screened candidates through the existing explicit edit flow.

Main suggestions use provisional RF **purpose applicability**, not best-medicine
ranking. Role groups remain separate and single-candidate groups do not gain
ranking claims. Dose predictions compare the already screened regimen; no ML
numeric dose, confidence score or unconstrained substitution is created.
The known RF errors and insufficient novel-input variation from Step 19 remain
limitations; connecting the model does not create clinical validation.

Saved proposal provenance includes both bundle versions/hashes and the adapter
version. Approval freshness checks both model identity and decision implementation.
Older proposals remain in history and become stale after this implementation
change; regenerate ML suggestions from a current screening assessment. Existing
clinical screening drafts, catalogue reviews and accounts are preserved.

## Files

- `frontend/src/features/prescription-intelligence/PatientClinicalInputs.tsx`
  replaces `QuickClinicalReview.tsx` and removes duplicate confirmation UI.
- `PrescriptionWorkspace.tsx` and `SixConditionDraftFlow.tsx` place the clinical
  inputs in Patient information while preserving the bound screening state and
  expose the explicit confirm-and-screen action.
- `DoctorReviewFlow.tsx` and `reviewApi.ts` show RF model provenance, per-task
  comparisons, unknowns, disagreements and the supplementary toy prediction.
- `backend/prescription_review/rf_inference.py`, `inference.py`, `services.py`
  connect verified models and bind proposal freshness to their versions/hashes.
- Backend tests and the six-condition, handoff and doctor-review browser tests
  cover the changed flow. No schema migration or database configuration change.

## Commands

From the repository root:

```powershell
# Terminal 1: local backend, explicitly enabled synthetic ML only.
$env:PRESCRIPTION_EXPERIMENTAL_ML_ENABLED = 'True'
.\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000 --noreload --nothreading

# Terminal 2: frontend.
Set-Location frontend
npm run dev

# Terminal 3, from repository root: SQLite in memory, not the configured database.
Set-Location backend
..\.venv\Scripts\python.exe manage.py test prescription_review medicine_knowledge.test_patient_screening --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment verify
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment verify
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate

# From frontend with the development server available. Browser writes are
# routed to the isolated in-memory Django bridge, not the live HTTP backend.
Set-Location ..\frontend
node tests/doctor-review.mjs
node tests/six-condition-workspace.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Do not rerun training to start the app. Optional RF dependencies are pinned in
`prescription_research/random_forest_200/requirements.txt` and were already
installed in this project's `.venv`.

Verification: 44 isolated backend tests passed. The doctor-review browser test
passed screening → RF suggestions → explicit draft preparation → edit/approve/
reject, lost-response idempotency, stale/revoked access and A6 browser print.
TypeScript and targeted ESLint passed. The six-condition browser regression passed;
checks include
retained unknowns, explicit WHO choice, numeric entry, cloud retry/timeout,
late-response cancellation, history identity, persisted drafts and mobile width.

Next research step: improve independently reviewed task coverage and unseen
input evaluation before broadening model use. Production safety continues to
use deterministic controls; these saved synthetic RF experiments remain
unreviewed and not clinically validated.
