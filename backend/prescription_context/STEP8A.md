# Step 8A: six-condition Member 1 handoff, schema 2.1

Implemented on 2026-10-16. This is a receiver/doctor-demo contract expansion based
on the [scope matrix](../../docs/research/SIX_CONDITION_SCOPE_EVIDENCE_2026-10-16.md).
Member 1's producer implementation and agreement to these field names are still
pending. No acknowledgement, clinician review or clinical validation is implied.

## What is available

The shared ingestion path accepts the nested **2.1** envelope, preserves the full
original JSON, normalizes supported facts and displays them in the doctor workspace.
Flat **1.0** and nested **2.0** behavior remains supported. Existing analyses are
immutable; a new format requires a new encounter, not rewriting saved evidence.

| Canonical primary condition | Display | Medicine/rule/model coverage in this step |
| --- | --- | --- |
| `influenza` | Influenza | Existing two-condition pilot only |
| `chickenpox` | Chickenpox | Existing two-condition pilot only |
| `measles` | Measles | Handoff and diagnosis confirmation only |
| `mumps` | Mumps | Handoff and diagnosis confirmation only |
| `viral_conjunctivitis` | Viral conjunctivitis | Handoff and diagnosis confirmation only |
| `viral_gastroenteritis` | Viral gastroenteritis | Handoff and diagnosis confirmation only |

Codes are case-insensitive on the wire and lower-case after normalization. Only
the primary diagnosis supplies a suggestion. An unsupported primary stays in the
original report, produces no supported suggestion, and never promotes a supported
differential. The doctor can correct the diagnosis before explicitly confirming it.
Confirmation is a separate record bound to the analysis reference.

## Wire envelope and delivery

Use any of the [six complete synthetic examples](samples/member1_v21/) as the
shape reference; these are fictional format fixtures, not training data or results
from Member 1's model. The example scores are fixed illustrative values. No actual
patient data or recording was used, and no therapeutic regimens are supplied.

Required root fields:

| Field | Contract |
| --- | --- |
| `schema_version` | `"2.1"` |
| `status` | `"success"` |
| `source`, `is_demo` | `"component_1_sample"`, `true` for synthetic/demo output; `"component_1"`, `false` for actual producer output |
| `model_version` | Truthful producer identifier, or explicit synthetic identifier for samples; a synthetic/demo prefix cannot claim a real result |
| `review_status` | `"unconfirmed"` only |
| `analysis_reference` | Stable nonempty reference, max 150 characters, letters/digits/underscore/dot/colon/hyphen |
| `consultation_id` | Existing nonzero UUID |
| `patient_id`, `doctor_id` | Positive JSON integers matching the registered consultation |
| `timestamp` | ISO date/time string with explicit UTC offset or `Z` |
| `payload` | Nested fields described below |

The timestamp is producer metadata, not a clinical review date or inferred onset.
For actual integration, Member 1 must use the actual saved encounter identifiers
and actual producer provenance. Never relabel a bundled sample as real output.

```text
POST /api/prescription/component-1/results/
Content-Type: application/json
X-Component1-Key: <existing backend-only configured key>
```

The existing service-key and approved admin service-identity checks still apply.
This step does not configure credentials, appointments, or Member 1's callback.
The worker cannot choose an imported-by/reviewer actor. Patient, doctor and
demo status must match the registered visit, whose participants must remain
active/approved. Browser session credentials cannot replace worker authentication.

Exact retries return the existing analysis (200), including after confirmation.
A changed payload for the same encounter returns 409; an initial result returns
201. Invalid contracts/bindings return 400; nonexistent encounters return 404.
The doctor workspace polls the selected awaiting visit using the existing flow.

## Nested payload

The original audio/summary/primary/differential/notes/treatment-category structure
is retained from [2.0](STEP4B.md). All fields are bounded and unknown object keys
are rejected. `audio_metadata`, `transcript_summary`, `extracted_symptoms`,
`primary_diagnosis`, `differential_diagnoses`, `extracted_clinical_notes` and
`suggested_treatment_categories` remain required; empty differential/category lists
are permitted. `red_flags` and the new `reported_assessments` are optional.

### Symptoms: explicit true / false / unknown

Supported canonical codes:

```text
fever, cough, sore_throat, body_aches, rash, itching,
jaw_pain, ocular_dryness, ocular_irritation,
diarrhoea, vomiting, recent_fluid_loss
```

Each of 0–50 extracted rows has required `symptom` text, `severity`
(`mild/moderate/severe/unknown`) and finite numeric `confidence` (0–1, a reported
extraction score). Optional `code` is canonical lower-case; known label aliases
are mapped by the adapter. Unknown terms remain in the source report and generate
clarification messages; no closest-match inference occurs.

| Field | 2.1 semantics |
| --- | --- |
| `present` | JSON `true`, `false`, or `null`; omitted means **unknown**, unlike the legacy 2.0 default |
| `duration` | Original source text or null; optional, max 100 characters |
| `duration_hours` | Optional finite number 0–8760 or null; fractional hours allowed |
| `duration_days` | Optional integer 0–365 or null for compatibility |

Exact numeric hour/day text such as `12 hours`, `1.5 days`, or `2d` is normalized
to hours. Ambiguous text such as `2-3 days` stays unknown unless the producer
separately supplies a structured duration; the text and clarification remain
visible. No midpoint or day rounding is invented. Conflicting exact text/hours/days
are rejected, as are duplicate identities and contradictory known label/code pairs.
An explicitly absent symptom cannot have a positive exact/structured duration.

