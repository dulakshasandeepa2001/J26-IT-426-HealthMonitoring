# Step 8D: three-model offline training, validation selection and frozen test

This delivery fits three compact learners against the unchanged
[Step 8C six-condition synthetic inspection batch](STEP8C.md). It selects using
validation, freezes the selected artifact, then evaluates **only that choice**
on held-out test. Everything remains **Experimental ML**, clinically
**not_reviewed**, trained on provisional **rule_derived** labels.

This is an experimental rule-imitation baseline. Results do not establish
clinical accuracy, medical confidence, independent validation or superiority.
No doctor review, signature, approval date or clinical dataset is fabricated.

## Code and saved artifacts

Source files under `backend/prescription_research/expansion/`:

| File | Behavior |
| --- | --- |
| `comparison_plan.json` | Fixed model configurations, fit population, validation selection and test protocol |
| `learners.py` | Genuine fitted categorical Naive Bayes and Hamming k-NN, wrapping the existing pure information-gain tree |
| `comparison.py` | Train-only preprocessing/fitting, selection, freeze, evaluation, checksummed persistence and opt-in synthetic inference |
| `test_comparison.py` | Focused learned-state, split, selection, metric, persistence and safety verification |

Saved outputs are under
[six_condition_model_comparison_v1](../../docs/research/six_condition_model_comparison_v1/):

| Artifact | Contents |
| --- | --- |
| `models.json` | All three fitted model states, parameters, train-only vocabularies and provenance |
| `selected_model.json` | The validation-selected model and training-label provenance; no pickle or executable serialization |
| `selection.json` | Selection criteria/results, training/validation row IDs, selected-model hash; no test-based selection |
| `plan.json` | Frozen protocol snapshot |
| `evaluation.json` / `evaluation.md` | Actual metrics, class/condition/purpose support, coverage, overlap and limitations |
| `predictions.json` | Train/validation predictions for all models; test predictions for the selected model only |
| `errors.json` | Every unique-input disagreement/abstention, with split, model, scenario, candidate and reason |
| `manifest.json` | Source, dataset and output hashes |

Old two-condition model/dataset files, the live catalogue/engine/reviews, accounts,
clinical records, database settings and UI are preserved. The application has no
new prediction/training endpoint or publication capability in this step.

## Dependency-compatible algorithms

The existing Python 3.13.3 `.venv` contains no scikit-learn, NumPy, SciPy, pandas
or joblib. The comparison adds **no packages** and uses Python's standard library.

| Candidate | Fixed configuration and learned state |
| --- | --- |
| `categorical_tree` | Reuses the existing fitted information-gain tree; maximum depth 6, minimum split size 2, minimum gain 1e-12. Learns branches and leaf counts from X/y. This is not scikit-learn CART. |
| `categorical_naive_bayes` | Class priors and per-class/per-feature categorical counts, Laplace smoothing alpha=1.0. Uses internal log scores for classification, without exposing a medical-confidence score. |
| `hamming_knn` | Stores training categorical vectors/labels, k=3 and uniform mismatch counts. Includes all neighbors tied at the kth distance; equal class votes use alphabetical order. |

