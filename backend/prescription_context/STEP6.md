# Step 6: evidence-backed screening drafts and version history

This step connects Step 5 medicine knowledge to the visit workflow. It saves a
**rules-only, unranked, unapproved and unpublished screening draft**. [Step 6C](STEP6C.md)
adds automatic patient-specific selection and regimens for all four products. Model training,
prescription approval and publication remain later work.

## Demo flow

Current content and safety-rule reviews are reused across visits and sessions;
review each unchanged version once. Medicine Knowledge shows completed states
and opens a new decision form only when needed or explicitly requested. See
[Step 8F](STEP8F.md) for the additional condition scopes and their activation limits.

1. Sign in as an approved doctor. In **Medicine Knowledge**, inspect each relevant
   medicine's product, warnings and full evidence. Record a **content review**.
2. On that same medicine, inspect **Executable safety rules — separate review**,
   including scope, parameters, allergy names and evidence sections. Record the
   **safety rule review** with notes and evidence acknowledgement. A catalogue
   review alone does not enable this medicine for screening.
   The **1. Content review** and **2. Safety rule review** shortcuts at the top of
   the medicine detail jump directly to these forms. Both notes fields display
   the required minimum of 10 characters and the current character count.
3. Open **Prescription Workspace**, select the assigned registered patient and
   visit. Review/save allergies and current medicines for this visit. DOB and
   completed age come from registration; voice-reported patient notes remain
   unverified until the doctor reviews them.
4. Load a demo analysis or use the received Component 1 result. Confirm the visit
   diagnosis. The pilot supports only Influenza and Chickenpox. Unsupported
   diagnoses and differentials are not used as alternative treatment inputs.
5. Complete the **Doctor-verified clinical inputs**. Keep unknown facts Unknown.
   Onset is manually verified symptom onset for influenza or rash onset for
   chickenpox. Assess red flags, renal context, hepatic/alcohol risk and special
   populations; influenza also asks for live intranasal vaccine timing, and
   chickenpox asks for the relevant varicella risk-group indication.
6. Verify the prefilled symptom targets/durations, then inspect the automatically
   selected plan. Only applicable medicines with current reviewed rules and
   sufficient clinical facts are selected. Regimens display fixed-course or
   as-needed instructions as appropriate; no manual dose fields are required.
   Excluded products display their reasons. Pediatric checks may require newly
   measured weight; an old patient-context weight is not substituted.
7. Acknowledge the clinical inputs, then **Generate Prescription Draft**. Read
   each finding and evidence reference. Missing information withholds selection
   and is recorded among exclusions; a zero-medicine plan is possible. A draft
   is not a safety clearance.
8. Edit clinical inputs and generate a new version to rerun checks.
   Earlier versions retain their original snapshots. Reload restores saved
   versions and resets the clinical acknowledgement. **Prescription Records**
   also lists your authorized drafts and their current/historical state.

All four rule profiles are imported **pending**. Setup never records a clinician
review. A doctor must separately review catalogue content and the executable
rules before a medicine is included. Unreviewed entries are shown as omitted.

## What is screened

| Area | Implemented behavior |
| --- | --- |
| Identity | Exact supported current-medicine aliases; unresolved names require clarification. Ingredient identity never establishes product strength. |
| Allergy | Exact supported ingredient names, optionally followed by a reaction in parentheses. Acyclovir includes label-linked valacyclovir hypersensitivity. Unknown/unmapped histories are not cleared. |
| Duplicates | Matching current ingredient blocks a candidate. Continuation/replacement decisions are outside this step. |
| Interactions | Unknown/unrecognized medicines cannot be cleared. Recognized medicines still require broader clinician review. Only selected label cautions are encoded. |
| Clinical scope | Reported red flags block this limited outpatient screening. Unknown assessments and specialist contexts cannot be validated. |
| Age | Registered DOB, calculated as completed years in Asia/Colombo. Missing/future DOB never uses a cached or guessed age. |
| Dose | Automatic regimens for all four current products: fixed antiviral courses, oral PRN paracetamol limits and qualitative topical PRN calamine. Unsupported weight, formulation or renal-adjustment contexts cannot be validated. |
| Evidence | Product, rule version, source URLs/sections, clinical inputs, analysis and findings are archived with each draft. |

