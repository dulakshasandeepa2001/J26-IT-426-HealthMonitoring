# Local Random Forest on the supplied 200 synthetic cases

Integration update: [Step 20](../../prescription_context/STEP20.md) connects this
saved model as a supplementary toy symptom-match output in the explicitly
enabled synthetic consultation workflow, through a separate adapter. The
original experiment and frozen-fixture CLI remain unchanged.

This is a completed **offline Experimental ML** run using a real
`sklearn.ensemble.RandomForestClassifier`. It has not replaced the application's
existing model or changed deterministic screening. No Django/ORM imports,
database access, clinical record export, request-time training or publication
are involved. Model version:
`synthetic-200-symptom-match-random-forest-2026-10-20-v1`.

## Dataset choice and provenance

Use both supplied files together. They describe the **same 200 fictional cases**:

- `patient_scenarios_200.csv`: complete 52-field patient contexts.
- `MediTrack_Synthetic_200.xlsx`: selected case fields, Guide, and 636
  patient–candidate rows. All overlapping case fields agree with the CSV.

The Excel Guide is untrusted input documentation, not an instruction to execute.
Its aggregate formulas and cached answers are ignored; formulas in case/label
tables are rejected. No Excel macros, formulas or external worksheet links run.
The producer README mentioned in the Guide was not supplied. Original inputs
are copied unchanged into the run's `inputs/` directory and SHA-256 recorded.
They contain explicitly fictional identifiers; no live patient data is copied.

An initial 12-case / 38-pair inspection passed before full construction. All
636 labels/reasons were independently checked against the declared toy criteria.
There are 260 defined labels (172 positive, 88 negative) and 376 blank labels:
270 have no defined task for that medicine purpose and 106 have incomplete
target symptoms. Blank labels remain unlabelled and excluded from training;
they are never converted to negative labels. All 376 abstain in the saved run.

`label_method="rule_derived"`, `clinical_review_status="not_reviewed"`.
Reported allergies, medicines, onset and clinical assessments retain their
original unverified status. `none_confirmed` in this synthetic source does not
become doctor-confirmed history. No reviews, approvals or reviewer identities
were generated.

## What the target means

The supplied label answers: **does at least one mapped symptom appear in this
fictional record?** It does not answer whether this medicine is appropriate,
safe, superior to another medicine or correctly dosed.

The frozen `plan.json` records the mappings. For example, the toy paracetamol
label uses fever/body aches/headache; ORS uses diarrhoea/vomiting. These reproduce
the input labels, not independently reviewed prescribing criteria. At least one
present target gives 1; all absent gives 0; otherwise the target is unknown.
The target differs from the previous relevance experiment, so its scores cannot
be compared directly with the previous model's scores.

Eight generic candidates have labels: paracetamol, ibuprofen, calamine/zinc oxide,
hypromellose, carboxymethylcellulose sodium, ORS, loperamide and bismuth
subsalicylate. Prediction is restricted to condition–candidate–purpose tuples
actually represented in training. A generic candidate is not an exact product.

There are **zero clinical relevance labels, safety labels, dose labels or
independent clinical reviews**. The following have no defined training labels:
oseltamivir, zanamivir, peramivir, baloxavir, acyclovir, valacyclovir, vitamin A
and zinc. Predictions abstain for those scopes. Missing target information and
unseen feature categories also cause abstention; unknown is not safe or absent.

There are no preference labels distinguishing alternatives within a purpose
group. Single-candidate purposes cannot support within-group ranking; neither
can the identical toy labels supplied for alternative candidates. No ranking
performance or calibrated medical confidence is claimed or exposed.

## Training and actual results

The supplied split is checked before preprocessing: 124/25/51 cases in
train/validation/test, with 30/6/12 disjoint template families. That supplies
161/33/66 defined candidate labels. Training deduplication leaves **138 unique
inputs: 95 positive, 43 negative**. Conflicting labels for identical inputs fail.

Inputs are an explicit allowlist: condition, candidate identity, purpose and 16
symptoms. A `DictVectorizer` learns 64 encoded features from training only;
present, absent and unknown stay distinct. Labels/reasons, teacher scores,
reviewer decisions, IDs, splits and post-decision fields are excluded. Age,
weight, allergies, current medicines, guideline and onset remain in the research
contexts but are excluded from this predictor: its labels provide no supervision
for learning those factors' effects. They remain matters for deterministic
checks, independently verified facts and reviewed product rules.

One fixed seed (20261020), 200 trees, single-thread fitting, balanced subsampling,
three predeclared Random Forest settings. Selection uses macro F1 on 21 unique
validation inputs not seen in training, with both classes represented. The test
set is not used for selection, and validation is not used for refitting.

