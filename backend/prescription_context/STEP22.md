# Step 22 — selected interaction evidence and an available-candidate path

## Observed cause

A read-only inspection of the consultation supplied in the conversation found
that the history identities were now saved: penicillin and the exact catalogue
paracetamol product. Its current-medicine normalization resolved acetaminophen.
The pilot oseltamivir and paracetamol catalogue/profile reviews were current.
No screening assessment had yet been saved for that visit, so its latest browser
clinical entries could not be inferred from the database.

The remaining blanket interaction finding withheld oseltamivir merely because a
recognized current medicine existed. New paracetamol was separately withheld for
a genuine duplicate ingredient. Baloxavir, peramivir and zanamivir were reference
entries with incomplete product/executable coverage, not functioning alternatives.

## Evidence and scope

The selected TAMIFLU reference label was read on 2026-10-20:

- [DailyMed TAMIFLU label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b),
  label page updated 2025-12-15; sections 7.2 and 12.3.
- The label reports no clinically relevant pharmacokinetic interaction with
  acetaminophen and no coadministration dose adjustment for this pair. This is
  selected label evidence, not comprehensive interaction clearance or proof of
  individual suitability. Other product limits and patient assessments still apply.

`medicine_knowledge/data/selected_interactions.json` records the source, sections,
access date, scope and version. There is no invented reviewer, approval date or
clinical validation. Its research review status stays `not_reviewed`.

The prospective executable extension is restricted to **synthetic adult
influenza** visits with exactly one doctor-confirmed current product:
`paracetamol-500mg-tablet`, paired with `oseltamivir-75mg-capsule`. Both exact
reference product identity hashes are fixed in the policy. Unresolved,
ingredient-only, ambiguous, additional, changed-product, real-patient and child
contexts cannot use it. This restriction is experimental coverage, not a universal
medical restriction on the products.

## Explicit visit review

Patient information offers **Selected interaction evidence review** only when
the exact scope is supported. The assigned doctor must read the source, record
at least 10 characters describing actual applicability/limitations, and explicitly
confirm the checkbox. Neither loading the source nor a proposed continue/stop
note records this decision. The request cannot supply a reviewer or approval date.

The review binding includes patient/DOB, original analysis, confirmed diagnosis,
saved history/identities, product identities and the extension implementation.
Changed bindings return a conflict rather than silently reusing a review. History
refreshes retain ordinary clinical values but clear this pair-specific attestation.
Preview is read-only. Saving the acknowledged screening assessment records the
review note in the immutable snapshot under its actual assigned doctor and time.

Only the exact generic interaction-gap finding can be replaced by the selected
evidence finding. A specific or newly worded caution is never assumed to be that
gap. Allergy, duplicate treatment, renal/dose/onset/vaccine, severity/red flags,
WHO/CDC choice, product coverage and current knowledge reviews retain their
existing behavior. Current medicines, schedules and proposed actions are not
changed. No continuation/replacement regimen is invented.

When every other prerequisite passes, the extension recovers the existing
validated reference regimen and makes oseltamivir a candidate for doctor review.
The source evidence does not approve the medicine. The existing paracetamol
duplicate remains excluded, and the three reference-only antivirals remain
unavailable.

## Integration and versioning

The active HTTP screening and doctor-review revalidation paths use
`medicine_knowledge/selected_screening.py`: the existing core preparation plus
the separately reviewed pair extension. The original core screening engine,
catalogue/profile content, source-bound rule teacher and existing review hashes
are unchanged. This avoids pretending existing core reviews covered new logic.
The new per-visit acknowledgement is additional to those reviews.

Active preview/save retains authorization, patient/visit locks, expected versions,
plan hashes, idempotency and transaction rollback. Freshness additionally checks
the new extension implementation. Older assessments remain readable and require
a new preview/save before new decisions under the active service. The existing
database models store these snapshots; no migration or live record rewrite is
needed.

The saved RF models and datasets are unchanged. RF adapter version
`synthetic-screening-rf-adapter-2026-10-20-v2` explicitly abstains on the new
interaction rule, which was never part of its training labels. Provisional purpose
applicability remains separate. The doctor can independently select a candidate
made available by deterministic screening; RF cannot clear an exclusion. No
medical confidence, meaningful single-candidate ranking, clinician-labelled
training data or independent clinical validation is claimed. Real-patient
publication and dispensing remain unavailable.

A separate UI defect was corrected: selecting the already active patient/visit
now leaves its state intact. Previously redundant selection reset the local
history-pending flag and could prevent a reviewed visit from opening screening.
New patient/visit selections still reset the visit workflow.

## Verification

From `backend`, against in-memory SQLite only:

```powershell
..\.venv\Scripts\python.exe manage.py test medicine_knowledge.test_selected_interactions medicine_knowledge.test_patient_screening prescription_review --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment verify
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment verify
```

The 51 tests passed, including six focused extension tests. A fully specified
fictional current-paracetamol case produced **one available oseltamivir candidate
and four unavailable entries** after explicit pair review. Without that review it
remained withheld. Tests retained duplicate treatment, WHO exclusion, missing or
late onset, renal unknowns, vaccine caution, hospital/red-flag contexts and pending
knowledge reviews. Unsupported populations/products/history fail closed; forged
review fields and stale bindings are rejected. A saved assessment flowed through
the actual frozen RF API (interaction abstention), independent doctor selection,
approval and an approved-only A6 sample slip. The slip remains unpublished and
invalid for dispensing. Both frozen RF bundle verifications passed.

From `frontend`, with its development server running:

```powershell
node tests/six-condition-workspace.mjs
node tests/doctor-review.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The browser bridge intercepts API traffic and uses fictional in-memory records.
The expanded workspace test covers pair review without automatic confirmation,
the 1/4 result, retained duplicate exclusion, RF abstention and explicit independent
doctor approval. Existing condition, history, timeout/retry, mobile, records and
revoked-access checks remain. Targeted ESLint covers the modified frontend files.

Both browser regressions passed, as did TypeScript and targeted ESLint. The
workspace test also confirmed that repeated selection of the active patient/visit
preserves the existing preview. An authenticated, read-only inputs-view check for
the supplied consultation returned HTTP 200 with `selected_pair_review_offered`
true; captured SQL contained zero inserts, updates or deletes. This verifies that
the new UI review is offered for its saved history without fabricating a review
or claiming its unsaved clinical answers have passed.

The development backend was reloaded using the existing PostgreSQL configuration
and explicit synthetic-ML flag. Its health check reported PostgreSQL connected.
No live clinical answer, history, account or knowledge review was changed. The
new pair review must be performed by the doctor; it was not automatically filled.

## Main files

- `medicine_knowledge/selected_interactions.py`, `data/selected_interactions.json`:
  selected evidence, scope, strict review contract, binding and limited finding.
- `medicine_knowledge/selected_screening.py`, `screening_views.py`:
  active extension-aware previews, immutable saves, freshness and offered scope.
- `prescription_review/services.py`, `rf_inference.py`: extension-aware
  revalidation and explicit frozen-model interaction abstention.
- Frontend clinical API/types, PatientClinicalInputs, SixConditionDraftFlow,
  ScreeningNextActions and ClinicalScreeningResult: source review and provenance.
- `usePrescription.ts`: idempotent selection of the current patient/visit.
- Focused backend tests and the expanded six-condition browser regression.

Further work requires independently reviewed product/pair policies for additional
contexts and an explicit continuation/replacement approval workflow. This change
does not make an unsupported medicine available or manufacture missing safety data.
