# Step 4B: Member 1 nested voice JSON adapter

The supplied Member 1 example is preserved as JSON data in
`samples/member1_influenza_demo.json`. It includes transcript/audio information,
symptom extraction scores, a primary diagnosis, differentials, reported clinical
notes and treatment categories. A versioned adapter now accepts that nested
structure, preserves it for audit, and maps supported fields into the prescription
workspace. The existing flat **1.0** influenza/chickenpox samples remain supported.

## Try the supplied example

1. Sign in as the assigned approved doctor and open **Prescription Workspace**.
2. Select an assigned patient and a **new PP1 demo consultation** with no saved
   analysis or confirmed diagnosis. Existing analysis evidence is immutable.
3. Choose **Member 1 — Influenza voice JSON** in **Demo analysis scenario**.
4. Select **Load demo analysis**. The trusted loader binds patient, doctor and
   consultation IDs to this saved visit and adds explicit synthetic provenance.
   It appends the visit UUID to the analysis reference; the bundled source file
   remains unchanged. No file upload or manual ID replacement is needed here.
5. Inspect the normalized symptoms, generic Influenza suggestion, reported primary
   label, differentials, audio/summary, unverified clinical notes and original JSON.
6. Verify any voice-reported allergies/current medicines with the patient and
   enter/review/save verified changes in the existing patient-information form.
   Importing the analysis never writes these fields or establishes None status.
7. Review/correct the diagnosis and explicitly confirm it. Confirmation is stored
   separately with the analysis reference. Prescription generation remains disabled
   until the reviewed safety/draft stage is implemented.

Sample values, timestamps, scores, diagnostic subtype and ICD code are reported
source claims; the demo does not establish model accuracy or clinical confirmation.

## Contract for Member 1's backend

The unversioned example alone is **not** accepted as a real result. Member 1 must
add these root fields to the supplied nested structure:

| Root field | Rule |
| --- | --- |
| `schema_version` | `"2.0"` |
| `source` | `"component_1_sample"` for demo, `"component_1"` for actual output |
| `is_demo` | JSON boolean; must match the saved consultation |
| `model_version` | Actual producer version, or an explicit synthetic/demo identifier for samples |
| `review_status` | `"unconfirmed"` only; the producer cannot confirm the diagnosis |

The rest of the original root fields are required: `status: "success"`, stable
`analysis_reference`, existing nonzero `consultation_id`, positive integer
`patient_id` and `doctor_id`, timezone-aware ISO `timestamp`, and nested `payload`.
All three identity values must match the registered consultation. The producer
timestamp is preserved separately from the server's `imported_at`; it is not
treated as a doctor-review time or an exact symptom-onset time.

The complete synthetic wire example is **`samples/member1_v2_example.json`**.
Its sample IDs must be replaced with actual matching registered IDs before a
worker sends it. Choose source/demo/model metadata truthfully for the result.
The doctor demo loader handles these replacements only for the bundled scenario.

Delivery uses the same receiver as Step 4:

```text
POST /api/prescription/component-1/results/
Content-Type: application/json
X-Component1-Key: <backend-only configured key>
```

The existing `COMPONENT1_API_KEY` and approved admin service identity configuration
is still required; browser cookies cannot replace worker authentication. This
change does not configure credentials or implement Member 1's producer callback
or prediction model. The visible doctor workspace already polls awaiting visits
every five seconds and displays valid 1.0 or 2.0 results automatically.

## Nested payload rules

- `audio_metadata`: finite seconds (0–86400), language tag, audio quality
  `clear` / `noisy` / `poor` / `unknown` (case normalized).
- `transcript_summary`: bounded plain text, up to 5000 characters.
- `extracted_symptoms`: 1–50 records with `symptom`, `duration`, `severity`, finite
  numeric `confidence` in 0–1. Optional `code`, `duration_days` (integer 0–365 or
  null) and `present` (JSON boolean) support structured producer output.
- `primary_diagnosis`: code, label, finite numeric confidence, severity level,
  and optional reported `icd_10_code`. No code/subtype is medically verified here.
