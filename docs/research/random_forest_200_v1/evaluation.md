# Random Forest: supplied synthetic 200-case experiment

**Experimental ML; unreviewed rule-derived toy symptom-match labels.**

CSV provides complete contexts; XLSX provides candidate labels for the same 200 cases.
Allergy/interaction/dose/clinical relevance labels are absent. No clinical safety or dose model is trained.

Candidate rows: 636; labelled: 260; unlabelled: 376.
Training: 161 labelled rows, 138 unique model inputs.
Primary selection subset: novel_unique_inputs. Selected RF: **rf_depth8_leaf2**. No validation refit or test-based selection.

| Model | Validation primary macro F1 | Agreement | Coverage |
| --- | ---: | ---: | ---: |
| rf_depth4_leaf2 | 0.8444 | 0.8571 | 1.0000 |
| rf_depth8_leaf2 | 0.8929 | 0.9048 | 1.0000 |
| rf_depth8_leaf4 | 0.8444 | 0.8571 | 1.0000 |
| training_majority | 0.4167 | 0.7143 | 1.0000 |
| decision_tree_depth6_leaf2 | 0.6971 | 0.7143 | 1.0000 |

## Selected RF: held-out test

| Subset | Inputs | Toy-label agreement | Macro F1 | Errors including abstentions | Abstentions |
| --- | ---: | ---: | ---: | ---: | ---: |
| all_labelled_rows | 66 | 0.9696969696969697 | 0.9666329625884732 | 2 | 0 |
| unique_inputs | 56 | 0.9642857142857143 | 0.9577677224736048 | 2 | 0 |
| novel_unique_inputs | 35 | 0.9428571428571428 | 0.9189814814814814 | 2 | 0 |
| inputs_seen_in_training | 21 | 1.0 | 1.0 | 0 | 0 |

Unique-input majority baseline: 0.6964285714285714
Exact labelled-input overlaps: `{"train--test": 21, "train--validation": 12, "validation--test": 10}`.

These are engineering agreement results, not medical accuracy or independent validation.

## Coverage

Trained generic candidates: bismuth_subsalicylate, calamine_zinc_oxide, carboxymethylcellulose_sodium, hypromellose, ibuprofen, loperamide, ors, paracetamol.
No training labels for: acyclovir, baloxavir_marboxil, oseltamivir, peramivir, valacyclovir, vitamin_a, zanamivir, zinc.

## Limits

- All labels are supplied synthetic symptom-match rules, not independent clinician judgments or treatment outcomes.
- Patient safety, interaction, contraindication and dose targets are absent; no such models were fitted.
- The workbook omits full context fields; CSV and XLSX describe the same 200 cases and must not be concatenated as 400.
- Blank labels remain unlabelled; undefined antiviral/adjunct tasks and incomplete targets abstain.
- Family IDs include condition; broader generator context patterns and exact feature vectors can recur across splits. Novel-input metrics do not establish independent clinical validation.
- Alternative medicines have identical toy targets within purpose. No preference labels or meaningful within-group ranking are supplied.
- The best Random Forest is validation-selected among three declared settings, not presumed superior to the decision-tree baseline.
- Headache mappings and generic candidate tasks differ from the old relevance experiment; their scores are not directly comparable.
- Candidates are generic concepts; a symptom-match prediction supplies no exact formulation, product verification, dose or safety clearance.
- Existing application artifacts and deterministic blocks are unchanged. This saved experiment is offline only.
