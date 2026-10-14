# Step 6C: automatically selected patient-specific medicine plans

The workspace now selects applicable medicines and their regimens on the server.
There are no manual medicine-dose fields in this flow. It covers **all four
current catalogue products**, for the confirmed Influenza/Chickenpox pilot.
The output remains an unranked, unapproved, unpublished screening draft.

## Doctor workflow

1. In **Medicine Knowledge**, inspect the source evidence and ensure both the
   **content review** and **safety rule review** are current for each medicine.
   Version `pp1-rules-2026-10-14-v3` was imported for all four profiles; all four
   are pending until a doctor reviews them. Existing catalogue content decisions
   remain available. Importing rules does not record a clinical decision.
2. In **Prescription Workspace**, select the assigned patient and visit. Review
   and save allergies/current medicines for this visit. Registered DOB supplies
   completed age; a cached age or weight is never substituted.
3. Load the Component 1 result and confirm the diagnosis. The same flow works
   with the existing flat demo samples and the Member 1 nested JSON adapter.
4. Assess red flags, renal/hepatic context, special populations and the relevant
   diagnosis-specific fields. Verify onset for the selected antiviral window.
   For chickenpox, assess the antiviral risk-group indication and topical-use
   suitability. Keep unknown facts **Unknown**.
5. Check **fever**, **body aches** and **itching**, and their durations in hours.
   Positive supported symptoms and durations from Component 1 prefill these
   clinical fields, but remain unverified. Correct them as necessary and check
   **I verified these symptom targets and durations**. These are patient facts,
   rather than medicine amount/frequency inputs.
6. Inspect **Automatically selected medicines**. Each selected product displays
   its automatic regimen, source links and rule version. **Medicines not
   selected for this patient** explains missing indication, unsupported scope,
   missing facts, allergy/duplicate findings or other selection obstacles.
7. Acknowledge the clinical inputs and displayed plan, then click **Generate
   Prescription Draft**. Changes reset this acknowledgement and recalculate the
   plan. Failed or pending previews disable generation and hide obsolete plans.
8. Generate a new version after changed facts. Earlier versions preserve their
   original selected medicines, exclusions, clinical facts and evidence.
   **Prescription Records** displays the same immutable saved plans.

No medicine is added merely because it belongs to a disease. Only a current
reviewed product with an applicable regimen and no unresolved selection obstacle
is selected. A plan can contain **zero medicines**; its recorded exclusions
explain why. Omitted unreviewed products are also displayed separately.

## Regimens and boundaries

| Current product | Automatic expression | Required patient-specific scope |
| --- | --- | --- |
| Paracetamol 500 mg tablet | 1000 mg orally **as needed**, at least 6 hours apart, at most 3 doses / 3000 mg per 24 hours; no fixed course | Age at least 12, verified fever/body aches and durations within the selected label review windows, standard assessed hepatic/alcohol and renal pilot context |
| Oseltamivir 75 mg capsule | 75 mg orally twice daily for 5 days | Applicable confirmed influenza, selected onset within 48 hours, standard renal context, assessed intranasal live-vaccine timing and matching product/age/weight band |
| Acyclovir 800 mg tablet | 800 mg orally four times daily for 5 days | Applicable confirmed chickenpox risk group, selected onset within 24 hours, standard renal context and matching product/age/weight expression |
| Calamine 8% + zinc oxide 8% lotion | **As-needed topical instructions**; amount, unit, daily frequency and course remain null | Verified itching/duration, standard external-use/eye-area assessment and conservative pilot age at least 2 |

Paracetamol follows the selected product's directions, including its lower
3000 mg/day limit. Fever beyond 3 days or aches beyond 10 days require
individualized reassessment under this profile. Calamine uses the label's
as-needed directions and 7-day reassessment warning: its label does not specify
a fixed numeric amount or course. Reassessment days are **not prescribed course
lengths**. Calamine's minimum pilot age is an explicit conservative policy, not
a label age restriction.

The current capsule/tablet antiviral rules withhold doses requiring another
strength or formulation. Pediatric calculations require newly measured weight
where applicable; old patient-context weight is not used. Acyclovir's adult
threshold of 18 is an explicit conservative pilot policy. Typical uncomplicated
varicella in otherwise healthy children does not receive routine oral antiviral
selection under the CDC guidance used here.

Unknown facts, red flags, unresolved medicine/allergy names, matching ingredient
allergies, duplicate current ingredients, relevant unresolved cautions and
unsupported specialist contexts withhold automatic selection. Current-medicine
continuation/replacement and broader antiviral indications are outside this
flow. Coverage and applicable topical precaution findings remain visible in
selected drafts; an available plan does not establish comprehensive safety.