- `differential_diagnoses`: up to 10 records with code, label and numeric confidence.
  Codes must be unique across primary and differentials, ignoring case.
- `extracted_clinical_notes`: chief complaint, lists of patient-reported allergies
  and current medications, and mentioned vital-sign text. Accepted vital keys are
  temperature, blood pressure, heart rate, oxygen saturation and respiratory rate.
- `suggested_treatment_categories`: bounded strings displayed as unreviewed source
  suggestions; they never select a medicine, dose or prescription action.
- Optional `red_flags`: `{ "assessment_status": "assessed", "items": [...] }`
  or `{ "assessment_status": "not_assessed", "items": [] }`. Missing assessment
  remains **not assessed**; empty clinical notes or transcript wording do not clear flags.

Lists/text are bounded, scores/audio must be finite, strings are not coerced from
objects, and unexpected root/nested fields are rejected. A transcript containing
instructions or HTML is displayed as text and cannot issue application actions.
Instruction/actor/approval fields outside the contract are rejected.

## Mapping and preserved evidence

The adapter maps known fever/high-fever, cough/dry-cough, sore-throat, body-ache/
myalgia, rash and itching aliases to stable pilot symptom codes. This is a
controlled terminology mapping. Duplicate mapped symptoms and conflicting
structured codes are rejected rather than silently merged.

Exact integer day text such as `3 days` is mapped to 3. Text such as `about three
days` or `2-3 days` is retained with a clarification message. An optional structured
day count may be used, but conflicting exact text/count pairs are rejected.
Unknown symptoms are preserved in the source report and flagged for clarification;
the adapter does not infer a new identity or discard the original information.
Extracted symptom entries default to reported-present; negated symptoms must use
`present: false`. A prose summary is never used to infer negative safety findings.

The reported primary `INFLUENZA` or `CHICKENPOX` maps to a supported generic pilot
candidate. The diagnostic label/subtype and ICD text remain visible as unconfirmed
source claims. Per-symptom severity and extraction score remain separate from the
primary diagnosis severity and score. A differential with a higher score is not
promoted. Unsupported primary conditions are preserved and shown, with **no pilot
diagnosis prefill**; unsupported differentials remain visible for clinician review.

Storage uses the existing analysis JSONField. Its canonical payload has
`schema_version: "2.0"`, mapped symptoms, primary-only pilot candidates, reported
severity, doctor/patient/consultation bindings, and a `member1` object containing
adapter version, clarification messages, red-flag assessment and **`raw_output`**.
`raw_output` preserves the accepted incoming JSON data, including all producer
metadata and clinical context; it is not a byte-for-byte HTTP body archive.
For a demo it records the loader-bound wire object; the unbound user example is
preserved separately in the original bundled file.

No migration, account creation, patient-context update, live analysis import or
doctor impersonation is required for installing/verifying this adapter.

## Retry, access and verification

The shared ingestion service keeps Step 4's authentication, consultation locking,
doctor/patient approval checks, immutable one-result-per-visit evidence, idempotent
retries and reference-bound confirmation. Even a change only to transcript,
differentials, source timestamp or notes conflicts with an existing result (409).
Identical delivery is safe after doctor confirmation; a different late result is
blocked. The original result is accessible only through the owning doctor's
consultation API. Voice-reported fields never replace saved verified context.

```powershell
# From backend: in-memory test database only
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge --settings=medicare_project.test_settings --noinput

# From frontend with the local Next server running; every backend call is mocked
node tests/member1-adapter.mjs
node tests/component1-analysis.mjs
node tests/prescription-encounters.mjs
```

The new browser checks build fixtures with the actual Python adapter under isolated
test settings. They cover source preservation, sample binding, unconfirmed scores,
differentials, unknown mappings/onset, unchanged patient context, explicit doctor
confirmation, automatic delivery, patient isolation, escaped source text and mobile
layout. Backend tests additionally cover contract failures, identities, CSRF/worker
authentication, finite values, provenance, duplicate/conflicting mappings and retries.

Next: [Step 6](STEP6.md) adds separately reviewed executable safety rules and
persisted screening drafts. Dataset/model comparison and ML explanations remain
later work.
