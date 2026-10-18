# Step 8F: six-condition medicine knowledge and completed-review reuse

Medicine Knowledge now lists six distinct candidate identities across the six
conditions. A current content or executable-rule review is shown as **Completed**
and its form stays closed. The doctor can deliberately use **Change content
review** or **Change safety rule review** to amend/reject a decision. Reloading,
opening another patient or signing in with another approved doctor does not
require a repeated review of the unchanged version.

## Additional coverage

| Condition | Medicine scope | Review / activation boundary |
| --- | --- | --- |
| Measles | Existing paracetamol reference, fever-relief mapping | Separate new condition scope; pilot reviews retained |
| Mumps | Existing paracetamol reference, fever/aches/jaw-pain mapping | Separate new condition scope; pilot reviews retained |
| Viral conjunctivitis | CMC sodium 0.5% ophthalmic solution, lubrication purpose | Source product SCD 1188426; separate new content/research-rule reviews |
| Viral gastroenteritis | ORS fluid/electrolyte-replacement planning identity | Exact product unresolved; no strength/RxCUI/composition/dilution/regimen invented; safety acceptance blocked |

The existing four pilot entries remain untouched. Paracetamol appears once in the
medicine list, with its condition scopes grouped below it. **Condition filter**
supports all six conditions. Its content-review filter evaluates the selected
condition scope, so a reviewed influenza mapping cannot imply a reviewed measles
mapping. Evidence, warnings, product identity, purpose, required assessments,
research parameters and the bound implementation are inspectable.

The four new scopes are imported from the unchanged frozen
[Step 8B knowledge bundle](STEP8B.md). They are stored in separate additive tables,
not inserted into or merged over already-reviewed pilot content. Their content
and safety decisions are independent, hash-bound audit records. A doctor must
actually record any new review; the import creates **zero doctor decisions**.

These are additional catalogue/research-rule review scopes. Even after both
reviews, `live_screening_enabled` remains false. Actual encounter screening and
automatic regimens still cover influenza/chickenpox. Further integration of the
new conditions requires the appropriate clinical inputs and rule pathway; this
page does not add clinical validation or patient-facing prescription publication.
ORS content can be inspected/reviewed as an unresolved reference, but its safety
review cannot be accepted while its exact product identity is missing.

## Review behavior fixed

- The old unconditional **Review both steps** prompt is replaced with actual
  content and rule status. A current review needs no new notes or checkbox.
- Both completed reviews display **Both reviews completed for this version**.
  The old save notification that always requested a separate safety review is
  replaced by a neutral content-save confirmation.
- Current review forms remain hidden until the doctor explicitly chooses Change.
  Reviewer, date, notes and history remain available. Rejected/pending versions
  retain their correction forms.
- A changed content binding, safety implementation or reviewer authorization
  still invalidates the affected decision. There is no expiry on each login or
  patient visit and no bypass for genuinely changed rules.
- New condition-scope decisions persist across refresh/session changes; identical
  already-current review submissions do not create duplicate attestations.
- Save failures retain notes. Scope access loss clears the catalogue. If only the
  supplemental service is temporarily unavailable, the pilot catalogue stays
  usable and an explicit additional-knowledge error appears.

## Changed files

Under `backend/medicine_knowledge/`:

- `models.py`: additive `ConditionKnowledge` and `ConditionKnowledgeReview` only;
  original entry/review behavior unchanged.
- `migrations/0002_condition_scopes.py`: create those two new tables.
- `condition_knowledge.py`: verify/reuse the frozen source bundle, assemble four
  scope definitions, bind rule implementation and import idempotently.
- `condition_views.py`, `urls.py`: approved-doctor list/detail, independent review
  actions and audit history; session authentication/CSRF/no-store.
- `management/commands/seed_condition_knowledge.py`: explicit import command;
  requests never seed or manufacture decisions.
- `test_condition_knowledge.py`: focused persistence, review reuse, stale inputs,
  scope/version isolation, permissions and unresolved-product protection.

Under `frontend/`:

- `src/features/prescription-intelligence/MedicineKnowledge.tsx`: combined catalogue,
  six-condition filtering, completed content-review presentation and real rule status.
- `SafetyRuleReview.tsx`: reuse current decisions, optional change form, green
  completed state and failed-refresh handling.
- `AdditionalMedicineScopes.tsx`: source-linked per-condition scope details,
  independent review forms/status and unresolved ORS handling.
- `medicineApi.ts`: additional scope and review contracts.
- `tests/condition-knowledge.mjs`: new expanded-page browser verification.
- `tests/medicine-knowledge.mjs`, `tests/prescription-drafts.mjs`: retain the existing
  flows while checking the intentional completed-form behavior.

Documentation: this file and the navigation notes in `STEP5.md` / `STEP6.md`.
The clinical engine, legacy catalogue/seeder, safety profiles/review bindings,
database settings, trained models and research datasets are unchanged.

## Setup and exact commands

The narrow migration and import have **already been applied** to the current
project database. The local backend was restarted to load the new routes.
Refresh `http://127.0.0.1:3000/doctor/medicine-knowledge` in an existing doctor
session; no account recreation or manual data import is needed.

For another checkout, from `backend` in VS Code PowerShell:

```powershell
..\.venv\Scripts\python.exe manage.py migrate medicine_knowledge 0002_condition_scopes --plan
..\.venv\Scripts\python.exe manage.py migrate medicine_knowledge 0002_condition_scopes --noinput
..\.venv\Scripts\python.exe manage.py seed_condition_knowledge
```

The reviewed plan contains **only two CreateModel operations**. Repeating the seed
with identical source content reports four unchanged scopes and preserves reviews.
No pilot reseed, review reset, model retraining or `.env` edit is required.

Verification from `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test medicine_knowledge.test_condition_knowledge --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe manage.py makemigrations medicine_knowledge --check --dry-run --settings=medicare_project.test_settings
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

From `frontend`, with the local Next development server running:

```powershell
node tests/condition-knowledge.mjs
node tests/medicine-knowledge.mjs
node tests/prescription-drafts.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/MedicineKnowledge.tsx src/features/prescription-intelligence/SafetyRuleReview.tsx src/features/prescription-intelligence/AdditionalMedicineScopes.tsx src/features/prescription-intelligence/medicineApi.ts
```

Actual results: **11 new checks**, **162 total isolated backend tests**, the
expanded-page browser checks and both existing browser flows passed. Checks
cover all six condition filters, reused completed reviews without extra POSTs,
new-scope isolation, refresh persistence, save failure recovery, current-review
amendment, ORS approval prevention, CSRF, revoked access and 390px layout.
The migration consistency check and frozen selected-model verification passed.

Before/after hashes of the **entire existing MedicineEntry, MedicineReview,
SafetyProfile and SafetyReview tables** are identical. Account, consultation,
patient-context and saved-draft counts are unchanged. The configured database now
has four new condition scopes and **zero fabricated doctor reviews**; all four
original content reviews and all four original safety-rule reviews remain current.

Next: integrate the extra condition-specific assessment fields and reviewed rule
pathway into encounter screening separately. Preserve the unresolved ORS block
until a verified exact product and appropriate rules are available. Do not treat
this page's review status as an ML label or independent clinical validation.

Implemented backend follow-up: [Step 9](STEP9.md) adds ten further candidates,
strict independent clinical assessments and private six-condition previews and
immutable draft APIs. The Workspace controls for that new API remain the next
integration step.
