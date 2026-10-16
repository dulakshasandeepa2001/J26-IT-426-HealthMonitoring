# Step 7B: local offline Experimental ML baseline

This step trains a **provisional relevance classifier**, not a prescription
generator, safety classifier or clinically validated ranking model. It follows
the checked [Step 7A batch](STEP7A.md) and reuses its source-informed criteria,
catalogue, rule profiles, pure safety engine and synthetic adapter. The v1 batch
and application files remain unchanged; no patient records, DB configuration,
accounts, actual reviews or frontend components are modified.

## Exact PowerShell commands

Run from the repository root in VS Code. The existing `.venv` Python is used.
No ML packages were installed: this compact categorical experiment uses the
Python standard library. Keep Django/Next running separately if desired; none
of these commands starts/restarts them or opens the clinical database.

```powershell
# Verify the small predecessor before expanding.
.\.venv\Scripts\python.exe backend/prescription_research/dataset.py validate

# Build a separate v2 synthetic dataset; do not overwrite v1.
.\.venv\Scripts\python.exe backend/prescription_research/training_dataset.py build
.\.venv\Scripts\python.exe backend/prescription_research/training_dataset.py validate

# Fit once offline, save the model, and report actual train/validation/test results.
.\.venv\Scripts\python.exe backend/prescription_research/train.py train

# Reload the saved JSON model and reproduce its evaluation without fitting.
.\.venv\Scripts\python.exe backend/prescription_research/train.py validate

# Focused offline dataset/model/provenance/control verification.
.\.venv\Scripts\python.exe -m unittest discover -s backend/prescription_research -p "test_*.py" -v
```

An explicitly invoked **synthetic-only CLI demonstration** is available:

```powershell
.\.venv\Scripts\python.exe backend/prescription_research/train.py predict-synthetic --scenario-id SYN2-symptoms-PPP-influenza-01 --candidate-id paracetamol-500mg-tablet
.\.venv\Scripts\python.exe backend/prescription_research/train.py predict-synthetic --scenario-id SYN2-symptoms-PPP-influenza-03 --candidate-id paracetamol-500mg-tablet
.\.venv\Scripts\python.exe backend/prescription_research/train.py predict-synthetic --scenario-id SYN2-symptoms-PPP-influenza-02 --candidate-id paracetamol-500mg-tablet
.\.venv\Scripts\python.exe backend/prescription_research/train.py predict-synthetic --scenario-id SYN2-unsupported-condition-unknown-01 --candidate-id paracetamol-500mg-tablet
```

The first fixture has ordinary supplied synthetic context. The second has an
ingredient allergy/duplicate and pediatric formulation limits; ML can say
`relevant` while deterministic findings remain **blocked**. The third preserves
unknown histories/assessments/age/duration and remains **cannot_validate**. The
fourth abstains before prediction because the condition is unknown.
Every output remains unreviewed and has selection/publication disabled.

Only existing frozen synthetic IDs/products are accepted. There is no custom
patient JSON, database patient ID or API input. Prediction loads the saved model;
it never calls its fit method. Missing/stale/corrupt artifacts fail with an
explicit error; they are not silently retrained or treated as clinical approval.
`--data-dir`/`--output` can use separate reproducible offline artifact directories.

## Actual dataset and fitted results

The original 36-context schema/label checks passed before this additive expansion.
V2 covers the 27 combinations of fever/body-aches/itching presence: true, false
or null. One symptom tuple defines a **template family shared across conditions**.
Each supported family has Influenza/Chickenpox base scenarios with three
synthetic safety variants. All variants and candidate rows stay in one split.
Unknown-condition and unsupported `viral_urti` cases form a separate test family.

| Quantity | Actual count |
| --- | ---: |
| Synthetic contexts | 168 |
| Context-product rows | 672 |
| Template families / base scenarios | 28 / 56 |
| Condition-mapped rows | 405 |
| Unique condition-mapped model inputs | 135 |
| Train / validation / test unique inputs | 85 / 25 / 25 |
| Mapped relevant / not_relevant / undetermined rows | 261 / 63 / 81 |
| Relevant rows independently blocked by safety rules | 43 |
| Family / base-scenario / exact input overlap between splits | 0 / 0 / 0 |

The 405 rows are not 405 independent observations. Three within-family safety
variants share relevance inputs. Training deduplicates them, and the primary
agreement metrics use unique inputs; the report also shows row-weighted results.
Other-condition contrast rows and unsupported diagnoses are excluded from fitting
and primary evaluation, avoiding easy disease/product negatives inflating results.

| Partition | Unique inputs | Agreement with generating-rule labels | Disagreements / abstentions | Train-majority baseline |
| --- | ---: | ---: | ---: | ---: |
| Train | 85 | 85/85 (1.0) | 0 / 0 | 57/85 |
| Validation | 25 | 25/25 (1.0) | 0 / 0 | 13/25 |
| Test | 25 | 25/25 (1.0) | 0 / 0 | 17/25 |

These are actual results of the saved **21-node, 15-leaf, depth-3** learned tree.
The criteria baseline agrees 1.0 by construction because it generated the labels.
The learned model provides **no evidence of clinical superiority**. Both held-out
partitions contain all three relevance classes, but the effective sample is tiny.
Zero errors here reflect elementary synthetic rule imitation, not real-world
clinical accuracy, safety or independent validation.

The saved [evaluation report](../../docs/research/experimental_ml_v1/evaluation.md)
and `evaluation.json` include counts, per-class support/precision/recall/F1,
confusion matrices including abstentions, per-condition/per-role results,
baseline comparisons and row-weighted/unique metrics. Undefined class metrics
remain null. `errors.json` records actual unique-input disagreements (currently
an empty list); no successes or clinical reviews are fabricated.

