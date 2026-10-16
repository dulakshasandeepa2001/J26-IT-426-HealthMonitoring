# Step 7A: offline synthetic prescription-relevance dataset

The next stage is implemented in [Step 7B](STEP7B.md): a separate expanded batch,
offline fitted categorical model and reproducible evaluation. This original v1
batch and its criteria remain unchanged.

This step implements the first inspectable research batch. It reuses the four
shipped pilot catalogue products and the pure deterministic screening engine.
It does not train a model. The current doctor workspace continues to use its
existing controls. No Django settings, database, accounts, clinical records,
catalogue reviews, executable-rule reviews, routes or frontend files are changed.

The [public-dataset review](../../docs/research/DATASET_REVIEW_2026-10-14.md)
did not identify a directly reusable independently labelled two-condition
dataset. This batch follows the proposal's synthetic development direction;
it contains **no real patient records or medical-advisor labels**.

## Run in the existing VS Code terminal

Use PowerShell from the **repository root**, where `.venv` and `backend` exist.
No package installation or virtual-environment activation is needed. Python's
standard library and the existing pure rule module are sufficient.

```powershell
.\.venv\Scripts\python.exe backend/prescription_research/dataset.py build
.\.venv\Scripts\python.exe backend/prescription_research/dataset.py validate
.\.venv\Scripts\python.exe -m unittest discover -s backend/prescription_research -p "test_*.py" -v
```

`build` creates/replaces only these offline artifacts under
`docs/research/synthetic_prescription_v1/`, after validation passes:

- `batch.json`: 36 synthetic contexts and 144 context-product rows.
- `manifest.json`: source references, versions, seeds, fixed family splits,
  input/artifact SHA-256 hashes, feature allowlist and simulation semantics.
- `validation_report.json`: actual counts, labels, scope, variation and limits.
- `validation_report.md`: readable report of the same results.

`validate` recomputes the declared criteria and deterministic findings. It checks
schema, scenario reproduction, joins, sources, versions, family splits, hashes
and both stored reports. It exits with an error on stale or altered artifacts.
Inspect changed knowledge before rebuilding; do not edit labels to improve
metrics. An optional `--output <directory>` writes an isolated research batch.
No import/live-patient/DB option exists.

## Actual first-batch results

- 18 template families, two synthetic variants per family: **36 contexts**.
- 17 Influenza, 17 Chickenpox, one unknown condition, one unsupported `viral_urti`.
- Four product rows per context: **144 rows**, not 144 independent patients.
- **85 condition-mapped rows**; 59 condition contrasts/unsupported rows.
- Provisional labels: **74 relevant, 56 not_relevant, 14 undetermined**.
- Family splits: 20 train contexts, eight validation, eight test. No family
  occurs in multiple splits. These are reserved partitions; no fitting occurs.
- **10 relevant rows are independently blocked** by the deterministic engine.
- 48 distinct allowed model-input vectors; eight occur in multiple splits.
  Validation has no `undetermined` labels. These limits must be addressed or
  explicitly reported in later training; family separation alone cannot remove
  repeated model inputs.

See the generated [validation report](../../docs/research/synthetic_prescription_v1/validation_report.md)
for per-condition, per-split and per-role counts. No accuracy, held-out
agreement or model error is reported because no model has been fitted.

## Task and provisional label provenance

[criteria.json](../prescription_research/criteria.json) freezes a narrow task:
**condition/purpose/symptom relevance**, with `relevant`, `not_relevant` and
`undetermined` targets. It does not label a product safe, individually indicated,
properly dosed, approved or ready to prescribe.

The researcher defined the criteria using the existing source mappings, and
the builder executes them automatically. Every label has
`label_method="rule_derived"`; every context and candidate row has
`clinical_review_status="not_reviewed"`. No reviewer identity, signature,
review timestamp or approval is fabricated. References support the underlying
mapping; they are not independently labelled patient examples.

| Product | Condition / clinical role | Provisional target rule |
| --- | --- | --- |
| Paracetamol 500 mg tablet | Influenza / fever or aches relief | Fever OR body aches present; all absent gives not_relevant, otherwise undetermined |
| Paracetamol 500 mg tablet | Chickenpox / fever relief | Fever present; absent gives not_relevant, unknown gives undetermined |
| Oseltamivir 75 mg capsule | Influenza / antiviral | Catalogue-mapped antiviral purpose is relevant; individual indication/onset/dose remain outside this target |
| Acyclovir 800 mg tablet | Chickenpox / antiviral | Catalogue-mapped antiviral purpose is relevant; risk-group/onset/dose remain outside this target |
| Calamine + zinc oxide lotion | Chickenpox / itching relief | Itching present; absent gives not_relevant, unknown gives undetermined |

