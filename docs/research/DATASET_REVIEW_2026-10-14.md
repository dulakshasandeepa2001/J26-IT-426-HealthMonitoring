# Dataset feasibility for Ransara's prescription-intelligence pilot

Reviewed on 2026-10-14 for the existing Influenza/Chickenpox pilot and its four
catalogue products. This review inspected primary dataset descriptions and
complete selected data files from eight datasets. It is a bounded search of
major accessible sources, not a claim that every medical dataset was searched.
Application code, clinical decisions and the application database were unchanged.

## Decision

No directly usable public dataset was verified that combines both pilot diseases,
patient-specific age/allergy/current-medicine context, the reviewed products and
independent clinical medication-relevance labels. Public data can still support
development, exploratory baselines and separate research benchmarks.

- **Best immediately accessible medication-recommendation benchmark found:
  DialMed.** It has annotated recommendation labels and defined splits, but is
  Chinese-language and its explicit diagnosis labels exclude both pilot diseases.
  It can support a separate benchmark; it is not direct training evidence for
  this project's two conditions.
- **Best broader real-EHR candidate for further investigation: full MIMIC-IV.**
  Access requires PhysioNet credentialing/training and a data-use agreement.
  Relevant cohort size and completeness remain unverified; the open demo does
  not establish adequate coverage in the full database.
- **Most practical path for the current PP1 scope: versioned, source-based
  synthetic pilot scenarios**, which the individual proposal already plans.
  These support engineering tests and provisional model development. Learned
  rankings still need independent relevance labels and later clinical review.

## Files inspected

Counts below are this local audit's results, rather than claims copied from
dataset titles. A row can be a review, dialogue, medication record or ICU stay;
these quantities are not interchangeable training-example counts.

