# Six-condition synthetic relevance inspection batch

**Offline; provisional rule-derived labels; clinical review: not_reviewed. No model fitted.**

## Actual counts

- synthetic_contexts: 60
- candidate_rows: 360
- template_families: 12
- supported_conditions: 6
- candidate_identities: 6
- resolved_products: 5
- unresolved_planning_identities: 1
- condition_mapped_rows: 81
- contrast_rows: 243
- unsupported_condition_rows: 36
- unique_model_inputs: 264
- unique_mapped_model_inputs: 59

All-row class balance: `{"not_relevant": 260, "relevant": 44, "undetermined": 56}`.
Mapped-purpose class balance: `{"not_relevant": 17, "relevant": 44, "undetermined": 20}`.

## Frozen family splits

| Split | Contexts | Rows | Mapped rows | Unique inputs | Inputs also in train |
| --- | ---: | ---: | ---: | ---: | ---: |
| train | 20 | 120 | 27 | 120 | n/a |
| validation | 20 | 120 | 27 | 114 | 42 |
| test | 20 | 120 | 27 | 120 | 48 |

Exact input overlaps: `{"train--test": 48, "train--validation": 42, "validation--test": 12}`. Families never cross splits; input overlap is reported, not concealed.

Mapped rows relevant but blocked/unknown: 25; relevant ORS rows still identity-blocked: 4.
Constant-target groups: flu-antiviral, varicella-antiviral. No meaningful within-group ranking.

## Mapped-purpose group variation

| Group | Relevant | Not relevant | Undetermined | Candidates |
| --- | ---: | ---: | ---: | ---: |
| flu-fever-aches | 4 | 2 | 3 | 1 |
| flu-antiviral | 9 | 0 | 0 | 1 |
| varicella-fever | 4 | 3 | 2 | 1 |
| varicella-antiviral | 9 | 0 | 0 | 1 |
| varicella-itch | 2 | 4 | 3 | 1 |
| measles-fever | 4 | 2 | 3 | 1 |
| mumps-fever-pain | 4 | 2 | 3 | 1 |
| conjunctivitis-lubrication | 4 | 2 | 3 | 1 |
| gastroenteritis-rehydration | 4 | 2 | 3 | 1 |

Held-out agreement: not measured. Preprocessing/model fitting: not performed. Prescription-eligible rows: 0.

## Limits

- Labels imitate documented researcher-defined rules; there is no independent clinical ground truth.
- Purpose/role lookup is part of the bounded task and can proxy the mapping rules.
- One candidate per purpose group; no meaningful within-group alternative ranking.
- Mapped antiviral targets are constant; do not force per-group discrimination metrics.
- Template-family separation is enforced, but exact model inputs can repeat across splits; reported overlap limits novelty claims.
- Only a small set of symptom patterns is covered. This is an inspection batch, not a trained or clinically validated model.
- ORS is an unresolved planning identity: purpose relevance never supplies composition, dilution or a dose.
- Contrast rows dominate the overall distribution; future evaluation must report mapped-purpose and condition-level results separately.

See backend/prescription_context/STEP8C.md for task, provenance, commands and next-model requirements.
