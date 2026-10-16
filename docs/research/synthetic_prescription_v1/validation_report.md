# Step 7A synthetic batch validation

Schema and provenance checks passed. This is an offline, unreviewed research batch; no model was trained.

36 contexts; 144 scenario-product rows; 18 template families. 85 rows have a pilot condition mapping; 59 are contrast/unsupported rows.

| Label | Rows |
| --- | ---: |
| not_relevant | 56 |
| relevant | 74 |
| undetermined | 14 |

Condition-mapped row labels: `{'not_relevant': 5, 'relevant': 74, 'undetermined': 6}`. Contrast/unsupported labels: `{'not_relevant': 51, 'undetermined': 8}`. Keep these populations separate in later evaluation.

| Split | Contexts | Families | Rows | Labels |
| --- | ---: | ---: | ---: | --- |
| train | 20 | 10 | 80 | {'not_relevant': 33, 'relevant': 44, 'undetermined': 3} |
| validation | 8 | 4 | 32 | {'not_relevant': 14, 'relevant': 18} |
| test | 8 | 4 | 32 | {'not_relevant': 9, 'relevant': 12, 'undetermined': 11} |

| Condition | Contexts | Rows | Labels |
| --- | ---: | ---: | --- |
| chickenpox | 17 | 68 | {'not_relevant': 21, 'relevant': 43, 'undetermined': 4} |
| influenza | 17 | 68 | {'not_relevant': 35, 'relevant': 31, 'undetermined': 2} |
| unknown | 1 | 4 | {'undetermined': 4} |
| viral_urti | 1 | 4 | {'undetermined': 4} |

| Supported condition/purpose/role group | Candidates | Labels |
| --- | ---: | --- |
| chickenpox::antiviral::varicella_antiviral | 1 | {'relevant': 17} |
| chickenpox::symptom_relief::fever_relief | 1 | {'not_relevant': 2, 'relevant': 13, 'undetermined': 2} |
| chickenpox::symptom_relief::itching_relief | 1 | {'not_relevant': 2, 'relevant': 13, 'undetermined': 2} |
| influenza::antiviral::influenza_antiviral | 1 | {'relevant': 17} |
| influenza::symptom_relief::fever_or_aches_relief | 1 | {'not_relevant': 1, 'relevant': 14, 'undetermined': 2} |

Research safety outcomes: `{'blocked': 10, 'cannot_validate': 47, 'not_evaluated': 59, 'warning': 28}`. 10 relevant rows are independently blocked.

48 distinct allowed model input vectors; 8 occur across splits. Template family overlap is zero; identical model inputs are still possible because safety facts are excluded.

Held-out agreement and model errors: **unavailable (no fitting in Step 7A)**.

## Limitations

- This batch verifies schema, provenance and research engineering; no clinician labels or clinical validation exist.
- All relevance labels imitate documented researcher-defined rules. Evidence references do not supply independent patient-level labels.
- Condition-mismatch rows are negative contrasts, not interchangeable treatment alternatives.
- Each supported condition/purpose/role group has one candidate; within-group ranking performance is not meaningful.
- Mapped antivirals are always relevant to their purpose under this target; no within-condition applicability variation is learned for them.
- Complete synthetic symptom facts are mapped to historical engine flags only for simulation; no clinical review gates are evaluated.
- Static safety findings cover selected rules only. A reference regimen being calculable is not safety clearance or approval.
- 8 identical allowed feature vectors occur across family splits; agreement later could reflect repeated inputs as well as rule imitation.
- The small fixed template set is not a population sample. Labels and feature diversity must be reviewed before expansion or fitting.
- The validation split has no undetermined labels; class-specific validation agreement for that class cannot be measured in this batch.
- No model was fitted: held-out agreement/error metrics are unavailable, not zero.

Inspect this batch/criteria, settle feature repetition and coverage, then Step 7B: offline training/evaluation with train-only preprocessing and a rules baseline.

Rebuild/validate commands are in `backend/prescription_context/STEP7A.md`.
