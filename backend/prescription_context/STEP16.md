# Step 16: zero-candidate investigation and traceable screening

Investigation date: 19 October 2026. This work does not clear a patient history,
change clinical answers, select a different guideline, create reviews, import
new live knowledge, retrain a model or publish prescriptions.

## Scope of the evidence

No exact consultation URL/UUID was supplied. The user asked to fix the general
workflow instead. Later, existing local server request logs identified the
currently opened consultation, allowing an exact, read-only follow-up. It is an
explicitly synthetic consultation with an active approved assigned doctor and a
confirmed influenza diagnosis. It has **zero six-condition screening drafts**
and **two legacy drafts**. The current Preview form values are therefore not a
saved six-condition assessment. Unsaved Preview entries cannot be recovered
from the database: Preview is read-only. Only saving an assessment records its
clinical inputs in an immutable snapshot.

The shared configured medicine/review tables were inspected inside a PostgreSQL
`SET TRANSACTION READ ONLY` transaction before changing clinical code. The later
exact consultation audit used the same transaction protection. No records were
written or exported to research files. Full patient identifiers, DOB, raw notes
and clinician identity details are deliberately omitted from this document.
The quoted product example below was already an isolated test fixture.

The scoped audit confirmed current-visit history-review provenance and exact
doctor-confirmed paracetamol product normalization to `acetaminophen`; the
recorded penicillin identity is resolved and the allergy is retained. The saved
analysis contains reported symptom durations but no explicit antiviral onset.
Its source severity is moderate and there are no reported red flags; that does
not establish independently assessed care setting/concerns. The latest legacy
draft retains onset and duration fields, but that schema has no influenza
guideline selection. Those older values are **not evidence of the current form's
entered durations or WHO selection**. The new response trace makes the actual
submitted values inspectable before saving.

## Confirmed shared knowledge state, before the fix

All four installed pilot catalogue entries had intact hashes and **current
content reviews**. Their executable profiles all had stored `reviewed` decisions
but **effective current = false**. This is a genuine stale safety review, not
an incorrect merge with the content review.

| Product | Catalogue version | Profile version | Content review | Effective safety review |
| --- | --- | --- | --- | --- |
| Oseltamivir 75 mg capsule | pp1-2026-10-13-v1 | pp1-rules-2026-10-14-v3 | Current | Stale engine binding |
| Paracetamol 500 mg tablet | pp1-2026-10-13-v1 | pp1-rules-2026-10-14-v3 | Current | Stale engine binding |
| Acyclovir 800 mg tablet | pp1-2026-10-13-v1 | pp1-rules-2026-10-14-v3 | Current | Stale engine binding |
| Calamine + zinc oxide lotion | pp1-2026-10-13-v1 | pp1-rules-2026-10-14-v3 | Current | Stale engine binding |

Stored reviewed engine hash:
`f008e8b67fef68b24024462eac225b203905b68402aff24bca7d937477839b8f`.
Actual pre-change engine hash:
`90359c6466386404866148042aae87f68fba37a3271955e4d824a7dd4bd7dc7f`.
The stored and actual profile content hashes matched, so content was not the
reason those four safety acceptances were stale.

The three additional influenza scopes (`flu-baloxavir`, `flu-peramivir`,
`flu-zanamivir`) had current content reviews but `catalogue_only` handlers and
no exact executable product policy. Peramivir/zanamivir had no safety review;
baloxavir's recorded safety decision had a changed rule/implementation binding.
None can become available just by filling patient questions or accepting content.

The patched engine is `six-condition-patient-screening-2026-10-19-v3`. Its pilot
engine hash is
`2c7c37cc211fc915d8dcddba06454ab836132fa4c90ecd15effd6b2ce1dd7d10`.
Review hashes have deliberately **not** been rewritten to match it. Changes to
bound clinical files also invalidate any additional-scope safety bindings that
refer to previous implementations. A genuine current-version review and, for
those scopes, a deliberate versioned re-import are separate future actions.

## Implementation defects fixed

1. **Numeric fields disappeared during entry.** In missing-question mode, the
   first digit made `value == null` false, removing onset/duration inputs from
   the form. Focused numeric questions now remain mounted while completing the
   review. Clearing still produces Unknown, not zero. No hours/days are guessed.
2. **Missing renal question for paracetamol.** The backend reference regimen
   requires standard renal and hepatic assessments, but the quick-question
   helper requested only hepatic assessment when paracetamol was the only
   reviewed executable candidate. It now requests both; no answer is filled in.
3. **WHO choice evaluated CDC treatment checks.** Previously the oseltamivir
   reference regimen, onset and vaccine checks ran before a generic message
   asked the doctor to select CDC. WHO now takes its own explicit branch:
   assessed non-severe outpatient influenza gets the WHO recommendation against
   oseltamivir; unknown/severe/hospital contexts get an unsupported WHO coverage
   finding instead. Neither branch runs a CDC regimen/onset/vaccine check.
   Unselected guideline remains unselected. A same-visit input refresh retains
   the explicit choice; only browser-preference loading for a new review uses
   the separately opted-in preference. No automatic guideline switch occurs.
