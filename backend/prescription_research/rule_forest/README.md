# Selected-rule Random Forest: labels and models

Version: `selected-rule-imitation-rf-2026-10-20-v1`.
Completed as an **offline synthetic rule-imitation experiment**, not a clinical
safety model, dose generator or validated best-medicine recommender.

Integration update: [Step 20](../../prescription_context/STEP20.md) documents
the separate versioned adapter for saved synthetic screening consultations.
The original training run/CLI remain unchanged; no clinical validation or
live-patient model use is added by that adapter.

## What was added

`criteria.json` documents researcher-defined target semantics. `dataset.py`
reuses the existing pure `prescription_drafts.engine` functions, versioned
`safety_profiles.json`, catalogue and existing expansion condition mappings.
It creates inspectable fictional proposals and labels, keeping five targets
separate. `experiment.py` trains, evaluates, saves and verifies five real
scikit-learn RF classifiers. Twenty isolated tests check label semantics,
leakage, persistence and deterministic precedence.

There are **four exact source-reference products**, covering seven existing
condition/clinical-role mappings: paracetamol 500 mg tablet, oseltamivir 75 mg
capsule, acyclovir 800 mg tablet and calamine/zinc oxide lotion. Mapped
conditions are influenza, chickenpox, measles and mumps. This experiment does
not silently extend product/dose coverage to the other catalogue medicines,
conjunctivitis or gastroenteritis. Those need their own product-bound tasks.

No application inference, safety engine, review state, patient history, account,
database configuration or working UI was changed. Existing artifacts were
verified unchanged. No training runs during requests and no new endpoint exists.

## New labels and their limits

| Target | Meaning | What it does not establish |
| --- | --- | --- |
| allergy | Existing supported ingredient/cross-hypersensitivity rule: `blocked`, `cannot_validate`, `no_selected_issue` | Allergy clearance, excipient safety or comprehensive cross-reactivity |
| duplicate ingredient | Existing exact-alias ingredient duplicate check | Permission to continue, stop or replace an existing medicine |
| interaction | Selected medicine-history/LAIV cautions: `cannot_validate`, `review_required`, `no_selected_issue` | A comprehensive safe/unsafe drug-pair interaction database |
| dose | A proposed fictional regimen `matches_selected_rule`, `mismatch` or `cannot_validate` | A learned numeric dose or appropriate clinical treatment |
| purpose applicability | Provisional treatment-purpose relevance, missing context, no target or explicit guideline recommendation against the selected pathway | Optimal choice, comparative benefit or an approved prescription |

Every label has `label_method="rule_derived"`,
`clinical_review_status="not_reviewed"`, rule hash/version, criteria version,
scenario ID, family, split and evidence IDs. None is a clinician judgment.
There are no invented reviewer names, signatures or review dates.

Synthetic fixture fields with historical engine names such as `confirmed`,
`verified_symptoms` and `symptoms_reviewed` represent **hypothetically complete
fictional inputs**, not recorded doctor actions. Raw engine messages describing
real clinician attestations are deliberately not copied into these labels.
The research review gate is never treated as completed.

Allergy blocks are retained alongside unresolved items. Unknown histories remain
unknown. Acetaminophen/warfarin is a source caution requiring review, not a newly
invented absolute contraindication; the exact warfarin product is outside this
catalogue, so the unresolved-pair limitation remains. LAIV timing is a selected
oseltamivir caution. Even `no_selected_issue` is only a result of the implemented
check, never comprehensive safety.

Dose labels call the existing `reference_regimen` and `validate_dose` through the
pure engine. Proposals include wrong mass, route, units, spacing/frequency,
course, PRN schedule and missing regimens. Missing age/required weight, renal
assessment or the required strength/formulation produces `cannot_validate`;
the builder does not fill those facts or substitute a different product.
Existing PRN instructions remain PRN; no fixed course is invented.

