# Step 7B expanded synthetic batch

Unreviewed source-informed rule-derived labels. No model is fitted by the dataset builder.

Counts: `{'synthetic_contexts': 168, 'candidate_rows': 672, 'template_families': 28, 'base_scenarios': 56, 'condition_mapped_rows': 405, 'unique_condition_mapped_inputs': 135}`.

| Split | Contexts | Families | Mapped rows | Unique mapped inputs | Unique label balance |
| --- | ---: | ---: | ---: | ---: | --- |
| train | 102 | 17 | 255 | 85 | {'not_relevant': 12, 'relevant': 57, 'undetermined': 16} |
| validation | 30 | 5 | 75 | 25 | {'not_relevant': 6, 'relevant': 13, 'undetermined': 6} |
| test | 36 | 6 | 75 | 25 | {'not_relevant': 3, 'relevant': 17, 'undetermined': 5} |

Family/base-scenario/model-input overlap across splits: **zero**.

Condition-mapped safety outcomes: `{'blocked': 72, 'cannot_validate': 259, 'warning': 74}`. 43 relevant rows are blocked independently.

## Limits

- All labels remain unreviewed, rule-derived targets; more generated rows are not new clinical evidence.
- Families partition a single factorial generator; this is held-out symptom-pattern agreement, not independent clinical validation.
- Three safety variants deliberately share relevance features within each base scenario; fit once per unique input to avoid overweighting duplicates.
- Off-condition contrasts and unsupported diagnoses are excluded from fitting and primary model evaluation.
- Mapped antiviral targets are constant. Every condition/purpose/role group still has one candidate; no within-group ranking metric is meaningful.
- Unknown facts are explicit null/categories. The existing conservative global symptom-completeness adapter is retained.
