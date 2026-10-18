# Step 8C: small six-condition synthetic relevance dataset

This step builds and freezes an **offline inspection batch** using the existing
[Step 8B catalogue/rule contracts](STEP8B.md), source references and pure synthetic
screening helpers. It reuses the [dataset feasibility review](../../docs/research/DATASET_REVIEW_2026-10-14.md)
and the original two-condition research utilities without changing their artifacts.

Every label is **provisional, rule_derived**, from documented researcher-defined
criteria. Every clinical-review status is **not_reviewed**. No live patient data,
clinician labels/reviewer identities, medical confidence or clinical validation
is claimed. No model fitting or application integration occurs in this step.

## Delivered files

All source paths in this table are under `backend/prescription_research/expansion/`.

| File | Responsibility |
| --- | --- |
| `relevance_criteria.json` | Versioned task, label rules, feature allowlist, exclusions and interpretation |
| `relevance_templates.json` | Twelve varied fictional interview/context families and frozen family splits |
| `relevance.schema.json` | Strict bounded dataset, candidate, feature, target and safety contracts |
| `relevance.py` | Deterministic builder, schema/label checks, evidence/identity binding, CSV export, overlap reports and provenance manifest |
| `test_relevance.py` | Focused label, split, safety-separation, spoofing, missing-data, reproducibility and offline-isolation tests |

Saved outputs are in [six_condition_relevance_v1](../../docs/research/six_condition_relevance_v1/):

- `batch.json`: synthetic contexts, candidate definitions and candidate rows.
- `inspection_rows.csv`: readable symptom states, purpose, provisional label,
  criterion, independent safety status and evidence IDs for every row.
- `criteria.json`, `templates.json`, `schema.json`: snapshots used for the batch.
- `validation_report.json` / `validation_report.md`: actual counts, label support,
  grouping, constant targets, feature overlap and limitations.
- `manifest.json`: SHA-256 bindings for input code/data/contracts and output files.

The first batch is capped at **64 contexts / 384 candidate rows**. The delivered
batch is below this cap. Export happens only after schema and label checks pass;
there is no automatic expansion or live-record import option.

## Feasible learning task and provisional labels

The future learning task is candidate **purpose relevance/applicability**, using
condition, catalogue role and explicitly supplied symptom facts. Treatment purposes
stay separate: antiviral, symptom relief and rehydration support. A contrast product
is not a clinically interchangeable alternative.

The executable label order is:

1. Missing/unsupported condition -> `undetermined`; never infer a diagnosis.
2. No declared condition/purpose mapping -> `not_relevant` as a bounded contrast.
3. Mapped antiviral purpose -> `relevant`; this does not establish individual
   indication, onset suitability or dose/safety eligibility.
4. For symptom-relief/rehydration groups, any declared target explicitly present
   -> `relevant`, including when a different target is unknown.
5. All declared targets explicitly absent -> `not_relevant`.
6. Otherwise -> `undetermined`; missing is not an inferred negative.

Only these researcher-defined rules generate labels. Sources support the
condition/purpose mapping and selected boundaries, not independently labelled
patient-level treatment ground truth. Label provenance records the criterion ID,
`label_method: "rule_derived"`, references and versions. No researcher-assigned
or clinician-assigned labels are fabricated.

Each row retains scenario/family/split/condition, candidate identity and purpose,
clinical role, mapping/identity status, group, evidence references, code/data
versions and catalogue/policy hashes. Patient features are stored once in the
linked scenario; candidate definitions preserve the resolved product identities.
For ORS, exact strength/form/route/concept remain null in its unresolved product
definition. Its purpose can be relevant while deterministic identity checks block
it. No RxCUI, preparation, dilution or regimen is invented.

## Features and deterministic safety separation

The model-input allowlist contains **13 predecision fields**:

```text
condition, candidate_id, purpose, clinical_role,
fever_present, body_aches_present, itching_present, jaw_pain_present,
ocular_dryness_present, ocular_irritation_present,
diarrhoea_present, vomiting_present, recent_fluid_loss_present
```

Purpose/role comes from the frozen catalogue lookup; it can proxy the bounded
mapping task. These are not post-decision clinician actions, but they still limit
what performance would establish. Future fitting must use the explicit allowlist,
not every column of the inspection CSV or the full row object.

Targets, criterion IDs, safety findings/outcomes, references/doses, reviewer
decisions, histories, age/weight/durations, IDs, versions, family and split are
excluded from model inputs. Allergy, interaction, contraindication, product,
organ-context and dose controls remain deterministic outside ML. Raw synthetic
context and independent safety findings are retained separately for inspection.

The builder calls the **unchanged Step 8B** offline evaluator for mapped candidates.
It stores safety categories/statuses/reasons and reference availability, not dose
instructions in model features. Nonmapped/unsupported candidates get explicit
`outside_condition_mapping` / `not_evaluated` safety outcomes. No row can be
prescription eligible, approved, published or fully safety-cleared. Reported
observations remain separate from independent synthetic assessment facts.

