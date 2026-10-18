# Step 9C: doctor-confirmed patient-history identities

Implemented 2026-10-17 after [quick review](STEP9B.md). This addresses unresolved
history identities without deleting real allergies/medicines or treating unknown
information as safe. The six-condition screening engine is now
`six-condition-patient-screening-2026-10-17-v2`.

## Doctor workflow

1. In Workspace, open **Patient allergies and current medicines**. Retain the
   original recorded text and its Known/None/Unknown status.
2. Under **Confirm recorded identities**, check the proposed allergen identity
   and reaction. Select **Unresolved** if it has not been established. Reaction
   date is optional and cannot be a future date. An identity selection does not
   diagnose, disprove or remove an allergy.
3. Select the exact current medicine product only after checking its ingredient,
   strength, form and route. Record the reported schedule separately, leaving it
   blank if unknown. Only exact product aliases can propose a product; an
   ingredient-only name or text such as `Paracetamol 500mg SOS` cannot infer one.
   For a non-exact name, record at least 10 characters explaining how the product
   was clarified with the patient. The original text stays in the history.
4. Tick the existing per-visit history review checkbox and **Save patient
   information**. Resolved identities, reaction and schedule persist on refresh
   and returning visits. Each visit still requires history review.
5. Confirm the clinical summary again, choose the appropriate influenza guideline
   if relevant, and preview. A history change invalidates previous inputs/plans.

An unsupported allergy/product remains unresolved. Do not select an unrelated
identity or mark a real allergy/current medicine absent to enable a candidate.

## Implemented boundaries

- Patient history remains a string-list API for compatibility. Optional
  `history_details` contains one bound row per original entry, with separate
  identity/reaction/date or product/schedule/clarification fields. The existing
  provenance JSON stores the version, validated details and server-derived
  doctor, visit and time. No database migration is required.
- Save rejects unbound text/order, arbitrary provenance/reviewer fields,
  unsupported selections, contradictory recognized identities, stale product
  hashes and missing clarification for non-exact products. Changing raw history
  without supplying fresh details removes stale resolutions. Previous and new
  identity snapshots are retained in the existing context revision audit.
- Matching is exact and intentionally small. Penicillin is supported as a
  recorded identity; the original allergy and reaction remain present. Selected
  ingredient/cross-hypersensitivity checks remain distinct from comprehensive
  cross-reactivity, excipient clearance or allergy delabelling. Other unsupported
  identities remain unknown rather than becoming safe.
- Product hashes bind ingredient, strength, form, route, aliases and product
  reference. Changed/missing products become unresolved at screening. An
  ingredient match cannot supply a strength or formulation automatically.
- Existing contraindication/allergy blocks, duplicate ingredients, renal/hepatic
  scope, onset, red flags, guideline selection and unsupported-product blocks
  remain. Medicine recognition does not provide comprehensive interaction
  clearance. In particular, a current Paracetamol product still blocks another
  Paracetamol candidate; continuation/replacement and independent pair-review
  workflows are not implemented by this change.
- New history decisions are applied in the six-condition clinical adapter. The
  legacy draft engine and frozen synthetic experiments remain unchanged. No
  model training or patient data enters the research datasets.
- Failure to fetch optional identity choices retains ordinary history editing
  and cannot grant clearance. Authorization failures trigger private-state
  clearing. Save retains the existing assignment, CSRF and stale-write guards.

## Evidence and review versions