Canonical output always includes all 12 supported symptoms. Missing findings get
`present: null`, `duration_hours: null`, `duration_days: null`. Durations are used
only with explicit positive presence; an unknown/absent finding never becomes
present because duration was supplied. Whole multiples of 24 hours also populate
legacy days; fractional days do not get rounded. The UI shows **Unknown** separately
from **Not present**. Existing draft symptom prefill uses only positive findings,
retains hours and still requires explicit doctor review.

### Reported assessments: observations, not clearance

`payload.reported_assessments` is an optional object. These optional boolean fields
accept only JSON `true` / `false` / `null`; omission means null:

```text
respiratory_concern, neurological_concern, hydration_concern, intake_difficulty,
abdominal_pain, testicular_pain_or_swelling, eye_pain, photophobia, vision_change,
marked_or_worsening_redness, contact_lens_use, suspected_herpetic_eye_disease,
blood_in_stool, severe_abdominal_pain, fluid_restriction,
immunocompromised, pregnant_or_breastfeeding
```

| Additional field | Values / default |
| --- | --- |
| `dehydration_assessment` | `unknown/none/mild/moderate/severe`; default `unknown` |
| `oral_fluid_tolerance` | `unknown/tolerated/not_tolerated`; default `unknown` |
| `reported_onset_hours` | Finite number 0–8760 or null; default null |
| `reported_weight_kg` | Finite number 0.1–350 or null; default null |
| `weight_recorded_at` | Explicit-offset timestamp or null; requires a reported weight; default null |
| `ors_product_name` | Source-reported text up to 200 characters or null; default null |

Numeric bounds are technical ingestion limits, not clinical eligibility/dose
limits. No weight, onset, dehydration category or preparation is inferred from
other facts. A reported ORS name never establishes composition, identity, dilution
or dose. The local product-label gap recorded in the scope matrix remains open.

The normalized `member1.reported_assessments` contains every field with explicit
unknown defaults. Its `assessment_review_status` is server-set **`unverified`**.
Neither actor, clinical approval nor review date can be supplied through this
contract. Reported negative observations never establish clinical safety. Positive
respiratory/neurological/hydration concerns also appear in canonical reported flags,
without changing an omitted red-flag assessment to assessed. Other eye/GI facts
remain visible as unverified observations; no new condition handler executes them.

These fields are displayed separately and never populate the doctor's verified
clinical-assessment form, allergy/current-medicine status, registered DOB, patient
context revisions or catalogue/rule review records. Empty voice allergy/medicine
lists remain unverified; they do not establish a None status.

## Try it in the doctor workspace

1. Use an existing approved assigned doctor and patient; open Prescription Workspace.
2. Select a **new demo visit** with no analysis or confirmed diagnosis.
3. Choose **Member 1 v2.1 — [condition]** and click **Load demo analysis**.
4. Inspect schema/model identifiers, unknown findings, hour durations, unverified
   assessments, clarification messages and the preserved original JSON.
5. Review/correct and explicitly confirm the diagnosis. For the new four conditions,
   the workspace shows **Medicine support pending for this condition**.

The bundled demo loader alone rebinds the synthetic sample's patient/doctor/visit
IDs and appends the saved visit UUID to its analysis reference. Use a separate new
demo visit for each sample. No migrations, imports, new account or live fixture
creation are required by this change. Existing two-condition medicine screening
retains its deterministic review/safety requirements. No ML training, clinical
review approval or patient-facing prescription publication is enabled here.

## Verification commands

From `backend` (all clinical test records are isolated in in-memory SQLite):

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
```

From `frontend`, with the local Next server running (all backend HTTP mocked):

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/analysisData.ts src/features/prescription-intelligence/AnalysisResult.tsx src/features/prescription-intelligence/Member1Report.tsx src/features/prescription-intelligence/PrescriptionWorkspace.tsx src/features/prescription-intelligence/DraftFlow.tsx
node tests/six-condition-handoff.mjs
node tests/member1-adapter.mjs
node tests/component1-analysis.mjs
node tests/prescription-drafts.mjs
```

The v2.1 browser fixture uses the actual Python adapter, checks all six demo options
and confirmation codes, unknown/negative presentation, original JSON, source-text
escaping, unchanged verified context, pending-treatment UI, persistence, mobile
layout and malformed-contract rejection. Backend checks exercise strict types,
duration conflicts, source/bindings, service authentication, CSRF, immutable retries
and the existing two-condition medicine gate.

Results for this delivery: **140 backend tests passed** (14 new 2.1 checks),
TypeScript and targeted ESLint passed, and all four listed browser suites passed.
The 2.1 suite also verifies hour-preserving symptom prefill, unknown symptoms not
selected, and source onset/negative concern fields leaving verified assessments
unknown. The existing catalogue, executable policy/engine, saved model and settings
files retain their pre-change SHA-256 hashes. No live records or reviews were
created or changed by verification.

## Next integration step

Follow-up implemented: [Step 8B](STEP8B.md) now supplies the offline pending
catalogue/rule bundle and inspectable technical checks. Live activation, ORS
product resolution and Member 1 producer agreement remain separate work.

Share this contract and the six sample JSONs with Member 1 for producer agreement.
Then implement versioned pending catalogue/source/identity changes and explicit
deterministic rules for the new purposes. Resolve the exact ORS preparation before
making its policy executable. The existing saved model remains a two-condition
research baseline; six-condition dataset/model work follows the catalogue/rule
contracts and must keep clinical-review status truthful.
