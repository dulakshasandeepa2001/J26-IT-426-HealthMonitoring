# Step 9: expanded catalogue and six-condition backend screening

Implemented 2026-10-16. This is a source-based, deterministic candidate-support
prototype. It does not provide comprehensive safety clearance or independent
clinical validation. Existing offline Experimental ML artifacts are unchanged;
the new clinical endpoint does not use a model or train during requests.

## Coverage

There are **16 unique medicine/reference identities and 19 condition mappings**.
Paracetamol is shared across conditions and is counted once as an identity.
These are selected source-supported options, not an exhaustive formulary or a
claim that every option is appropriate for every patient.

| Condition | Candidates | Mapping count |
| --- | --- | ---: |
| Influenza | Paracetamol, oseltamivir, zanamivir, peramivir, baloxavir | 5 |
| Chickenpox | Paracetamol, acyclovir, calamine + zinc oxide, valacyclovir | 4 |
| Measles | Paracetamol, vitamin A | 2 |
| Mumps | Paracetamol, ibuprofen | 2 |
| Viral conjunctivitis | Carboxymethylcellulose, hypromellose | 2 |
| Viral gastroenteritis | ORS reference, loperamide, bismuth subsalicylate, zinc | 4 |

Seven have product references: the existing four pilot products,
carboxymethylcellulose, ibuprofen and hypromellose. Nine remain unavailable for
automatic regimen generation: ORS plus the eight additional reference-only
options. Those nine have no invented product strength, RxCUI or fallback dose;
their safety review cannot be accepted while coverage is incomplete.

The two new executable product references are ibuprofen 200 mg oral tablets
(NDC 63941-301; RxCUI 310965) and hypromellose 0.3% ophthalmic solution
(NDC 72094-001-03). The latter label lists RxNorm as out of scope, so its RxNorm
concept is null. Neither US reference establishes Sri Lankan product equivalence,
availability or registration. Rules require a real version-specific doctor review
and independent patient assessment before returning a candidate.

Treatment purposes remain distinct. Vitamin A and zinc are supervised/pediatric
management references, not interchangeable fever medicines. Antivirals,
symptom relief, lubrication and rehydration are separate roles. Multiple available
candidates in the same purpose/role group require clinician choice; this backend
does not automatically combine or rank them.

## Backend flow

1. Use the existing assigned doctor/consultation and Member 1 ingestion flow.
   Six canonical diagnoses are supported; differential diagnoses do not select
   medicines. The doctor confirms a diagnosis against the current analysis.
2. Reuse registered DOB for age. Missing/future DOB is not replaced with JSON
   age or an assumed adult age. The four added disease pathways are limited to
   independently assessed adult, mild/moderate outpatient contexts.
3. Review/save persistent allergies and current medicines for this visit using
   the existing patient-context endpoint. A previous visit's stored history is
   available but must be verified again; JSON mentions are unverified observations.
4. Fetch screening inputs. Required concerns start as null/unknown; review flags
   start false. Independently assess relevant symptoms, duration, red flags,
   care setting, severity and product-specific concerns. Do not submit default
   negatives simply to clear a check.
5. Preview. The server checks current product/rule reviews, age, independently
   verified facts, source concerns, allergy identity, duplicate ingredients,
   interaction coverage, contraindication/scope restrictions and dose limits.
   Missing/unsupported facts withhold candidates and return reasons.
6. Save a separate unapproved, private `PatientScreeningDraft` with the preview
   hash and revision. Changed evidence, history, DOB, knowledge or implementation
   requires a fresh preview. Reusing an identical request key is idempotent;
   changed input under the same key returns 409. Read APIs report stale drafts.

Positive source concerns/red flags cannot be cleared by submitting negative
checkboxes. New product handlers withhold whenever current medicines need
interaction review; no comprehensive interaction database is claimed. Existing
pilot handlers retain their existing conservative checks.

Oseltamivir needs an explicit source choice: `CDC_2026` for the encoded outpatient
pathway. WHO 2024 differs for non-severe influenza. `WHO_2024` or an unselected
guideline withholds this candidate; the system does not silently combine the
guidelines or let ML resolve their disagreement.

## API contract

All routes require an approved active assigned doctor, session authentication
and CSRF protection for POSTs. Responses are private/no-store. Age, patient
identity overrides, arbitrary medicines and extra fields are rejected.

| Method | Route under `/api/prescription/` | Use |
| --- | --- | --- |
| GET | `consultations/<uuid>/clinical-screening/inputs/` | DOB age, diagnosis IDs, unknown clinical template, unverified source observations and current binding values |
| POST | `consultations/<uuid>/clinical-screening/preview/` | Read-only candidate checks and a bound preview hash |
| POST | `consultations/<uuid>/clinical-screening/drafts/` | Save an immutable unapproved revision |
| GET | `six-condition-drafts/?consultation=<uuid>` | Doctor-scoped saved revisions |
| GET | `six-condition-drafts/<uuid>/` | Saved snapshot/result and freshness |

Preview body: `diagnosis_id`, `expected_context_updated_at`,
`expected_analysis_hash`, `clinical`. Start from `clinical_template` returned by
inputs; populate only independently verified facts. `condition_assessments` uses
the existing Member 1 concern keys but is independently verified, not copied
from the source observations. Duration values are hours. Review flags require
actual JSON booleans. Clinical contract: `medicine_knowledge/screening_contract.py`.

Save resubmits that same body plus `request_key` (UUID),
`expected_latest_revision` and `expected_plan_hash` from the preview. Preview
returns `plan_hash`, `expected_latest_revision`, registered age and `result`.
Saved drafts return their snapshot, result and `current_state`.