Finding meanings are **Passed selected check**, **Doctor review needed**,
**Blocked**, and **Cannot validate**. The most restrictive finding determines a
candidate's displayed status; all individual findings remain visible. Every
candidate retains a coverage warning for excipients, comprehensive interactions
and local product suitability, even if the selected checks pass.

## Encoded product scope

- **Oseltamivir 75 mg capsule:** selected uncomplicated influenza treatment rule,
  standard renal context, within the label's 48-hour initiation window. The
  label's age/weight expression is checked against this exact strength. Lower
  pediatric dose bands require a different reviewed strength/formulation and
  therefore remain Cannot validate for this capsule. Infants, prophylaxis,
  adjusted renal dosing and suspension concentrations are outside this profile.
- **Acyclovir 800 mg tablet:** selected chickenpox rule, standard renal context,
  within the 24-hour selected window and an applicable doctor-confirmed risk
  group. Typical uncomplicated varicella in otherwise healthy children is
  blocked under the CDC guidance used here. The adult threshold of 18 years is
  an explicit conservative pilot policy; it is not presented as a label age
  restriction. Younger supported patients use the label weight expression.
- **Paracetamol 500 mg tablet:** age at least 12, verified fever/body aches and
  duration, standard assessed hepatic/alcohol and renal pilot context; selected
  product PRN directions and daily limits, allergy/duplicate and warfarin checks.
- **Calamine/zinc oxide lotion:** verified itching/duration and external-use
  suitability, conservative pilot age at least 2. Qualitative PRN instructions;
  the source does not specify a fixed numerical dose, daily frequency or course.

An onset outside the selected window means **outside this profile / Cannot
validate**, not a universal contraindication. Broader indications require a
different reviewed policy. Unknown special-population context never implies
standard context.

The Member 1 sample reports three days of influenza symptoms, penicillin rash
and paracetamol SOS. Those extracted notes do not overwrite the verified patient
record. If the doctor confirms those facts, a 72-hour onset lies outside the
selected antiviral window, unsupported allergy names require clarification, and
current paracetamol produces a duplicate finding for that candidate. Do not
change reported facts merely to obtain a passing screen; use a separate,
explicitly synthetic scenario when demonstrating a different clinical case.

## Primary evidence

Numerical and precaution sections were checked on 2026-10-14. Rule JSON stores
the specific sections separately from the earlier catalogue summary references.