| Dataset and version/source | Files and local counts | Pilot coverage | Suitability |
| --- | --- | --- | --- |
| [Kaggle UCI Drugs.com reviews](https://www.kaggle.com/datasets/jessicali9530/kuc-hackathon-winter-2018), version 2 | Both CSV files: 215,063 reviews | 467 exact `Influenza` labels; zero explicit Chickenpox labels. Other influenza/prophylaxis and seven broad `Varicella-Zoste` labels are separate. | Patient satisfaction/NLP baseline. No structured age, allergies or current-medicine columns; ratings are not clinical suitability labels. |
| [UCI Druglib reviews](https://archive.ics.uci.edu/dataset/461/drug+review+dataset+druglib+com) | Both TSV files: 4,143 reviews | Ten flu-related free-text condition mentions, with varying certainty; zero explicit Chickenpox labels. | Review sentiment/effectiveness baseline. No complete patient-context schema or prescribing relevance labels. |
| [Disease Symptoms and Patient Profile](https://www.kaggle.com/datasets/uom190346a/disease-symptoms-and-patient-profile-dataset) | Complete CSV: 349 rows | Eight Influenza rows and two Chickenpox rows | Contains age/symptoms and an outcome field, but no medicine target, allergy or current-medicine fields. Does not support this medication-ranking task. |
| [Medicine Details](https://www.kaggle.com/datasets/singhnavjot2062001/11000-medicine-details) | Complete CSV: 11,825 product rows | Products have composition/uses text, not patient-disease-treatment instances | Catalogue exploration. No patient-level recommendation ground truth; aggregated review percentages do not supply it. |
| [Synthea latest CSV sample](https://synthetichealth.github.io/downloads.html) | Sample includes 108 patient records, 3,517 condition rows, 3,850 medication rows and 105 allergy rows | No Influenza/Chickenpox/varicella descriptions in the sample's conditions table | Useful synthetic history structure and pipeline testing. Sample coverage is not evidence that all Synthea modules lack these conditions. |
| [MIMIC-IV Demo 2.2](https://physionet.org/content/mimic-iv-demo/2.2/) | Complete patient table: 100 people; complete diagnosis table: 4,506 rows | One Influenza-coded patient/diagnosis, ICD-9 `4870`; zero Chickenpox-coded patients | Useful schema exploration, insufficient verified pilot coverage for training. Prescription/code-dictionary downloads were incomplete and excluded from counts. |
| [eICU Demo 2.0.1](https://physionet.org/content/eicu-crd-demo/2.0.1/) | Complete selected tables: 2,520 unit stays, 24,978 diagnosis rows, 2,475 allergy rows and 7,417 admission-drug rows | Zero matching pilot diagnoses in the coded/text diagnosis fields inspected | Useful hospital context schema. The separate medication-orders file was incomplete and excluded. ICU population does not establish coverage of the outpatient pilot. |
| [DialMed](https://github.com/f-window/DialMed), current retrieved files | All provided splits: 9,605 train, 1,192 dev, 1,199 test = 11,996 dialogues; 70 medication labels | Explicit diagnosis lists contain neither pilot condition. They include URTI, pneumonia, dermatitis and gastrointestinal/hepatic conditions. | Closest open task-specific benchmark found, with substantial language, disease and product mapping differences from this project. |

Druglib's ten related mentions include `flu`, `the flu`, `swine flu`, `cold / flu`
and uncertain flu-like illness labels. They were counted as related text, not
silently converted into confirmed seasonal influenza. Broad varicella-zoster
labels in Drugs.com were not treated as confirmed Chickenpox.

DialMed does contain the four corresponding ingredient/lotion labels across
other diagnoses: acetaminophen 113 label mentions, oseltamivir 107, acyclovir 154
and calamine lotion 557. These are mentions across multi-label records, not
confirmed cases for our conditions or verified matches to our exact strengths.
URTI was not promoted into an Influenza diagnosis to manufacture pilot coverage.
Counts follow the Chinese labels in the supplied files; clinical translation,
RxNorm matching and local product suitability require separate verification.

## What a usable training dataset must contain

The model must learn the intended recommendation task, rather than a convenient
but different available target. Patient drug ratings, disease predictions and
drug catalogues are different tasks from patient-specific medication relevance.

For this pilot, a scenario needs a confirmed condition; clinical/symptom context
and durations; age at the encounter; applicable measured weight; known/unknown
allergy and current-medicine information; candidate identity/formulation; and
label provenance. Independent ranking labels should describe relevance among
eligible candidates. The four products have different purposes and are not
automatically interchangeable alternatives.

Observed prescriptions indicate what was ordered. They do not prove that the
choice was optimal, safe for every patient, or that an unselected medicine was
inappropriate. Absence of an allergy/medicine row does not establish a verified
negative history. Historical medicines must not all be treated as current;
encounter timing and start/stop information matter.

## Other sources and benchmarks checked

- [Full MIMIC-IV 3.1](https://physionet.org/content/mimiciv/3.1/) provides diagnosis,
  demographics and medication/prescription tables under controlled access.
  Its source description was reviewed; full clinical files were not accessed.
- [SafeDrug](https://github.com/ycq091044/SafeDrug) and
  [GAMENet](https://github.com/sjy1203/GAMENet) demonstrate medication-recommendation
  experiments based on MIMIC-III. They are research code/processing examples,
  rather than evidence of a readily reusable two-disease dataset. This audit did
  not deserialize their pickle files or use mirrors to bypass source access.
- [Hugging Face symptom-disease dataset](https://huggingface.co/datasets/zaimasohail/symptom-disease-dataset)
  has broad symptom/treatment-category descriptions. The inspected schema does
  not provide patient-specific medication relevance labels. This was a metadata
  review, rather than a full raw-file audit.
- [CDrugRed/MediRec](https://arxiv.org/abs/2510.21084) studies Chinese discharge
  medication recommendation for metabolic diseases, which differs from the
  present viral-condition pilot. This was a paper review only.
- [DailyMed web services](https://dailymed.nlm.nih.gov/dailymed/app-support-web-services.cfm)
  and [openFDA labels](https://open.fda.gov/apis/drug/label/) provide medicine
  evidence for knowledge/rules. They do not supply patient-level ranking labels.

The [DialMed paper](https://aclanthology.org/2022.coling-1.60/) describes annotated
doctor-patient consultations and masking recommended medications. Its provided
`dialog` field should be considered for model inputs. `original_dialog` may
reveal the target recommendations and cause leakage. Translation alone does not
remove its disease/formulation differences.

## Recommended PP1 work

The [individual proposal](../../ransara_part.txt) already plans approximately
800 synthetic patient-medication scenarios, initially around 400 per condition.
This is a planning target, not a model-validation minimum or a demonstrated
sample size. Begin with a smaller checked batch and expand only after schema,
units, scenario variation and label provenance are settled.

1. Freeze the two-condition/four-product scope and scenario schema. Keep missing
   facts explicit. Separate raw medicine/allergy mentions from verified identity.
2. Generate versioned source-based cases and retain source/rule/template IDs,
   random seeds, expected screening outcomes and review status.
3. Keep safety targets separate from ranking relevance. If initial scores come
   from rules, identify the learned experiment as a **rule-imitation baseline**.
   Agreement with its generating rules is engineering evidence, not independent
   clinical validation or proof that learned ranking improves treatment choices.
4. Split synthetic data by scenario template; keep repeated patient histories or
   duplicate dialogues together where real data permits. Do not manufacture
   independent test evidence through near-duplicate generated cases.
5. Compare the rules baseline with the provisional learned baseline. Keep output
   unapproved and clinical review status visible. Add advisor-reviewed relevance
   labels for later independent ranking evaluation.
6. Use DialMed only as an optional, separately reported auxiliary benchmark if
   its language/disease/product adaptation fits the research question. Do not
   claim that training on its other conditions validates the pilot's conditions.

Technical development and prototype evaluation can proceed while clinical review
is pending. Neither downloading a medical dataset nor passing synthetic tests
establishes clinical prescribing suitability.

## Reproducibility and limits

[dataset_audit_2026-10-14.json](dataset_audit_2026-10-14.json) contains aggregate
counts, schemas, matching codes/labels and SHA-256 hashes of complete inspected
files. [audit_datasets.py](audit_datasets.py) reproduces those counts:

```powershell
.\.venv\Scripts\python.exe docs/research/audit_datasets.py --data-dir "$env:TEMP\meditrack-dataset-audit-20261014" --output docs/research/dataset_audit_2026-10-14.json
```

The downloaded raw files are in temporary local storage, not committed or
embedded in this report. Publisher terms remain relevant; the review datasets
include research-use/redistribution restrictions, and Druglib's metadata has
conflicting license descriptions. The report does not resolve that conflict or
claim commercial reuse rights.

The MIMIC archive/prescription/dictionary and eICU medication-orders transfers
timed out. Complete selected diagnosis/patient tables were available and were
read to EOF before calculating their disease counts. Incomplete downloads were
not treated as complete evidence. Full credentialed cohorts and every possible
source were not exhaustively inspected. Findings describe the named versions,
retrieved files and explicit label/code filters, not all clinically possible
cases in every dataset.
