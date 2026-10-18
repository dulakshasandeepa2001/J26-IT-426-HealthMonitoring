# Six-condition three-model comparison

**Experimental ML: provisional rule-derived labels, clinical review not_reviewed.**

Fitted on 27 unique mapped training inputs from the unchanged inspection batch. No extra packages.

## Validation selection

Primary: macro F1 on 16 unique validation inputs absent from training; secondary coverage; tertiary all-mapped validation agreement. No test-based selection.

| Model | Novel validation macro F1 | Novel agreement | Novel coverage | All unique validation agreement |
| --- | ---: | ---: | ---: | ---: |
| categorical_tree | 0.6188 | 0.8750 | 1.0000 | 0.9231 |
| categorical_naive_bayes | 0.5064 | 0.6875 | 1.0000 | 0.7308 |
| hamming_knn | 0.4603 | 0.5000 | 1.0000 | 0.5385 |

**Validation-selected model: `categorical_tree`.** No refit on validation.

## Frozen selected model: held-out test

| Subset | Inputs | Agreement with provisional labels | Macro F1 | Errors including abstentions | Abstentions |
| --- | ---: | ---: | ---: | ---: | ---: |
| all_mapped_rows | 27 | 0.7778 | 0.6573 | 6 | 0 |
| all_mapped_unique | 27 | 0.7778 | 0.6573 | 6 | 0 |
| novel_mapped_unique | 16 | 0.6250 | 0.4110 | 6 | 0 |
| seen_in_training_unique | 11 | 1.0000 | 1.0000 | 0 | 0 |

Only the selected model was tested. These values measure imitation of the generating rules, not clinical accuracy or superiority.

## Baseline and coverage

Training-majority class: `relevant`. Selected-test novel agreement for that baseline: 0.5625.
Coverage audit: `{"contrast_rows_outside_fitted_task": 243, "mapped_rows": 81, "total_rows": 360, "unsupported_rows_outside_fitted_task": 36}`. Contrast/unsupported rows were not fitted or used as easy negative metric cases.

Per-class precision/recall/F1, confusion matrices, condition/purpose support, learned paths/neighbor support and every error/abstention are in the JSON artifacts.

## Limits

- Labels imitate documented researcher-defined rules; there is no independent clinical ground truth.
- Purpose/role lookup is part of the bounded task and can proxy the mapping rules.
- One candidate per purpose group; no meaningful within-group alternative ranking.
- Mapped antiviral targets are constant; do not force per-group discrimination metrics.
- Template-family separation is enforced, but exact model inputs can repeat across splits; reported overlap limits novelty claims.
- Only a small set of symptom patterns is covered. This is an inspection batch, not a trained or clinically validated model.
- ORS is an unresolved planning identity: purpose relevance never supplies composition, dilution or a dose.
- Contrast rows dominate the overall distribution; future evaluation must report mapped-purpose and condition-level results separately.
- Twenty-seven unique mapped training inputs and sixteen novel validation/test inputs are too small for a clinical generalization claim.
- Validation chooses among three fixed configurations; validation results are selection data, not an independent final estimate.
- Only the frozen validation-selected model is tested; no test-based model or parameter selection or validation refitting.
- The stdlib learners are explicit experimental implementations, not scikit-learn estimators or a production benchmark.
- Categorical token vocabularies are learned from training only. Unseen categories/branches abstain; supported-class abstentions count as errors/FN.
- Uncalibrated internal Bayes scores and neighbor votes are not medical confidence and are not exposed as such.
- No learned prediction clears deterministic blocks or unknowns, changes review status, or authorizes a prescription.

See backend/prescription_context/STEP8D.md for commands, algorithms and synthetic-only inference.
