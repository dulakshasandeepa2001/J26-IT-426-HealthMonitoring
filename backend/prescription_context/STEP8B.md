# Step 8B: offline six-condition catalogue and deterministic rule staging

Implemented 2026-10-16 after the [2.1 handoff](STEP8A.md), reusing the existing
[scope/evidence matrix](../../docs/research/SIX_CONDITION_SCOPE_EVIDENCE_2026-10-16.md),
[dataset feasibility review](../../docs/research/DATASET_REVIEW_2026-10-14.md),
four static pilot products, their reference policies and the pure screening engine.

**This delivery is an offline research bundle.** Its catalogue/policies are all
`not_reviewed`, it has no database importer or live API, and it never makes a
prescription eligible. The doctor UI continues to use the existing pilot. No
clinician identity, signature, review date, decision or validation is fabricated.

## Delivered files and behavior

| Files | Purpose |
| --- | --- |
| `prescription_research/expansion/changes.json` | Source-linked pending Measles/Mumps uses and the single-product CMC solution identity |
| `expansion/catalogue.schema.json`, `expansion/knowledge.py` | Bounded catalogue **2.0** contract, primary-source URL/date/reference validation, assembly and fixed product/purpose identities |
| `expansion/policies.json` | Nine condition/purpose/role groups; selected condition assessments and explicit handlers |
| `expansion/case.schema.json`, `expansion/screening.py` | Strict synthetic input contract, unknown defaults, reused pilot checks and explicit eye/ORS handling |
| `expansion/check.py` | Reproducible offline export/validation and 25 inspectable technical fixtures |
| `expansion/test_expansion.py` | Focused identity, missing-fact, safety, provenance and isolation checks |
| `docs/research/six_condition_knowledge_v1/` | Saved bundle, rule-check fixtures, JSON/Markdown reports and SHA-256 manifest |

The `expansion/` paths above are under `backend/prescription_research/`.
Catalogue 2.0 is a separate contract from the Member 1 analysis schema. The live
catalogue seeder still accepts its original 1.0 bundle; it does not consume this
staged output. No migration, seed, account change or live clinical update is run.

## Coverage

| Condition | Candidate and purpose | Staged handler |
| --- | --- | --- |
| Influenza | Paracetamol: fever/aches; Oseltamivir: antiviral purpose | Original product rules reused offline |
| Chickenpox | Paracetamol: fever; Acyclovir: selected antiviral purpose; Calamine: itch relief | Original product rules reused offline |
| Measles | Paracetamol: fever relief | Oral PRN reference reused with separate complication assessments |
| Mumps | Paracetamol: fever/aches/jaw-pain relief | Same product reference, mapping-specific targets and separate complication assessments |
| Viral conjunctivitis | CMC sodium 0.5% ophthalmic solution: lubrication for dryness/irritation | Explicit ophthalmic handler |
| Viral gastroenteritis | ORS: fluid/electrolyte replacement purpose | Explicit unavailable-product handler; no regimen |

There are **five resolved reference products**, **one unresolved ORS planning
identity**, and **nine purpose groups** (eight with a resolved product). Each group
has only one candidate. They do not become interchangeable alternatives, and no
meaningful within-group ranking is claimed. A symptom-support mapping does not
create a disease-specific product-label indication or treat the underlying virus.

For the new four-condition mappings, 18+ is a **research simplification**, not a
product-label contraindication. Original live/pilot pediatric policies are unchanged.

## Deterministic behavior

Existing checks for supported ingredient allergies, duplicate current ingredients,
unresolved medicine identities, selected interactions, organ context, age/formulation,
onset and relevant symptoms remain outside ML. The offline adapter calls the pure
pilot engine for the four legacy product kinds. It retains finding categories and
statuses, rather than presenting its historical doctor-oriented messages as actual
synthetic clinician attestations. Existing oral PRN limits are reused without
changing the original policy; jaw pain inherits its general-pain review limit.

Measles and Mumps add selected independent condition-assessment requirements.
Unknown concerns withhold a reference; positive concerns leave this bounded
research pathway. These are researcher-defined controls derived from the planning
matrix, not a complete referral protocol. The eye handler independently requires
selected eye assessments, product-integrity and excipient context. It checks active
ingredient allergy, duplicate ingredients and incomplete/pair medicine histories.
Unknown/positive scope facts prevent a reference; selected pair cautions also withhold it.

The CMC reference preserves the source's drop range and as-needed expression,
with the ophthalmic route. It invents no fixed daily frequency, course length or
drop-to-mL/mg conversion. Persistent/worsening symptoms and selected eye concerns
require reassessment. Skin-lotion logic and chickenpox antiviral dosing are never
used as fallbacks for an eye product. Unknown handler identities fail validation.

ORS always receives an identity block. Its RxCUI, strength, composition,
reconstitution volume and regimen remain **null**. Dehydration/tolerance/selected
GI facts can add assessment findings but never clear the unresolved product.
A WHO formulation reference or the earlier local sales listing cannot establish
an exact commercial preparation. No recipe, sachet quantity or fluid dose is invented.

Every returned row carries `simulation_only: true`, `clinical_review_status:
"not_reviewed"`, `review_gate_evaluated: false`, `eligible_for_prescription: false`,
`full_safety_clearance: false`, `approved: false`, and `published: false`.
An `experimental_reference` means only that the supplied fictional context did
not trigger these selected technical obstacles; it is not clinical clearance.

## Unknowns, provenance and input isolation

The case contract requires `synthetic_only: true` and
`fact_origin: "synthetic_researcher_defined"`. It rejects patient/doctor IDs,
review claims, unknown fields, string booleans, nonfinite/out-of-bound numbers and
contradictory absent-positive-duration values. Missing facts are explicitly unknown;
no DOB, weight, onset or negative assessment is invented. It has no live-record reader.