The supplied Member 1 example reports symptoms for three days and paracetamol
SOS. Source notes do not overwrite doctor-verified context. If confirmed,
72-hour onset lies outside this selected influenza antiviral window, and current
paracetamol produces a duplicate finding. Preserve the patient's actual facts.

## Evidence

Primary source directions and cautions were checked on **2026-10-14**. Rule JSON
archives the exact source sections, medicine hash and rule version.

- [Acetaminophen product label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee) and its [directions image](https://dailymed.nlm.nih.gov/dailymed/image.cfm?name=aceta-500mg-directions.jpg&setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee): the image was visually inspected for the quantitative directions.
- [Calamine product label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4a79259e-64ac-d187-e063-6294a90a78db): external-use precautions and as-needed directions.
- [CDC chickenpox treatment](https://www.cdc.gov/chickenpox/treatment/index.html): itching-relief mapping for calamine.
- [TAMIFLU label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b): section 2.2/Table 1 and relevant renal/vaccine precautions.
- [Acyclovir tablets label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=05f42300-2a06-45f1-a9b9-6e5c84ae58ec) and [CDC varicella clinical guidance](https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html): dose expression, risk groups and selected timing.

These are reviewed pilot product rules, rather than a complete local prescribing
protocol or a trained ML model. Adding future catalogue products requires their
own evidence-backed policies and clinician reviews.

## API, persistence and review integrity

The read-only CSRF-protected preview remains
`POST /api/prescription/drafts/regimens/<visit-uuid>/`. Clinical inputs now also
include `verified_symptoms`, `symptoms_reviewed`, `symptom_durations` (hours),
and `topical_assessment`. Only fever/body_aches/itching are accepted targets.

Generation uses `POST /api/prescription/drafts/generate/<visit-uuid>/` with
`selection_mode: "automatic"`, `proposals: []` and `expected_plan_hash` from the
reviewed preview. The server recomputes the
selected medicines and complete regimens from current authorized inputs. Client
proposals in automatic mode are rejected. The preview hash binds the plan to
patient facts, DOB, screening date, analysis/diagnosis evidence, identity
knowledge and catalogue/rule review versions, including exclusions. A changed
plan or evidence returns HTTP 409 even when the numerical doses are unchanged;
the workspace refreshes the preview and clears acknowledgement for review again.
Dose shapes distinguish `scheduled`,
`oral_prn` and `topical_prn`; topical PRN cannot contain invented numerical
regimen fields. The legacy manual API remains available for earlier clients,
but is not used by this workspace.

Snapshots retain the reviewed plan hash, server-derived proposals, proposal origin, all suggestion
decisions, selected candidates, excluded candidates and review/evidence hashes.
Own-doctor/visit/patient authorization, per-visit context review, diagnosis
reference, CSRF, idempotent retries, version conflicts and stale-state checks
remain enforced. No model migration is needed.

The updated profiles have already been imported to this project's configured
database. To import them on another configured installation, run from backend:

```powershell
..\.venv\Scripts\python.exe manage.py seed_safety_profiles
```

This updates rules and audit records only. It does not create doctor decisions,
patient data or real screening drafts.

## Verification

```powershell
# From backend: isolated SQLite tests, not the configured patient database
..\.venv\Scripts\python.exe manage.py test prescription_drafts prescription_context medicine_knowledge --settings=medicare_project.test_settings --noinput

# From frontend, with the development server running; all browser APIs mocked
npx tsc --noEmit
npx eslint src/features/prescription-intelligence
node tests/prescription-drafts.mjs
node tests/medicine-knowledge.mjs
node tests/prescription-encounters.mjs
node tests/component1-analysis.mjs
node tests/member1-adapter.mjs
```

The 126 backend tests passed, including all-product selection, PRN limits,
symptom/duration boundaries, unknown assessments, unsupported products,
automatic-proposal tampering, stale/missing preview rejection, unchanged retry
idempotency, zero-medicine plans, permissions and immutable
history. TypeScript and targeted ESLint passed. The automatic-plan browser suite
passed with the actual Python rules/adapter and mocked APIs, covering influenza,
adult/child chickenpox, target changes, exclusions, retries, preview failures,
late responses, persisted versions, patient isolation and mobile layout.
The four accompanying catalogue, patient-context and Component 1/Member 1
browser regressions also passed. The workspace and database health routes
returned HTTP 200; no outstanding prescription-draft migration was detected.
Configured database verification found four current catalogue reviews and four
pending v3 rule profiles, with zero current executable-rule reviews.