4. **Misleading manual-dose instruction.** This active six-condition screen
   creates a server reference regimen *before* dose validation. It has no manual
   proposed-regimen input, and there is no circular availability/dose gate. When
   no reference can be generated, the actual missing prerequisite is now shown
   once, instead of also asking for a manual proposal that this screen cannot
   accept. The old unused `DraftFlow` is not the Workspace's active component.

WHO evidence: [2024 non-severe influenza recommendations, section 7.1.4](https://www.ncbi.nlm.nih.gov/books/NBK607899/).
CDC evidence: [2026 antiviral summary](https://www.cdc.gov/flu/hcp/antivirals/summary-clinicians.html).
The selected CDC prototype remains bounded to its encoded outpatient window;
an onset outside that window is not a universal contraindication to treatment.

## Traceability and genuine exclusions

`screening_trace.py` only explains existing evidence and effective review state;
it cannot clear a finding. New preview/saved results contain:

- `input_trace`: the submitted clinical facts, registered completed age, source
  observations and context timestamp. Symptom durations and antiviral onset
  remain different fields.
- Candidate `review_trace`: exact catalogue/profile/scope versions and hashes,
  recorded versus effective review state, reasons, reviewed/current engine hash.
- Check `trace`: actual input values and the backend rule responsible. The
  original source references, finding status and evidence remain available.
- `blocks_availability`: explicitly identifies pre-existing blocking warnings,
  including interaction-review warnings. Safety behavior is not relaxed.

The frontend groups only identical shared assessment reasons with the same
observed inputs. Each affected medicine links back to that reason. Different
patient facts, guideline checks, dose findings, duplicate ingredients, review
states and incomplete product policies remain candidate-specific. The expanded
evidence retains every original check, including repeated entries.

In an isolated confirmed-product example, `Paracetamol 500mg SOS` resolves to
`paracetamol-500mg-tablet`, ingredient **`acetaminophen`**. That normalized
ingredient intersects the new paracetamol candidate and therefore blocks it.
The raw recorded text, reaction, schedule and history remain intact. An exact
identity is not an interaction clearance or authorization to continue/replace a
current medicine. This prototype lacks that separate continuation/replacement
and comprehensive interaction-review pathway.

For the inspected shared live knowledge state, **no currently implemented and
reviewed influenza pathway can produce an available candidate**, independently
of the unspecified consultation's answers. What is missing is:

1. Genuine safety reviews bound to the current implemented pilot engine. The
   current catalogue content reviews do not need to be fabricated or repeated.
2. For a WHO non-severe oseltamivir selection, this is an actual guideline
   exclusion, not a missing checkbox that a review can resolve.
3. If the patient takes a normalized acetaminophen-containing product, a separate
   clinician continuation/replacement workflow is needed; erasing the medicine
   or bypassing the duplicate check is not a solution. Current medicine pairs
   also need a supported independent interaction-review pathway.
4. For baloxavir, peramivir and zanamivir, exact products, executable
   condition/guideline-specific safety/regimen policies and genuine reviews are
   missing. This task does not silently implement or approve those pathways.
5. Required actual patient assessments, measured pediatric inputs where
   applicable and independently verified onset/target durations must exist.
   The current form's missing facts and selected guideline cannot be named
   without its unsaved request. Reported severe findings remain blocking.

## ML integration status

This screen is **deterministic screening**, `model_used=false`, with unranked
candidates. A separate explicitly enabled **synthetic** workflow can consume a
saved current screening assessment, revalidate it, load the frozen categorical
tree and suggest provisional relevance. It cannot restore withheld candidates,
resolve unknowns, approve a prescription or run for a real-patient visit. The
doctor decision and synthetic print remain later stages. No training runs during
Preview/API requests and no research dataset/model artifacts were modified.

## Verification commands

From `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test medicine_knowledge prescription_review prescription_context.test_history_identity --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

From `frontend`, with the local frontend running:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node tests/quick-review-data.mjs
node tests/screening-reason-groups.mjs
node tests/six-condition-workspace.mjs
node tests/doctor-review.mjs
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/quickReviewData.ts src/features/prescription-intelligence/QuickClinicalReview.tsx src/features/prescription-intelligence/clinicalScreeningApi.ts src/features/prescription-intelligence/screeningReasonGroups.ts src/features/prescription-intelligence/ClinicalScreeningResult.tsx src/features/prescription-intelligence/ScreeningNextActions.tsx src/features/prescription-intelligence/SixConditionDraftFlow.tsx
```

Browser scripts intercept API calls into isolated in-memory SQLite. Fixture
doctor reviews exist only in that database. Regression checks cover distinct
duration/onset round trips, missing onset, key-by-key entry, WHO retention and
recommendation versus unsupported scope, genuine stale engine reviews, exact
acetaminophen duplicate evidence, blocking interaction warnings, dose ordering,
all six conditions, permissions, immutable/idempotent saves and the separate
ML/doctor-decision flow. These are software checks, not clinical validation.

Final results: **68 isolated Django tests pass**, TypeScript and targeted ESLint
pass, both pure-helper checks pass, the six-condition browser suite passes, and
the doctor-review/ML/print browser suite passes. Frozen comparison validation
passes with the existing categorical tree unchanged. The restarted backend and
frontend Workspace both return HTTP 200; the configured database health check
also returns HTTP 200. No live clinical/review writes were performed.
