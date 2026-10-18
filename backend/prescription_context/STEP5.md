# Step 5: medicine catalogue, evidence and clinician content reviews

[Step 11](STEP11.md) adds exact consultation-link selection and a clearer
returning-patient history prefill. The appointment service can open a saved visit;
its upstream scheduling integration remains separate.

Current page update: [Step 8F](STEP8F.md) adds the remaining four condition scopes
to Medicine Knowledge and reuses completed content/safety reviews. Existing
reviewed pilot entries are preserved; new scopes have independent real review
records, and unresolved ORS cannot receive safety acceptance. Live encounter
screening remains the two-condition pilot.

Later offline research work is documented in [Step 7A](STEP7A.md) (initial
synthetic batch) and [Step 7B](STEP7B.md) (experimental fitted model). Neither
provides independent clinical validation. The
[six-condition scope/evidence plan](../../docs/research/SIX_CONDITION_SCOPE_EVIDENCE_2026-10-16.md)
documents the proposed four-condition expansion; it does not enable new uses
or change catalogue/rule reviews.

[Step 8A](STEP8A.md) implements the six-condition **2.1 analysis handoff** and
synthetic doctor demos. Live medicine screening covers the original two
conditions; the new four show treatment support pending.

[Step 8B](STEP8B.md) stages the expanded catalogue and explicit deterministic
rules **offline**, with source provenance, unknown handling and an unresolved ORS
identity block. It does not import pending content into the live doctor workflow.

[Step 8C](STEP8C.md) creates a small six-condition synthetic relevance dataset:
60 contexts / 360 candidate rows, provisional rule-derived labels, independent
safety outcomes, family splits and explicit input-overlap reports. No model is
fitted or live workflow enabled by this dataset stage.

[Step 8D](STEP8D.md) trains and compares three compact offline models, freezes the
validation-selected categorical tree and reports held-out errors/overlap. The
saved artifacts and opt-in synthetic CLI remain Experimental ML / not_reviewed;
the doctor UI and clinical publication flow are not enabled by this comparison.

[Step 8E](STEP8E.md) adds a default-off, read-only **Experimental ML** panel for
assigned synthetic demo consultations. It loads the frozen six-condition model
for fictional fixtures only, with provenance, limits and unchanged independent
deterministic findings. It does not use the registered patient's clinical inputs.

The Medicine Knowledge page now reads a persisted pilot catalogue from Django.
The initial four entries cover influenza/chickenpox and all start **Pending review**.
Importing evidence does not create a clinician review or prescribe a medicine.

## Doctor workflow

1. Sign in with an active, approved doctor account; open **Medicine Knowledge**.
2. Search by generic name or a supported alias; filter by pilot condition or review status.
3. Select an entry to inspect its ingredients, strength, form, route, product RxCUI,
   condition mapping, scope, selected warnings, source links and source/access dates.
4. Open the evidence references and review the full source information. Product
   strength is catalogue identity, not an automatically selected dose.
5. Enter review notes (10–2000 characters). To choose **Content reviewed**, explicitly
   acknowledge checking the evidence, formulation, warnings and pilot scope.
6. Select **Save content review**. The backend records the logged-in doctor,
   timestamp, exact content version and decision. Refresh to verify persistence.
7. Use **Reject content** or **Return to pending** when correction/review is needed.
   **Load review history** displays previous decisions and import records.

No Django staff account is required. Only approved doctors may read or review
this catalogue. It is shared reference content, independent of patient visits.
The application records a doctor's content review; it does not independently
verify that the reviewer opened or clinically validated an external source.

## Initial evidence and scope

The structured source file is `medicine_knowledge/data/pilot_catalogue.json`.
Short summaries were checked against the following primary sources on **2026-10-13**:

| Catalogue product | Identity source | Pilot scope |
| --- | --- | --- |
| Paracetamol / acetaminophen 500 mg tablet | [DailyMed label and RxNorm mapping](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee) | Symptom relief; influenza mapping is explicitly a symptom mapping, not an influenza indication |
| Oseltamivir 75 mg capsule | [Tamiflu prescribing information and RxNorm mapping](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b) | Influenza label information; formulation/onset and patient factors need review |
| Acyclovir 800 mg tablet | [DailyMed label and RxNorm mapping](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=05f42300-2a06-45f1-a9b9-6e5c84ae58ec) | Chickenpox label information, constrained by clinical guidance |
| Calamine 8% + zinc oxide 8% lotion | [DailyMed product label and RxNorm mapping](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4a79259e-64ac-d187-e063-6294a90a78db) | Chickenpox symptom mapping comes from CDC; this label's uses concern poison ivy/oak/sumac |