Results explicitly contain `model_used: false`, `approved: false`,
`published: false`, `prescription_eligible: false`, purpose groups, source
references and per-candidate reasons. A candidate status means it may be reviewed
by the clinician; it does not mean it is a finalized prescription.
No update/delete/approval/publication API was added.

## Files

- `medicine_knowledge/additional_candidates.py`: ten new source-backed scopes,
  exact product references where resolved, rule/version/provenance bindings.
- `medicine_knowledge/condition_knowledge.py`: bind the existing four additional
  scopes to the clinical adapter without modifying their content identity.
- `medicine_knowledge/screening_contract.py`, `screening_engine.py`,
  `patient_screening.py`, `screening_views.py`: strict inputs, deterministic
  checks, authorization, authoritative snapshots, previews, immutable saves.
- `medicine_knowledge/models.py`, `condition_views.py`, `urls.py`: draft model,
  version-aware review gates and private routes.
- `medicine_knowledge/migrations/0003_patient_screening_drafts.py`: one new table;
  no accounts, clinical history or legacy draft schema changes.
- `medicine_knowledge/management/commands/seed_six_condition_knowledge.py`:
  idempotent import; never creates doctor reviews.
- `medicine_knowledge/test_patient_screening.py`: 18 focused integration checks.
- Frontend `medicineApi.ts`, `AdditionalMedicineScopes.tsx`: nullable RxNorm/NDC
  display and reference-only names/safety-review blocks; existing page retained.
- Frontend `tests/expanded-knowledge.mjs`: mocked 16-entry catalogue verification.

## Exact local commands

From the repository root, enter `backend`, then use the existing virtualenv:

```powershell
Set-Location backend
..\.venv\Scripts\python.exe manage.py migrate medicine_knowledge 0003_patient_screening_drafts --plan
..\.venv\Scripts\python.exe manage.py migrate medicine_knowledge 0003_patient_screening_drafts --noinput
..\.venv\Scripts\python.exe manage.py seed_six_condition_knowledge
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe manage.py makemigrations medicine_knowledge --check --dry-run --settings=medicare_project.test_settings
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

The migration/import have been applied to this project connection. Four existing
additional scope rule bindings were updated; ten scopes were inserted. None of
these actions creates a doctor attestation. Unchanged imports preserve current
reviews; a genuinely changed rule binding needs review of that new version.

From `frontend` with its existing Next development server running:

```powershell
node tests/expanded-knowledge.mjs
node tests/condition-knowledge.mjs
node tests/prescription-drafts.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/AdditionalMedicineScopes.tsx src/features/prescription-intelligence/medicineApi.ts
```

Normal server commands from their respective directories (avoid duplicate
instances if ports are already in use):

```powershell
# backend
..\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
# frontend, a separate terminal
npm run dev
```

## Actual verification and preserved state

All **180 isolated backend tests passed**, including 18 new checks. They cover
all six diagnosis-to-preview/save flows, real non-demo Member 1 handoff,
permissions/CSRF, per-visit verification, missing/DOB/pediatric/unsupported
contexts, source concerns, identity/duplicate blocks, guideline selection,
current reviews, immutable versions, idempotency, stale inputs and no training
or clinical export during preview. Test doctor review decisions exist only in
the disposable in-memory test DB.

The expanded catalogue and existing condition-review browser checks passed,
including 16 identities, all 19 mappings, nine incomplete safety blocks, NDC-only
display and 390px layout. TypeScript, targeted ESLint, migration consistency
and frozen selected-model validation passed.

Before/after hashes of all existing MedicineEntry, MedicineReview, SafetyProfile,
SafetyReview and ConditionKnowledgeReview records are identical. All original
four condition-content hashes are unchanged. Account/consultation/context/
analysis/diagnosis/legacy-draft counts are unchanged. Existing four pilot content
and four pilot safety reviews remain current. The configured DB contains 14
condition scopes, zero condition-review attestations and zero new patient
screening drafts. No live patient records were copied into research data.

The previous offline ML comparison remains frozen: novel held-out agreement
10/16 (0.625), overall unique agreement 21/27, provisional rule-derived labels,
not clinically reviewed. Those results do not cover the expanded 16-entry
catalogue and are not clinical accuracy. No retraining or impressive replacement
metrics were manufactured for this backend step.

## Evidence and next integration

Evidence is recorded with source URL, known publication date (null if unknown),
access date, version and scope. The main source references are
[CDC influenza](https://www.cdc.gov/flu/hcp/antivirals/summary-clinicians.html),
[WHO influenza 2024](https://www.ncbi.nlm.nih.gov/sites/books/NBK607909/),
[CDC varicella](https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html),
[CDC measles](https://www.cdc.gov/measles/hcp/clinical-overview/),
[NHS mumps](https://www.nhs.uk/conditions/mumps/),
[CDC conjunctivitis](https://www.cdc.gov/conjunctivitis/treatment/index.html),
[NIDDK gastroenteritis](https://www.niddk.nih.gov/health-information/digestive-diseases/viral-gastroenteritis/treatment),
[WHO child diarrhoea guideline](https://www.who.int/publications/i/item/9789240103412),
[DailyMed ibuprofen](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=36b95840-f621-437a-bf49-406d320964da)
and [DailyMed hypromellose](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=2b5fc4c4-843c-8d3d-e063-6394a90a5a1b).

The Workspace integration is completed in [Step 9A](STEP9A.md), including
condition-specific assessments, unknown defaults, candidate exclusions, preview,
save and combined legacy/new Records. Resolve exact products and complete reviewed
rules for unavailable options separately. Keep ML offline/synthetic, review gates
intact and patient publication disabled.