The recording design draws on [NICE CG183 documentation recommendations](https://www.nice.org.uk/guidance/cg183/chapter/recommendations).
The limited penicillin identity is documented alongside [CDC's allergy-history
assessment guidance](https://www.cdc.gov/antibiotic-use/hcp/clinical-signs/).
These sources do not validate this software, justify delabelling, or establish
that every other product is safe. Candidate-specific references and limitations
remain visible in the existing screening results.

The identity policy and source links are inspectable in Medicine Knowledge.
Its code and adapter are included in executable review hashes. This is a relevant
safety implementation change, so prior safety reviews become outdated and need
a genuine doctor review of the current implementation. Old decisions remain in
the audit; unchanged medicine content reviews are retained. No clinician review
or approval is created automatically.

After the code update, refresh imported scope rule bindings using this command
from `backend` (this updates knowledge versions, not patient records):

```powershell
..\.venv\Scripts\python.exe manage.py seed_six_condition_knowledge
```

Then review the applicable current safety rules in Medicine Knowledge. Reference
products lacking executable coverage remain blocked even after content review.

## Changed implementation files

Backend:

- `prescription_context/history_identity.py`: exact identity options, strict raw
  bindings, product fingerprints, provenance use and review policy.
- `prescription_context/serializers.py`, `views.py`: optional strict details,
  authorized options endpoint, save and immutable before/after identity audit.
- `medicine_knowledge/screening_engine.py`, `patient_screening.py`: use confirmed
  identities without clearing independent safety obstacles.
- `medicine_knowledge/additional_candidates.py`, `condition_knowledge.py`:
  bind and expose the new identity policy in versioned condition rules.
- `prescription_drafts/profiles.py`, `views.py`: include implementation in review
  hashes and expose policy for inspection. The legacy engine file is unchanged.

Frontend under `src/features/prescription-intelligence/`:

- `HistoryIdentityEditor.tsx`, `PatientContextForm.tsx`, `prescriptionApi.ts`:
  separate recorded text, identities, reaction/date and schedule/clarification.
- `HistoryIdentityPolicy.tsx`, `SafetyRuleReview.tsx`,
  `AdditionalMedicineScopes.tsx`, `draftApi.ts`, `medicineApi.ts`: inspect the
  policy and sources when reviewing current rule versions.
- `SixConditionDraftFlow.tsx`: actionable history links and remaining-block
  explanations beside preview results.

Verification files: `backend/prescription_context/test_history_identity.py`,
`test_patient_context.py`, `backend/medicine_knowledge/test_patient_screening.py`,
`frontend/tests/six-condition-workspace.mjs`, and `prescription-encounters.mjs`.

## Exact verification commands

From `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

From `frontend`, with the local Next server running:

```powershell
node tests/six-condition-workspace.mjs
node tests/prescription-encounters.mjs
node tests/quick-review-data.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/PatientContextForm.tsx src/features/prescription-intelligence/HistoryIdentityEditor.tsx src/features/prescription-intelligence/HistoryIdentityPolicy.tsx src/features/prescription-intelligence/prescriptionApi.ts src/features/prescription-intelligence/SixConditionDraftFlow.tsx src/features/prescription-intelligence/SafetyRuleReview.tsx src/features/prescription-intelligence/AdditionalMedicineScopes.tsx src/features/prescription-intelligence/draftApi.ts src/features/prescription-intelligence/medicineApi.ts
```

The backend and browser integration tests use fictional contexts in in-memory
SQLite. The encounter regression test intercepts all backend requests, including
an identity-metadata failure case. No real patient records are edited by tests.
No account, database configuration, prescription approval or publication changes
are part of this work.

Actual verification: **188 backend tests passed**. The six-condition browser
suite passed, including real identity save/reload with `Penicillin (Rash)` and
`Paracetamol 500mg SOS`, separate reaction/schedule preservation, and retained
duplicate/interaction obstacles. Encounter regression, quick-review helper
checks, TypeScript and targeted ESLint passed. Frozen experimental-model
validation passed without retraining. These are software tests, not clinical
validation.

Local setup: the scope import updated 4 existing scope rule versions and 10
additional candidate rule versions. A transaction checked that imported medicine
content was identical and that account/clinical/audit/review record counts and
catalogue content review fields stayed unchanged. No review decisions were
created. The Django development server was restarted to load the new endpoint.
Applicable safety reviews now require a genuine current-version doctor review;
content reviews remain retained.
