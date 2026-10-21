# Selected-rule Random Forest experiment

**Experimental rule imitation. Not clinically reviewed or validated.**

| Task | RF configuration | Unique train inputs | Novel test inputs | Novel rule-label agreement | Novel macro F1 | Novel abstentions | Novel false-permissive |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| allergy | depth4_leaf2 | 20 | 8 | 0.0 | 0.0 | 8 | 0 |
| duplicate_ingredient | depth4_leaf2 | 24 | 0 | None | None | 0 | 0 |
| interaction | depth4_leaf2 | 32 | 0 | None | None | 0 | 0 |
| dose | depth12_leaf2 | 345 | 155 | 0.8838709677419355 | 0.92046783625731 | 16 | 0 |
| purpose_applicability | depth8_leaf2 | 70 | 14 | 0.5 | 0.4375 | 7 | 0 |

All rows, unique rows, repeated inputs, class support, per-class errors and validation configurations are in evaluation.json.
A null novel-test metric means no novel examples; no generalization performance is established for that task.

## Limitations

- Synthetic rule imitation only; no independent clinician labels or outcomes.
- Four exact reference products with existing executable profiles; other catalogue products are unsupported by this experiment.
- Interaction labels cover selected cautions and missingness only; there are no validated safe/unsafe drug-pair labels.
- Dose classifier compares a fictional proposed regimen to an existing rule; it never generates a dose.
- Single-candidate purpose groups have no meaningful ranking ground truth. No best-medicine labels are invented.
- Held-out family compositions can repeat task-specific feature vectors; novel counts and overlap are reported per task.
- Unseen categorical inputs abstain; RF errors, including falsely permissive predictions, cannot overrule deterministic controls.
- The supplied 200 cases remain unverified and are audited separately, never promoted or used to train these classifiers.
