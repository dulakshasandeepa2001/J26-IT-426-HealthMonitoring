# Step 7B: Experimental ML offline results

**Experimental rule-imitation baseline. All relevance labels are rule-derived and clinically not reviewed.**

Model: `experimental-relevance-tree-2026-10-15-v1`; fitted on **85 unique condition-mapped inputs**. Tree structure: `{'nodes': 21, 'leaves': 15, 'maximum_depth': 3}`.

Dataset counts: `{'synthetic_contexts': 168, 'candidate_rows': 672, 'template_families': 28, 'base_scenarios': 56, 'condition_mapped_rows': 405, 'unique_condition_mapped_inputs': 135}`. Condition-mapped row balance: `{'not_relevant': 63, 'relevant': 261, 'undetermined': 81}`.

| Partition | Unique inputs | Agreement with provisional labels | Errors / abstentions | Majority baseline agreement |
| --- | ---: | ---: | ---: | ---: |
| train | 85 | 1.000 | 0 / 0 | 0.671 |
| validation | 25 | 1.000 | 0 / 0 | 0.520 |
| test | 25 | 1.000 | 0 / 0 | 0.680 |

Family/base-scenario/exact model-input overlap across splits is zero. Within-family safety variants share relevance inputs and are deduplicated for fitting and primary metrics.

The criteria baseline has agreement 1.0 by construction: it generated these targets. No clinical improvement or superiority is established.

| Test condition / purpose / role | Unique inputs | Agreement | Target classes |
| --- | ---: | ---: | ---: |
| chickenpox::antiviral::varicella_antiviral | 5 | 1.000 | 1 |
| chickenpox::symptom_relief::fever_relief | 5 | 1.000 | 3 |
| chickenpox::symptom_relief::itching_relief | 5 | 1.000 | 2 |
| influenza::antiviral::influenza_antiviral | 5 | 1.000 | 1 |
| influenza::symptom_relief::fever_or_aches_relief | 5 | 1.000 | 3 |

Each role group has one candidate. Antiviral labels are constant within the supported condition; within-group ranking and varying antiviral applicability are not evaluated.

## Errors on unique inputs

No disagreement on the reported unique inputs. This is still agreement with synthetic generating rules, not clinical validation.

Per-class precision/recall/F1, confusion matrices, row-weighted metrics and condition/group breakdowns are in `evaluation.json`. Unsupported diagnoses and contrast rows are excluded from these metrics.

## Limits

- All labels remain unreviewed, rule-derived targets; more generated rows are not new clinical evidence.
- Families partition a single factorial generator; this is held-out symptom-pattern agreement, not independent clinical validation.
- Three safety variants deliberately share relevance features within each base scenario; fit once per unique input to avoid overweighting duplicates.
- Off-condition contrasts and unsupported diagnoses are excluded from fitting and primary model evaluation.
- Mapped antiviral targets are constant. Every condition/purpose/role group still has one candidate; no within-group ranking metric is meaningful.
- Unknown facts are explicit null/categories. The existing conservative global symptom-completeness adapter is retained.
- Agreement measures imitation of the researcher-defined generating criteria, not clinical accuracy or independent validation.
- This compact learner is a stdlib categorical information-gain implementation, not scikit-learn CART and not a tuned benchmark.
- The generating criteria remain the exact baseline; learned agreement provides no evidence of superiority or additional clinical knowledge.
- Vocabularies and splits are fitted on deduplicated training inputs only. Null remains distinct from false; unseen categories/branches abstain.
- Small held-out pattern counts do not establish population generalization; all partitions come from the same synthetic generator.
- No numeric output is medical confidence. Leaf training support and learned paths describe engineering evidence only.
- ML relevance cannot approve medicines, clear unknown facts, override deterministic findings or publish a prescription.

Step 7C: review offline findings, then optionally build an explicitly enabled synthetic-only Django demo using this frozen artifact and existing deterministic controls.