[CDC chickenpox treatment guidance](https://www.cdc.gov/chickenpox/treatment/index.html)
supports the ingredient-level symptom mappings. The
[CDC clinical guidance](https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html)
provides limits for the antiviral mapping. The
[FDA acetaminophen page](https://www.fda.gov/drugs/safe-use-over-counter-pain-relievers-and-fever-reducers/acetaminophen)
supports paracetamol/APAP name equivalence. These references do not establish
Sri Lankan product availability, local approval or a complete prescribing protocol.

The catalogue retains the distinction between label indications, guidance, and
pilot symptom mappings. It has selected informational warnings, not executable
interaction/dose rules. No dose schedule, trained ML model, measured ranking
performance, patient-specific eligibility, prescription generation or publication
is implemented by Step 5.

## Medicine name checks

Use **Check a medicine name** on the catalogue page, or **Check medicine names**
beside the current medicines field in Prescription Workspace. Checks never save
or replace patient context and do not assess clinical safety.

- Case and repeated whitespace are normalized; all other matching is exact.
- A supported ingredient name such as `paracetamol` is recognized, but strength
  and form still need clarification. No product RxCUI is inferred from it.
- An exact product alias such as `paracetamol 500 mg tablet` returns the listed
  product concept. It does not declare that medicine safe for the patient.
- Unknown brands, spelling errors, combination variants, unsupported strengths,
  or extra schedule text require clarification; no substring/fuzzy inference runs.
- Multiple matching entries are ambiguous and require an explicit product choice.
- Recognized names may still refer to pending/rejected catalogue content. Only
  a current clinician-reviewed version passes the future content gate.
- Editing the input or changing visits clears previous name-check results.

The identifiers were verified against source label RxNorm mappings. No live
RxNav/openFDA dependency or broad brand/formulation resolver is claimed.

## Version and access rules

Session authentication, approved-doctor authorization and CSRF protect writes.
Client-supplied reviewer IDs, timestamps, status shortcuts or content replacement
are rejected. The content hash and exact `updated_at` token prevent a stale review
from replacing a newer decision (HTTP 409). Failed writes retain UI notes; review
and audit save atomically. A logged-out/revoked session clears catalogue UI state.

The import command is idempotent: identical entries preserve reviews. A changed
content version returns to pending and archives the new import; earlier review
records retain their full evidence/content snapshot. If the reviewing doctor's
approval/activity/role changes, or stored content is changed outside the import
path, it no longer passes the content review gate. Later generation can call
`medicine_knowledge.services.reviewed_entries()`; that gate checks content review
only and must be followed by patient-specific safety validation.

## API

All routes are under `/api/prescription/medicines/`:

- `GET /` — catalogue entries and current effective review state.
- `GET /<entry-id>/` — one entry.
- `GET /<entry-id>/history/` — immutable content decision history.
- `POST /<entry-id>/review/` — decision, notes, `evidence_checked`,
  `expected_content_hash`, `expected_updated_at`. Actor/time are server-derived.
- `POST /normalize/` — `{ "names": ["paracetamol", "paracetamol 500 mg tablet"] }`.
  Response separates ingredient/product identity and clarification; `safety_assessed`
  is always false in this step.

No general catalogue create/update/delete API is exposed. Update the reviewed
source file and rerun the import command when maintaining this initial pilot.

## Database and setup

The separate `medicine_knowledge` app adds only the new catalogue and review
tables. Its targeted initial migration does not alter accounts or prescription
tables. Initial content is imported once into the configured database; it is not
read from Downloads or recreated on each API request.

```powershell
# From backend; inspect the narrow migration plan before applying it
..\.venv\Scripts\python.exe manage.py migrate medicine_knowledge 0001_initial --plan
..\.venv\Scripts\python.exe manage.py migrate medicine_knowledge 0001_initial
..\.venv\Scripts\python.exe manage.py seed_medicine_catalogue
```

These setup commands have been applied to the current local project connection.
No accounts, patient context, analyses or prescription records were inserted by
this step. All seeded catalogue entries remain pending until a doctor acts.

## Verification

```powershell
# Backend tests use SQLite in memory, not the configured live database
..\.venv\Scripts\python.exe manage.py test medicine_knowledge prescription_context --settings=medicare_project.test_settings --noinput

# From frontend with the Next development server running; backend calls are mocked
node tests/medicine-knowledge.mjs
node tests/prescription-encounters.mjs
node tests/component1-analysis.mjs
```

Checks cover source validation, pending/idempotent import, version changes,
doctor permissions/CSRF, forged actors, stale reviews, atomic audit, revoked
reviewers, unknown/ambiguous identities, review persistence, failure recovery,
input changes, and desktop/mobile UI. TypeScript and targeted ESLint checks cover
the changed frontend files.

Next: [Step 6](STEP6.md) connects reviewed catalogue entries and separately
reviewed executable rules to saved screening drafts and version history.
[Step 6C](STEP6C.md) documents the current automatic patient-specific medicine plan.
ML ranking and prescription approval remain separate later work.

[Step 9](STEP9.md) adds the expanded 16-entry catalogue and a separate
six-condition backend preview/save pathway; it documents pending product/rule
coverage and the remaining Workspace integration.

[Step 9A](STEP9A.md) completes the six-condition Workspace preview/save flow and
connects both new and existing drafts to Prescription Records.

[Step 9B](STEP9B.md) adds a prepared patient summary, missing-question quick
review, full correction editor and explicit per-visit confirmation.

[Step 9C](STEP9C.md) adds separate doctor-confirmed history identities,
reaction/schedule details, provenance and current-version safety review bindings.

[Step 10](STEP10.md) connects saved screening drafts to synthetic Experimental ML
proposals, recorded doctor edit/approve/reject decisions and an approved-only A6
research-demo print view.