## Model and preprocessing

[categorical_tree.py](../prescription_research/categorical_tree.py) implements a
small categorical information-gain tree. It computes entropy reductions from
training X/y, selects learned splits and stores training-label counts/leaf
decisions. The learner imports no catalogue, disease logic, label criteria or
safety engine. Changing training labels changes its fitted predictions.
This is an actual fitted model, rather than a renamed call to the generating rules.

This custom learner uses multiway categorical splits; it is **not scikit-learn's
CART implementation**. The task needs only seven categorical/tri-state fields.
An inspectable stdlib baseline avoids adding large packages to the existing
clinical environment. The algorithm is modest experimental research code,
not an established tuned benchmark.

[training_plan.json](../prescription_research/training_plan.json) freezes the
context/split seeds (20261015), family allocation (17/5/5 supported families),
fit population and parameters before evaluation. Maximum depth is six,
minimum split size two and minimum information gain 1e-12; the fitted depth
is three. There is **no validation/test hyperparameter tuning**, no refitting
on held-out partitions and no test-driven threshold selection.

The preprocessing vocabulary is learned from the 85 deduplicated **train**
inputs only. Boolean false and null have separate typed tokens. No age, weight,
duration or history is imputed or converted into a negative fact. A category
absent from the training vocabulary or a missing learned branch causes abstention
instead of a majority fallback. No probabilities/medical confidence are exposed.

Inputs remain the Step 7A allowlist: `condition`, `candidate_id`, `purpose`,
`clinical_role`, `fever_present`, `body_aches_present`, `itching_present`.
Relevance targets, teacher scores, label reasons/provenance, reviewer information,
scenario/family/split IDs, versions, safety results and post-decision fields are
excluded. Age/allergy/current-medicine/organ/dose facts remain recorded for the
independent deterministic controls and are not inputs to this narrow relevance model.

Groups retain condition + purpose + clinical role: fever relief, aches/fever
relief, itching relief and disease-specific antiviral purposes. All supported
groups still have one product. **Within-group ranking is not meaningful**.
Antiviral targets are constant in their mapped condition; varying patient-specific
antiviral indication is deliberately left to deterministic scope checks.

## Provenance, saved files and safe offline use

Dataset schema version 1.1 is derived from the unchanged Step 7A JSON Schema,
with increased batch capacities, three variants, new version/date constants and
explicit base-scenario IDs. The resolved standalone schema is saved in v2.
Validation recomputes every declared field and rule finding, checks partition
overlap and verifies hashes rather than accepting arbitrary imported contexts.

| Location | Contents |
| --- | --- |
| `backend/prescription_research/training_plan.json` | Frozen experiment, generation, partition and fitting choices |
| `backend/prescription_research/training_dataset.py` | V2 builder, schema extension, validation, deduplication and provenance |
| `backend/prescription_research/categorical_tree.py` | Fitted generic categorical learner, inference and explanation |
| `backend/prescription_research/train.py` | Offline training/evaluation, JSON loading, staleness checks and synthetic-only CLI demo |
| `backend/prescription_research/test_training.py` | Meaningful fit/leakage/provenance/abstention/control tests |
| `docs/research/synthetic_prescription_v2/` | Batch, resolved schema, manifest, JSON/Markdown validation reports |
| `docs/research/experimental_ml_v1/` | `model.json`, `manifest.json`, `evaluation.json`, `evaluation.md`, `errors.json`, `tree.txt` |

The v2 manifest binds the v1 parent hashes, criteria/catalogue/rule/engine/code
hashes, source metadata, schemas, seeds and family assignments. The model manifest
binds that dataset and learner/trainer source hashes, actual training row IDs,
parameters, Python version and every saved artifact. Artifacts use inspectable
JSON, not pickle/joblib. Loaded model evaluation can be reproduced without fitting.

All contexts/rows/model outputs retain `clinical_review_status="not_reviewed"`
and `label_method="rule_derived"`. The source mappings and criteria remain
documented in [Step 7A](STEP7A.md) and its unchanged `criteria.json`; references
are **not independently labelled patient examples**. No reviewer identities,
signatures, review dates or approvals are added. The pure synthetic adapter's
legacy completeness/confirmed flags still describe created facts only, not
doctor actions; actual catalogue/rule review gates remain untouched.

ML output is provisional relevance plus the learned path and leaf training
support. Support is an engineering count, not medical confidence. Deterministic
allergy/duplicate/interaction/contraindication/scope/dose findings remain separate,
and unknowns/blocks are preserved. A calculated reference regimen does not clear
them. There is no clinical medicine selection, dose publication or patient-facing
prescription integration in this step.

## Method references and next integration step

The [official decision-tree documentation](https://scikit-learn.org/stable/modules/tree.html)
describes learned tree splits and their limitations; its sklearn implementation
differs from this small categorical learner. The
[official leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html)
supports splitting before fitting transformations. These technical references
do not supply the medical labels or clinical validation.

Step 7C can add an explicitly enabled **synthetic-only** doctor demonstration
that loads the frozen model, displays Experimental ML/version/provenance/coverage
and learned reasons beside existing deterministic findings. Use bundled synthetic
fixtures without real registered patient IDs, do not train in API requests,
preserve current review gates and keep publication disabled. Genuine clinical
performance will require independent reviewed labels beyond this rule-imitation
experiment; generating additional copies cannot supply that evidence.