Missing data is normalized to null/unknown without supplying guessed age, weight,
duration, allergy history, medicine identity or negative assessments. The batch
accepts only generated synthetic provenance. Reviewer claims, live patient IDs,
unknown fields, string booleans and nonfinite/out-of-range values fail checks.

## Actual inspection results

| Count | Actual result |
| --- | ---: |
| Synthetic contexts | 60 |
| Template families | 12 |
| Supported conditions | 6 |
| Research candidate identities | 6: five resolved source products + one unresolved ORS planning identity |
| Candidate rows | 360 |
| Condition-mapped rows | 81 |
| Contrast rows | 243 |
| Missing/unsupported-condition rows | 36 |
| Unique model inputs overall / mapped | 264 / 59 |

| Scope | Relevant | Not relevant | Undetermined |
| --- | ---: | ---: | ---: |
| All rows | 44 | 260 | 56 |
| Condition-mapped rows only | 44 | 17 | 20 |

Contrast rows dominate the overall balance, so future evaluation must report the
mapped-purpose subset and condition-level results separately. Among mapped rows,
**25 relevant targets have blocked/unknown safety**, including **four relevant
ORS rows that remain identity-blocked**. A relevance label cannot clear those blocks.

## Family splitting and overlap limitations

All variants/candidates of a scenario family remain in one split. The split is
declared **before any preprocessing fitting**; no preprocessing is fitted here.
The train/validation/test sets each have **20 contexts / 120 rows / 27 mapped rows**
and all three provisional classes at the mapped-subset level.

Families include explicit multi-symptom interviews, symptom resolution, incomplete
interviews, localized complaints, uncertain histories, unverified concerns, late
recovery, mixed positive/unknown reports, unresolved medicine context and unknown
etiology. Unsupported/missing conditions remain unsupported regardless of symptoms.

Disjoint families do **not** imply independent/novel model inputs. Exact inputs
overlap: train/validation **42**, train/test **48**, validation/test **12**. In the
mapped subset, validation has **26 unique inputs** (10 also in train, 16 novel),
and test has **27** (11 also in train, 16 novel). The report exposes this repetition
rather than reassigning families or manufacturing diversity for better metrics.

All **nine purpose/role groups have one candidate**. Influenza-antiviral and
varicella-antiviral groups have constant `relevant` targets. Within-group alternative
ranking is not meaningful; those groups do not support a discrimination claim.
Group/split class support and missing classes are recorded, including these limits.

**Held-out agreement is not measured:** no model has been trained in this step.
The delivered batch is for schema/label inspection and a later small research
baseline, not evidence of clinical accuracy, superiority or independent validation.

## Exact commands

From the project root in VS Code PowerShell:

```powershell
cd backend
..\.venv\Scripts\python.exe -m prescription_research.expansion.relevance
..\.venv\Scripts\python.exe -m prescription_research.expansion.relevance --validate
..\.venv\Scripts\python.exe -m unittest prescription_research.expansion.test_relevance -v
```

Additional regressions (no live clinical test records):

```powershell
..\.venv\Scripts\python.exe -m unittest discover -s prescription_research -t .
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.expansion.check --validate
..\.venv\Scripts\python.exe -m prescription_research.train validate
```

`--validate` recomputes the source-bound expected data and checks every saved byte;
it does not rewrite output. `--output PATH` exports a separate research directory.
No package installation, Django setup, network, API request or clinical database
access is needed for the builder. Existing source access metadata is reused; this
step does not claim a fresh source/clinical review or relabel the old model.

Verification for this delivery: **23 new focused dataset tests**, **75 total
offline research tests**, and **140 isolated backend tests passed**. Saved batch
byte/hash revalidation, the frozen Step 8B knowledge artifact check and the existing
two-condition model validation also passed. Existing accounts/clinical records,
database settings, live catalogue/rule reviews, UI and saved model were preserved.

## Next step: compact model comparison

Implemented follow-up: [Step 8D](STEP8D.md) now contains the three-model comparison,
frozen selected artifact, actual validation/test results and opt-in synthetic
inference. This original dataset and its inspection report remain unchanged.

Freeze this inspection artifact before fitting. Inspect available dependencies and
compare three compact models on the same declared family partitions. Fit all
preprocessing only on training families, choose the model/settings with validation,
then evaluate the frozen choice on held-out test without selecting on test scores.

Report actual class/condition/purpose support, macro and per-class behavior,
errors/abstentions, mapped versus contrast results and exact-input overlap. Report
novel-input subsets separately where support permits; tiny/constant groups require
an insufficient-variation statement. Never describe uncalibrated outputs as medical
confidence. Future expansion must use a new dataset version, preserve this batch,
and repeat schema/label checks before fitting.

Any later demo integration must be explicitly enabled, synthetic-only and labelled
Experimental ML. Deterministic blocks, unknown handling and catalogue/rule review
gates still apply. Patient-facing prescription publication remains unavailable.
