# Step 18 — supplied synthetic 200-case Random Forest experiment

Completed offline on 2026-10-20 using the project's existing Python virtual
environment. Full provenance, commands, limitations and model card:
[Random Forest README](../prescription_research/random_forest_200/README.md).

The CSV supplies 200 complete contexts; the XLSX supplies 636 candidate-purpose
rows for those same cases. Of those, 260 have unreviewed rule-derived symptom
match labels and 376 are unlabelled. There are no clinical safety, relevance,
dose or preference targets. No such labels or approvals were invented.

Three real scikit-learn Random Forest settings were fitted on 138 unique
training inputs. Validation selected `rf_depth8_leaf2`, with 200 trees. On 35
unique test inputs absent from training, agreement with the synthetic labels is
33/35 (94.29%), macro F1 0.9190, two errors. This is rule imitation, not clinical
accuracy or independent validation. Broad context patterns recur across splits;
the detailed report discloses exact input overlaps and class balance.

Artifacts: [evaluation](../../docs/research/random_forest_200_v1/evaluation.md),
[audit](../../docs/research/random_forest_200_v1/audit.json),
[saved model](../../docs/research/random_forest_200_v1/model.joblib),
[errors](../../docs/research/random_forest_200_v1/test_errors.json).

Existing application inference, deterministic screening, clinical records,
catalogue/review states, database configuration and working UI remain unchanged.
The new model accepts only explicitly enabled frozen fictional pairs through
the offline CLI. It cannot produce safety clearance, dosing or prescriptions.
The next integration is an explicitly labelled frozen synthetic RF viewer,
followed by task-specific independently reviewed labels for any broader model.