The [categorical Naive Bayes definition](https://scikit-learn.org/stable/modules/naive_bayes.html#categorical-naive-bayes)
documents the smoothed class-conditional count calculation. The
[nearest-neighbor reference](https://scikit-learn.org/stable/modules/neighbors.html#nearest-neighbors-classification)
describes instance-based majority voting and distance-tie sensitivity. These
official documentation pages were checked on 2026-10-16 as mathematical references;
the code here is an explicit stdlib implementation with its own declared tie and
abstention policies, not an installed scikit-learn estimator or equivalence claim.

## Fit population, features and selection

The source dataset has **60 contexts / 360 rows**. Only declared condition-mapped
rows enter this experiment: **27 training, 27 validation and 27 test rows**.
The 243 contrast and 36 unsupported-condition rows remain an audited outside-fit
population; they are not easy negative training examples or accuracy cases.

Training deduplicates identical allowed inputs: **27 unique mapped inputs**,
with class support `relevant=13`, `not_relevant=7`, `undetermined=7`. All three
models fit exactly those inputs and the same 13-field Step 8C allowlist.
No target, teacher score, reviewer decision, safety outcome, post-decision field,
age, weight, clinical assessment, dose or family/split ID enters the feature vector.

Categorical tokens/vocabularies are fitted **only on training inputs**. Null is a
distinct category from false; it is never imputed to a negative clinical fact.
An unseen training category causes abstention for every learner. An unseen local
tree branch also abstains. Neighbor counts, leaf support and internal Bayes scores
are engineering quantities, not calibrated medical confidence.

Frozen family splits remain unchanged. Validation has 26 unique mapped inputs,
including **16 absent from training** and 10 also seen in training. Test has 27,
including **16 absent from training** and 11 seen. Primary metrics give each
identical input one vote; row metrics and overlaps are reported separately.

Selection was declared before fitting:

1. Highest **macro F1 on the 16 novel mapped validation inputs**.
2. On a tie, highest prediction coverage on that same subset.
3. Then highest agreement on all unique mapped validation inputs.
4. Finally, declared candidate order.

The primary validation subset has all three provisional classes (9 relevant,
5 undetermined, 2 not relevant). Missing class variation causes selection to fail
instead of manufacturing a score. There is one predeclared configuration per
model, no hyperparameter search, no test selection and no refit on validation.

`selected_model.json` and `selection.json` are written and hash-checked **before
the test evaluator is called**. Only the selected model receives test prediction
calls. A completed run is reused; `train`/`validate` do not fit or re-predict test
when its frozen manifest already exists. Changed code/data/config is rejected,
requiring a separate versioned experiment rather than silent overwrite.

## Actual results

| Model | Novel validation macro F1 | Novel validation agreement | Novel coverage | All unique validation agreement |
| --- | ---: | ---: | ---: | ---: |
| Categorical tree | **0.6188** | 14/16 = 87.5% | 100% | 24/26 = 92.31% |
| Categorical Naive Bayes | 0.5064 | 11/16 = 68.75% | 100% | 19/26 = 73.08% |
| Hamming k-NN | 0.4603 | 8/16 = 50.0% | 100% | 14/26 = 53.85% |

The frozen validation-selected model is **categorical_tree**. This means it had
the highest declared validation metric among these configurations, not that it
is the best clinical model or universally best algorithm.

| Selected-tree test subset | Inputs | Agreement with provisional labels | Macro F1 | Errors | Abstentions |
| --- | ---: | ---: | ---: | ---: | ---: |
| All unique mapped inputs | 27 | 21/27 = **77.78%** | 0.6573 | 6 | 0 |
| Novel mapped inputs only | 16 | 10/16 = **62.50%** | 0.4110 | 6 | 0 |
| Also seen in training | 11 | 11/11 = 100% | 1.0000 | 0 | 0 |

The training-majority baseline predicts `relevant`: its novel test agreement is
9/16 = 56.25%. A difference of one correct input from that baseline on 16 fictional
cases does not establish clinical superiority or robust generalization.

Per-class precision/recall/F1, confusion matrices, condition/group support,
training metrics, duplicate-weighted metrics, learned paths and errors are in the
JSON outputs. Supported classes receiving zero predictions get F1=0; abstentions
remain in the agreement denominator and count as false negatives/errors. A class
with no support gets an explicit unavailable metric. Macro F1 states which
supported labels are included; primary selection requires all three classes.

Every purpose group has one candidate. Constant antiviral targets and other tiny
or constant subsets are marked as insufficient variation for discrimination;
there is no meaningful within-group alternative ranking. The test's novel
`not_relevant` class has only one input. Overall agreement partly reflects repeated
training inputs, which is why the novel-only result is shown separately.

The data's inherited inspection-batch limitations describe the source dataset.
The new comparison artifact is trained, while its frozen dataset report correctly
continues to say no fitting occurred during the earlier batch-building stage.

## Exact local commands

From the project root in VS Code PowerShell:

```powershell
cd backend
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison train
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
..\.venv\Scripts\python.exe -m unittest prescription_research.expansion.test_comparison -v
```

The completed default run is already saved. Repeating `train` verifies/reuses it
instead of repeating fitting or test predictions. `--output PATH` can name a new
empty research directory; it cannot silently overwrite an existing frozen run.
Later parameter/data changes should use a new plan/experiment version and new
held-out families, not tune against the now-inspected test errors.

Explicitly enabled, read-only synthetic prediction:

```powershell
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison predict-synthetic --enable-synthetic-demo --scenario-id SIX-acute_multi_symptom-06 --candidate-id ors-low-osmolarity-powder
```

This example returns a learned provisional `relevant` prediction while retaining
the deterministic ORS **product_identity block**, unavailable regimen and false
prescription-eligibility/publication flags. Prediction loads the saved artifact;
it never calls a fitting function. It only accepts frozen synthetic scenario and
candidate IDs. Missing opt-in, arbitrary/live-patient IDs and changed artifacts
fail; unsupported/unmapped pairs abstain outside the fitted task.

No dynamic patient assessment is inferred from this demonstration. Existing
unknowns, catalogue/rule review gates, deterministic safety checks and pending
product identities cannot be cleared by learned relevance. The doctor UI still
uses the existing pilot; no patient-facing prescription publication is enabled.

Verification: **23 new focused comparison/learner tests**, **98 total offline
research tests** and **140 isolated backend tests passed**. Saved comparison,
Step 8C dataset, Step 8B knowledge and original two-condition model validation
passed. Frozen source/dataset inputs, database settings and the original model
retained their hashes. The opt-in ORS example returned a learned relevance label
while keeping its identity block and false prescription/publication flags.

Regression commands:

```powershell
..\.venv\Scripts\python.exe -m unittest discover -s prescription_research -t .
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.expansion.relevance --validate
..\.venv\Scripts\python.exe -m prescription_research.expansion.check --validate
..\.venv\Scripts\python.exe -m prescription_research.train validate
```

## Next integration step

Implemented separately in [Step 8E](STEP8E.md): an opt-in read-only workspace
wrapper. This document and the frozen results above describe the offline training
delivery; no model/dataset artifact was rewritten for the UI integration.

Add a read-only, explicitly enabled **Experimental ML** panel for synthetic demo
consultations, loading the saved selected artifact without retraining. Show its
version, rule-derived/not-reviewed provenance, scope, disagreement/coverage limits
and independent deterministic findings. Keep existing patient flows and review
gates intact; real-patient prescribing and publication are outside this prototype.

For a further research experiment, inspect the error categories and define a new
versioned set of diverse families with fresh held-out cases. Do not retrofit this
test set or invent labels/reviews to improve the reported numbers.