`reported_observations` is independent of `patient_features.condition_assessments`.
A reported negative never fills an unknown independent assessment. Positive
selected source concerns prevent the reference even when a separate supplied
synthetic assessment was negative. The original input object is not mutated.
The case fixture's historical internal `verified_symptoms`/`symptoms_reviewed`
engine names represent supplied synthetic completeness, not a real doctor action.

The builder uses only repository files and Python's standard library. It imports
no Django, opens no database/network connection, fits no ML and uses no new package.
All original source metadata is preserved. The manifest binds the original static
catalogue/policies/engine, reused research utilities, new code/schemas/policies and
all exported artifacts. `--validate` rejects stale or changed bytes without rewriting.

## Primary evidence checked for this implementation

| Reference | Recorded use / handling |
| --- | --- |
| [NHS Measles](https://www.nhs.uk/conditions/measles/) | Symptom-support mapping and selected assessment boundaries; accessed 2026-10-16; no exact publication date invented |
| [NHS Mumps](https://www.nhs.uk/conditions/mumps/) | Symptom-support mapping and selected complication boundaries; accessed 2026-10-16 |
| [CDC Measles overview](https://www.cdc.gov/measles/hcp/clinical-overview/stay-alert-for-measles-cases.html) | Broader supportive-care limits; source date 2026-01-26; accessed 2026-10-16; supervised vitamin A remains outside this handler |
| [CMC DailyMed label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=329d1fe0-4432-4565-b7b1-65666bd86526) | Bind single solution/drop product NDC 0023-0798, SCD 1188426; exclude the co-packaged kit. Source label updated 2022-06-30; current SPL archive publication 2024-09-27; accessed 2026-10-16 |
| [CDC conjunctivitis care](https://www.cdc.gov/conjunctivitis/treatment/index.html) | Class-to-product lubrication mapping and selected eye/context boundaries; source date 2024-04-15; accessed 2026-10-16 |
| [NIDDK gastroenteritis treatment](https://www.niddk.nih.gov/health-information/digestive-diseases/viral-gastroenteritis/treatment) | Fluid-replacement purpose and treatment limits; publisher review month 2018-05; page checked 2026-10-16 |
| [WHO ORS overview](https://www.who.int/publications/i/item/WHO-FCH-CAH-06.1) | Formulation/manufacturing guidance page dated 2006-01-01, checked 2026-10-16; no full PDF/local product label is claimed |
| Existing pilot sources, including [acetaminophen label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee) | Static original identities/dose policies reused with their recorded 2026-10-13 access metadata; acetaminophen identity/selected warnings were also cross-checked, without fabricating a new clinical review |

Foreign reference labels/guidance do not establish Sri Lankan availability,
registration or local equivalence. Selected source-based controls do not replace
later clinical assessment, infection-control/public-health workflows or validation.

## Exact commands

From the project root in the VS Code PowerShell terminal:

```powershell
cd backend
..\.venv\Scripts\python.exe -m prescription_research.expansion.check
..\.venv\Scripts\python.exe -m prescription_research.expansion.check --validate
..\.venv\Scripts\python.exe -m unittest prescription_research.expansion.test_expansion -v
```

Existing offline research regression checks and isolated application tests:

```powershell
..\.venv\Scripts\python.exe -m unittest discover -s prescription_research -t .
..\.venv\Scripts\python.exe manage.py test prescription_context medicine_knowledge prescription_drafts --settings=medicare_project.test_settings --noinput
```

Read [validation_report.md](../../docs/research/six_condition_knowledge_v1/validation_report.md)
and inspect `bundle.json` / `rule_checks.json` in the same folder. `--output PATH`
can export a separate research directory; no API request invokes this command.

## Actual results and limits

The saved run contains **25 synthetic technical cases** (four variations per
condition plus one unsupported case), **36 candidate-rule evaluations**,
**17 blocked**, **8 cannot_validate**, and **11 warning** aggregates. Eleven
experimental references are present; **zero rows are prescription eligible**.
These counts measure engineering behavior, not clinical accuracy or ML performance.
This fixture deliberately has no relevance labels or train/test split; it is not
the next ML dataset.

Verification: **25 new focused checks**, **52 total offline research checks**,
and **140 isolated backend tests passed**. Artifact revalidation passed. The final
allergy guard was followed by another successful run of all 25 focused checks.
The 11 protected pilot/engine/settings/model files matched their original SHA-256
hashes. Frontend code is unchanged in this offline stage.

No live catalogue/rule rows, review history, patient records, accounts, settings,
UI or saved model were changed. Live review hashes remain bound to their original
code/data. Activating new content in a future integration must version the bound
catalogue/rule content and require its genuine fresh review; an old approval cannot
be copied to the expanded content.

## Next step

Implemented follow-up: [Step 8C](STEP8C.md) provides the small, schema/label-checked
six-condition relevance batch and its provenance/overlap reports. Model comparison
and any later live synthetic-demo integration remain separate stages.

Create a **small versioned six-condition synthetic relevance batch** using these
purpose/target contracts, with labels and safety outcomes stored separately.
Keep ORS purpose relevance distinct from its unavailable product/regimen, retain
missing/unsupported contexts, and check the schema/labels before expanding.
Then compare three compact baselines on common template-family partitions, fit
preprocessing only on training families, choose using validation and evaluate the
frozen choice once on held-out families. Keep every clinical-review status truthful.

Live integration remains a later, explicitly enabled synthetic-demo workflow.
The current saved model covers the original two conditions, and the doctor UI
continues to show the new four medicine pathways as pending. No new clinical
approval, patient publication or six-condition ML capability is implied by this stage.