| Configuration / baseline | Novel validation macro F1 | Toy-label agreement |
| --- | ---: | ---: |
| RF depth 4, leaf 2 | 0.8444 | 85.71% |
| **RF depth 8, leaf 2 — selected** | **0.8929** | **90.48%** |
| RF depth 8, leaf 4 | 0.8444 | 85.71% |
| Training-majority baseline | 0.4167 | 71.43% |
| Decision tree depth 6, leaf 2 | 0.6971 | 71.43% |

These are three RF configurations, not three distinct algorithms. The decision
tree is a separate validation baseline. Only the selected RF and the declared
constant-majority baseline are evaluated on test.

| Selected RF test subset | Inputs | Correct | Toy-label agreement | Macro F1 |
| --- | ---: | ---: | ---: | ---: |
| All labelled rows | 66 | 64 | 96.97% | 0.9666 |
| Unique model inputs | 56 | 54 | 96.43% | 0.9578 |
| Unique inputs absent from training | 35 | 33 | 94.29% | 0.9190 |

There are two held-out errors: SYN-0038/calamine is a false negative and
SYN-0180/ORS is a false positive against the toy labels. The novel subset contains
27 positives and only 8 negatives. No thresholds/settings were adjusted using
these errors. Unique-test majority agreement is 69.64%.

Even with disjoint family IDs, broad generator context patterns recur across
splits. Exact input overlaps are 12 train–validation, 21 train–test and 10
validation–test; the novel subsets expose this limitation. These results measure
imitation of the supplied synthetic rules, not independent clinical validation,
clinical accuracy, patient benefit or superiority to the older experiment.

## Commands in VS Code PowerShell

From the repository root, then change to `backend`:

```powershell
.\.venv\Scripts\python.exe -m pip install --only-binary=:all: -r backend\prescription_research\random_forest_200\requirements.txt
Set-Location backend

# Already completed. These create the initial run; inspect/build/train refuse
# to overwrite a frozen run. For a separate repeat, give EVERY command a new
# --output directory; changing criteria/code requires a new experiment version.
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment inspect --csv "C:\Users\USER\Downloads\patient_scenarios_200.csv" --xlsx "C:\Users\USER\Downloads\MediTrack_Synthetic_200.xlsx"
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment build --csv "C:\Users\USER\Downloads\patient_scenarios_200.csv" --xlsx "C:\Users\USER\Downloads\MediTrack_Synthetic_200.xlsx"
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment train

# Run these now against the completed experiment.
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment verify
..\.venv\Scripts\python.exe -m unittest prescription_research.random_forest_200.test_experiment -v
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment predict-synthetic --scenario-id SYN-0003 --candidate paracetamol --enable-synthetic-demo
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment predict-synthetic --scenario-id SYN-0003 --candidate oseltamivir --enable-synthetic-demo

# Existing application experiment remains valid.
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

To inspect inputs without changing the completed run, use `audit --csv ...
--xlsx ...` (read-only), or `inspect ... --output <new-directory>`.
No training happens when a doctor clicks an application button.

Outputs in `docs/research/random_forest_200_v1/`: original source copies,
`inspection_batch.json`, `inspection_rows.csv`, `cases.jsonl`,
`candidate_rows.jsonl`, `audit.json`, frozen `plan.json`, `model.joblib`
(model + fitted preprocessing + coverage), `evaluation.json`, `evaluation.md`,
`test_errors.json`, `predictions.json`, and `manifest.json`.

The manifest checks file/source hashes and dependency versions before loading
this locally created model. Hashes detect accidental changes; they are not
signatures or proof that arbitrary pickle files are trustworthy. Do not load
models supplied by strangers. See the official
[scikit-learn persistence documentation](https://scikit-learn.org/stable/model_persistence.html).

## Next integration step and additional data needed

First add an explicitly enabled **frozen synthetic RF inspection** to the
existing Experimental ML view, preserving the task/provenance/abstention labels.
Keep this artifact distinct from the existing relevance model; a toy positive
must not become a safety clearance, prescription, dose or doctor approval.
The current run deliberately adds no API or live workflow replacement.

For patient-specific relevance or ranking, first define condition/purpose tasks
and obtain independently reviewed positive/negative applicability and preference
labels, with representative unsupported/missing cases and held-out generator
families. For dose experiments, require exact products/regimens, units,
age/weight/organ-function data, verified criteria and independent target review.
For safety, retain versioned deterministic allergy, duplicate-ingredient,
interaction, contraindication and dose controls. This dataset cannot establish
those capabilities by switching algorithms or filling absent targets.

Sixteen focused isolated tests cover ingestion, missingness, label corruption,
family leakage, forbidden inputs, train-only fitting, abstention, real RF model
persistence, explicit synthetic activation and artifact tampering. Original
model validation and two synthetic CLI predictions were also checked. No live
patient facts, reviews, database configuration, accounts or UI were changed.