An unsupported/unknown condition gives `undetermined` for all products. A product
without a catalogue mapping for a supported condition gives `not_relevant`
as a **contrast example**, and is not passed into that condition's safety engine.
Keep contrasts separate from condition-mapped evaluation to avoid inflated
results from simple disease/product mapping.

Groups use **condition + purpose + clinical role**, rather than treating all
four medicines or even all symptom-relief medicines as alternatives. Each
supported group currently has one product. Within-group ranking performance
cannot be claimed. Antiviral relevance is constant within its mapped condition;
the batch does not provide variable antiviral suitability labels.

## Schema and missing information

[schema.json](../prescription_research/schema.json) is the machine-readable
JSON Schema. The stdlib validator implements only its explicitly supported
keywords and rejects unexpected fields and unsupported constraints.

`batch.scenarios` contains unique synthetic IDs, family/variant/split/condition,
the fixed synthetic observation date and `patient_features`. These facts include
age in completed years, measured weight in kg when created, onset and symptom
durations in hours, tri-state symptom presence, recorded allergy/current-medicine
mentions and supplied synthetic assessment categories. Age is a generated
synthetic feature, never derived from any registered patient's DOB.

`batch.candidate_rows` joins to those facts by `scenario_id`; it records the
candidate identity/purpose/role, group, allowlisted model inputs, relevance target,
label evidence IDs, independent research safety findings, content hashes and
schema/dataset/criteria/template/catalogue/rule/engine/adapter versions.
Full evidence reference metadata resolves through the manifest. Source access
and publication dates are copied from the shipped catalogue, not new claims of
source review or clinical approval.

`null` means unknown, never zero or a negative fact. An absent or unknown
symptom has no invented duration. Unknown histories remain unknown; unsupported
names such as `Paracetamol 500mg SOS` remain unresolved by the exact matcher.
The batch includes allergy matches, duplicate ingredients, unknown histories,
renal/other assessment gaps, pediatric formulation limits, missing age/weight,
missing/late onset, red flags and unsupported conditions.

## Deterministic controls and research adapter

[dataset.py](../prescription_research/dataset.py) reads shipped JSON only and
imports `prescription_drafts.engine`, which has no Django dependency. It never
imports the ORM services, calls `django.setup()`, opens a database, fetches
network data or copies production contexts. Tests also exercise a fresh process
that rejects Django, database-driver and HTTP-library imports.

Allergy, duplicate ingredient, selected interactions, contraindication/scope
and dose checks run through the existing pure engine. Synthetic alias lookup
uses the catalogue's exact normalized aliases; it never treats schedule text,
unknown brands or spelling guesses as resolved medicine identities.

The engine's historical field names include `symptoms_reviewed`,
`verified_symptoms` and `confirmed` history/risk flags. Inside this **offline
adapter only**, those flags express supplied synthetic facts/completeness. They
do not represent a real doctor's action. No `review_is_current` flag or reviewer
object is forged; live catalogue/rule review gates are not evaluated or altered.
For partially unknown symptoms the adapter conservatively withholds the global
symptom-completeness flag even if one symptom is present.

The dataset persists only engine finding categories/status/source IDs. Live
engine messages containing doctor-attestation wording, approved/published draft
fields and actual dose instructions are discarded. A reference regimen can be
calculated for an input yet still have allergy/scope blocks; the boolean
`reference_regimen_available` is not selection or safety clearance. All safety
records explicitly retain `simulation_only=true`, `review_gate_evaluated=false`
and `full_safety_clearance=false`. No API or patient publication is enabled.

## Next step: 7B, after inspecting this batch

Review label criteria and class/feature variation before expanding the batch.
The current small set is suitable for contract/provenance tests and a future
**experimental rule-imitation baseline**, not clinical-performance claims.
Document that alternative grouping or revised templates are new dataset versions.

Later, select a compact installed/explicitly added model, compare with the
criteria baseline, fit preprocessing on train families only, and report exact
per-class/per-product/condition-mapped results and repeated-input coverage.
The only allowed model inputs are `condition`, `candidate_id`, `purpose`,
`clinical_role`, `fever_present`, `body_aches_present`, `itching_present`.
Safety facts/results, relevance labels/reasons, teacher scores, IDs used for
grouping, versions, evidence metadata, reviewer fields and post-decision values
are excluded. They cannot justify resolving missing facts or clearing blocks.

No training occurs during an API request. After offline evaluation, a separate
explicitly enabled synthetic-only demo can load a saved model labelled
**Experimental ML**, expose provenance/coverage limits and retain every
deterministic control. No medical confidence or independent clinical validation
may be inferred from agreement with the rules that created these labels.