- [TAMIFLU label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b): sections 2.2/Table 1, 2.4, 4 and 7.1.
- [Acyclovir tablets label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=05f42300-2a06-45f1-a9b9-6e5c84ae58ec): contraindications, precautions, chickenpox dosing and renal modification.
- [CDC varicella clinical guidance](https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html): acyclovir risk groups, timing and uncomplicated healthy children.
- [Acetaminophen product label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee): selected Drug Facts warnings and visually verified [directions image](https://dailymed.nlm.nih.gov/dailymed/image.cfm?name=aceta-500mg-directions.jpg&setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee).
- [Calamine product label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4a79259e-64ac-d187-e063-6294a90a78db): topical uses, warnings and directions.

These linked product labels do not establish suitability of a local brand or a
complete patient-specific prescribing policy. Executable rule review remains a
separate recorded clinical decision.

## API and persistence

All endpoints require an active approved doctor session, use no-store responses,
and require CSRF for writes:

- `GET /api/prescription/safety-profiles/` (optional `?medicine=<slug>`), detail,
  and `/<slug>/history/`.
- `POST /api/prescription/safety-profiles/<slug>/review/`: decision, notes,
  evidence acknowledgement, expected content hash and expected update time.
- `GET /api/prescription/drafts/` (optional `?consultation=<uuid>`) and detail.
- `POST /api/prescription/drafts/generate/<consultation-uuid>/`: request UUID,
  confirmed diagnosis ID, expected context timestamp/latest draft revision,
  verified clinical inputs and selection mode. The workspace uses `automatic`
  with empty client proposals and the reviewed preview's plan hash; the server
  derives applicable medicines/regimens and rejects changed preview evidence.
- `POST /api/prescription/drafts/regimens/<consultation-uuid>/`: read-only preview
  using the confirmed diagnosis, expected context timestamp and current clinical
  inputs. A preview never acknowledges a regimen or writes a draft.

Patient and doctor identity are derived from the authorized consultation, not
accepted from request data. Immutable drafts are scoped to their own doctor and
patient/consultation link. Generation locks the visit and patient, checks the
current context review and analysis reference, and saves the snapshot/result
atomically. An unchanged request UUID/body retry returns the same draft; changed
inputs with a reused key or outdated version/context return HTTP 409.

Rule reviews bind content to the medicine hash and engine digest. The digest
covers executable rules, profiles, contracts, services, review gates, identity
normalization and DOB calculation. Changes invalidate earlier executable
reviews. Catalogue/rule review changes, registered DOB/context changes, analysis
or diagnosis changes, a later screening date, or a newer draft version mark a
saved draft historical/stale without rewriting its evidence.

There are no draft update/delete, prescription approval or publication endpoints
in this step. Failed requests retain form inputs; revoked access clears displayed
draft data.

## Database setup

The separate `prescription_drafts` app adds only **SafetyProfile, SafetyReview and
PrescriptionDraft**. The existing consultation app is unmigrated; UUID binding
is enforced by server checks and scoped queries, without altering its tables.

```powershell
# From backend; the plan must contain only the three new models
..\.venv\Scripts\python.exe manage.py migrate prescription_drafts 0001_initial --plan
..\.venv\Scripts\python.exe manage.py migrate prescription_drafts 0001_initial
..\.venv\Scripts\python.exe manage.py seed_safety_profiles
```

Reimport is idempotent. Changed profile/medicine content resets the rules to
pending and archives an import record; code changes invalidate prior rule reviews
even when JSON content is unchanged. Existing accounts, patient information,
analyses and diagnoses are not seeded or altered by setup.

The targeted migration and import have been applied to the current project
database. Verification found **4 profiles, all pending, 0 current rule reviews**.
No real patient screening draft or clinician decision was inserted by setup.

## Verification

```powershell
# From backend: isolated SQLite test database, never the configured database
..\.venv\Scripts\python.exe manage.py test prescription_drafts prescription_context medicine_knowledge --settings=medicare_project.test_settings --noinput

# From frontend with the Next development server running; HTTP APIs are mocked
npx tsc --noEmit
npx eslint src/features/prescription-intelligence src/app/doctor/prescription-records/page.tsx
node tests/prescription-drafts.mjs
node tests/medicine-knowledge.mjs
node tests/prescription-encounters.mjs
node tests/component1-analysis.mjs
node tests/member1-adapter.mjs
```

Backend tests cover immutable persistence, retries/version conflicts, doctor
scope/CSRF, stale knowledge/context, explicit rule reviews, unknown histories,
duplicate/allergy matches, numeric units/frequency/duration, pediatric
weight/formulation boundaries, and chickenpox risk-group/cross-allergy checks.
The new browser checks use the actual Python adapter/rule engine with isolated
fixtures and mocked APIs, including review gates, save failures, rapid clicks,
version refresh/history, patient isolation, stale inputs and mobile layout.

Current verification is documented in [Step 6C](STEP6C.md): **126 backend tests**,
the automatic-plan browser flow, TypeScript and targeted ESLint passed. The
new app has no outstanding model migrations. Both the local workspace route
and database health check returned 200.

Next: clinician decisions and approval/version validation; ML ranking requires
a separately designed dataset, training and evaluation workflow.