Purpose and safety remain separate. A relevant purpose may still have an allergy
block, unsupported dose or unknown interaction. Explicit WHO non-severe
oseltamivir selection has `guideline_against`; severe/hospital/unknown contexts
are `cannot_validate`, not an extrapolation of that recommendation. CDC is never
substituted for WHO. The selected onset windows are the encoded research scope,
not a claim that all later presentations should go untreated.

**No best-medicine or preference labels were fabricated.** All seven implemented
condition–clinical-role groups contain one product. Antiviral, fever relief and
itch relief retain different purposes; sorting them together would invent a
comparison. This experiment reports purpose applicability and guarded fictional
references, with `ranking=not_supported`. Independent preference or outcome
evidence is still needed for comparative ranking.

## Evidence handling

Product-specific existing evidence metadata is saved in `evidence.json` and
linked from each row. The following primary pages were checked on 2026-10-20:

- [Acetaminophen label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee): ingredient, duplicate-product, liver and warfarin cautions; directions and symptom review limits.
- [Tamiflu label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b): treatment/formulation/renal sections and LAIV timing.
- [Acyclovir label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=05f42300-2a06-45f1-a9b9-6e5c84ae58ec): chickenpox dosing, renal and hypersensitivity sections.
- [Calamine/zinc oxide label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4a79259e-64ac-d187-e063-6294a90a78db): external-use directions and precautions.
- [CDC varicella guidance](https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html): risk-group and timing guidance.
- [CDC influenza guidance](https://www.cdc.gov/flu/hcp/antivirals/summary-clinicians.html) and [WHO influenza guidelines](https://www.ncbi.nlm.nih.gov/sites/books/NBK607909/): distinguish the explicitly selected guideline pathways.

Checking a page is not clinical review, local-product equivalence, exhaustive
interaction review or endorsement. Existing conservative research age/formulation
limits remain research limits. No medical-source text was copied as independent
patient-level labels; the new labels are outputs of the documented rules.

## Dataset audit

The initial batch has 28 rows across four varied families. Checks passed before
expanding to **1,078 candidate scenarios in 54 families**:

| Split | Families | Rows |
| --- | ---: | ---: |
| Train | 34 | 714 |
| Validation | 8 | 112 |
| Test | 12 | 252 |

Families include isolated changes and held-out combinations of allergy/history,
proposal errors, pediatric weight/formulation, renal/hepatic missingness,
symptom presence/duration, guideline and clinical-scope uncertainty. Each family
stays in one split across every condition, product and numerical variant.
These are controlled software fixtures, not representative clinical cases or
an estimated patient population. Repeated subtask inputs are explicitly audited.

The supplied **200 cases / 636 pairs remain separate**. Their original source
hashes are preserved. Unverified histories, missing exact products and absent
proposed regimens receive `cannot_validate` audit labels; no facts or doses are
invented and these audit rows are not used for training. The original workbook
and its toy symptom-match labels remain unchanged. Audit provenance does not
turn reported absence of history into doctor-confirmed absence.

## Fitting and actual results

Each target has its own feature allowlist and fitted preprocessing. Inputs are
raw fictional histories, product identity and task-appropriate patient/proposal
fields. Labels, teacher checks/reasons/scores, reference answers, IDs, families,
split membership, proposal-generation mode, reviews and post-decision outputs
are excluded. Numeric-dose comparison uses a *proposed regimen* as an input;
it is not dose generation. Safety features are not injected into purpose labels.

Identical inputs are deduplicated before fitting, with conflicting targets
rejected. `DictVectorizer` is fitted on training data only. Three predeclared RF
settings (depth 4/8/12, minimum leaf 2, 160 trees, balanced subsampling, fixed
seed 20261020) are compared per task on validation macro F1. Novel unique inputs
are used where present; otherwise the explicitly reported fallback is unique
validation inputs. There is no test-based selection or validation refit.

| Task | Unique training inputs | Unique test agreement | Novel test inputs | Novel agreement | Interpretation |
| --- | ---: | ---: | ---: | ---: | --- |
| Allergy | 20 | 8/16 = 50% | 8 | 0/8; all abstained | Novel name/combination categories are unsupported; no generalization established |
| Duplicate ingredient | 24 | 20/20 = 100% | 0 | N/A | Repeated inputs only; no novel-input performance claim |
| Selected interaction | 32 | 23/24 = 95.83% | 0 | N/A | One distinct falsely permissive prediction; no novel-input performance claim |
| Proposed dose comparison | 345 | 137/155 = 88.39% | 155 | 88.39% | 18 errors including 16 abstentions; no dose-generation or clinical accuracy claim |
| Purpose applicability | 70 | 52/63 = 82.54% | 14 | 7/14 = 50% | Seven novel abstentions; limited rule-imitation coverage |

Raw repeated rows would inflate apparent performance. They are reported in the
JSON, but unique/novel results above are the useful interpretation. Novel allergy
macro F1 is 0, dose macro F1 0.9205 and purpose macro F1 0.4375. The novel dose
test subset has 34 rule matches, 61 mismatches and 60 cannot-validate cases.
The purpose test has **no not-relevant class**, so performance for that class
is unmeasured. Class balances, supports, confusion matrices, baseline results,
validation settings and all errors are saved without suppressing failures.

The falsely permissive interaction pattern is oseltamivir with unknown LAIV
timing: it appears in three numerical test variants but is one distinct model
input. It must remain `cannot_validate`. The CLI example below exposes the ML
error, retains that deterministic result and withholds the fictional reference.
No settings were tuned in response to test errors. These results do **not**
justify deploying learned safety decisions in place of deterministic checks.

## Running locally

Use the optional dependencies already installed for the previous RF experiment.
From the repository root:

```powershell
Set-Location backend

# Initial build/training already completed; frozen runs cannot be overwritten.
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment inspect
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment build
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment train

# Run now to verify, test and inspect the completed run.
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment verify
..\.venv\Scripts\python.exe -m unittest prescription_research.rule_forest.test_experiment -v
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment inspect-synthetic --scenario-id RF-RULE-test__route_vaccine-1-flu-antiviral --enable-synthetic-demo

# Preservation checks for both earlier experiments.
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment verify
..\.venv\Scripts\python.exe -m prescription_research.expansion.comparison validate
```

For a new independent run, use a new `--output` directory consistently for build,
train and verify. Changing labels/teacher/code requires a new version and run,
not editing a frozen artifact. No scripts accept a live patient or consultation
ID. `inspect-synthetic` accepts only a frozen fictional ID and explicit enable.

Artifacts: `docs/research/selected_rule_rf_v1/inspection_batch.json`,
`inspection_rows.csv`, `dataset.jsonl`, `criteria.json`, `templates.json`,
`evidence.json`, `audit.json`, `source_200_labels.jsonl`,
`source_200_audit.json`, `source_bindings.json`, `models.joblib`,
`evaluation.json`, `evaluation.md`, `test_errors.json` and `manifest.json`.
Saved models contain their fitted encoders, coverage vocabulary and provenance.
Hashes and dependency versions are verified before loading the locally created
joblib file. Hashes are integrity checks, not signatures; do not load untrusted
pickle/joblib models.

## Deterministic precedence and next step

The synthetic comparison displays ML predictions separately from deterministic
labels and obstacles. A block, unknown, unresolved caution, abstention or model
disagreement withholds the fictional reference regimen. Even a displayed
fictional reference has `prescription_eligible=false`, `approved=false`,
`published=false`, `clinical_review_status=not_reviewed`. It does not satisfy a
live catalogue or rule review. There is no numeric ML dose output or medical
confidence score.

Next integration can add this explicitly labelled frozen comparison to the
Experimental ML view. Live screening must continue using deterministic rules.
For wider medicine coverage, implement and review exact product-bound rules
first; for best-medicine ranking, define within-purpose alternatives and obtain
independent applicability/preference judgments or suitable outcome evidence.
Increasing synthetic counts or changing RF settings cannot supply that evidence.
