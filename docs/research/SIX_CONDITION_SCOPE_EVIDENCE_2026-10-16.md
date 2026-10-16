# Six-condition scope and evidence matrix

Prepared **2026-10-16**. Plan version: `scope-six-conditions-2026-10-16-v1`.
Machine-readable companion: [six_condition_scope_v1.json](six_condition_scope_v1.json).

This completes the first planning step for the proposal's six conditions.
It does not enable four new diagnoses, import medicines, change executable
rules, generate training data, retrain the model or write clinical records.
The running application and existing model still cover **Influenza/Chickenpox**.

All mappings in this research document are `clinical_review_status=not_reviewed`.
That describes this plan, not the current status of any actual database review.
Source checks below are researcher evidence checks, not clinician approval,
independent patient labels or local prescribing validation. No reviewer identity,
signature or approval date is created. Existing catalogue/rule reviews remain intact.

The [individual proposal](../../ransara_part.txt) identifies these six conditions
and requires separate evidence mapping, rules, scenarios and evaluation when
expanding the two-condition pilot. The four proposed new canonical codes still
need agreement with Member 1; this document does not change their API contract.

## 1. Scope decisions

Retain all six conditions in the research plan, with **treatment purpose** as the
unit of relevance. A diagnosis does not imply that every mapped product is
needed. A symptom-relief product, an antiviral and rehydration support are not
interchangeable alternatives.

For the first new-condition synthetic batch, use adult standard-context cases
(18 years and above) as an explicit **research simplification**, not a product
age restriction or medical contraindication. Add pediatric, special-population,
missing-fact and complication cases as review/out-of-scope tests until their
product-specific policies are established. Existing pilot age/weight policies
are unchanged. Registered DOB remains the live age source; synthetic ages are
created research facts. Weight is required only where the specific rule needs it.

This is a bounded medicine-support scope, not a complete care protocol. Infection
control, local notification requirements and specialist management must be
handled separately before any clinical deployment. UK/US sources below support
research mapping; they do not establish Sri Lankan registration, availability
or a locally approved clinical pathway.

## 2. Main condition-to-purpose matrix

Product keys P1-P6 resolve to exact identity status in section 3. The existing
five mappings are retained; four additional mappings are proposed.

| Condition / proposed code | Treatment purpose and product | Relevance facts | Deterministic assessment / scope boundary | Evidence and readiness |
| --- | --- | --- | --- | --- |
| Influenza / `influenza` | Fever/aches relief: **P1**; condition-specific antiviral purpose: **P2** | Fever/body aches for P1; confirmed condition mapping for provisional P2 purpose relevance | Retain onset, renal/hepatic context, vaccine timing, age/formulation, allergy, current medicines and red-flag controls | Existing bounded pilot; shipped product labels and rules, unchanged |
| Chickenpox / `chickenpox` | Fever relief: **P1**; selected antiviral purpose: **P3**; itching relief: **P4** | Fever, itching; condition mapping for provisional P3 purpose relevance | Preserve risk-group indication, rash onset, measured weight when required, renal/context and external-use boundaries | Existing bounded pilot; [CDC symptom guidance](https://www.cdc.gov/chickenpox/treatment/index.html) and [risk-group guidance](https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html) |
| Measles / `measles` | Fever symptom relief: **P1** | Explicit fever presence and duration | Respiratory/neurological concerns, hydration and special populations require separate assessment; no infection-wide automatic medicine plan | Proposed symptom mapping from [NHS measles](https://www.nhs.uk/conditions/measles/) plus P1 label; [CDC care overview](https://www.cdc.gov/measles/hcp/clinical-overview/stay-alert-for-measles-cases.html) defines broader care limits |
| Mumps / `mumps` | Fever/aches/jaw-pain symptom relief: **P1** | Fever, body aches or jaw pain, with durations | Assess intake difficulty and potential complications; existing hepatic/renal/allergy/duplicate controls remain | Proposed mapping from [NHS mumps](https://www.nhs.uk/conditions/mumps/) plus P1 label; not enabled |
| Viral conjunctivitis / `viral_conjunctivitis` | Ocular lubrication for dryness/irritation: **P5** | Ocular dryness or irritation, with duration | Eye pain, photophobia, vision change, worsening redness, contact-lens context and uncertain eye diagnosis require review; suspected herpetic disease is outside this simple pathway | [CDC eye-care guidance](https://www.cdc.gov/conjunctivitis/treatment/index.html) supports artificial-tear class use; the P5 label supplies product identity, not a specific viral indication |
| Viral gastroenteritis / `viral_gastroenteritis` | Oral fluid/electrolyte replacement support: **P6** | Diarrhoea, vomiting or documented recent fluid loss | Assess dehydration, oral tolerance, concerning GI features, fluid/electrolyte restrictions and exact product preparation; severe/complex cases leave the automatic pathway | [NIDDK treatment guidance](https://www.niddk.nih.gov/health-information/digestive-diseases/viral-gastroenteritis/treatment) and [WHO ORS guidance](https://www.who.int/publications/i/item/WHO-FCH-CAH-06.1); exact local product unresolved |

The proposed Mumps target set combines guideline-described symptoms with the
existing product's general fever/pain purpose; this is a **researcher-defined
mapping**, not a new disease indication in that label. The same distinction
applies to Measles and the artificial-tear class-to-product mapping.

## 3. Candidate identity, formulation and route

| Key | Product / planning identity | Strength and form | Route | Identity evidence / remaining work |
| --- | --- | --- | --- | --- |
| P1 | `paracetamol-500mg-tablet` | 500 mg tablet | Oral | Existing catalogue SCD **198440**; [shipped label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f8237772-7656-49fb-b1de-f8fcb5fa55ee). Adding two uses changes content and requires a new version/review. |
| P2 | `oseltamivir-75mg-capsule` | 75 mg capsule | Oral | Existing SCD **312122**; [shipped label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b). Existing indication/formulation scope retained. |
| P3 | `acyclovir-800mg-tablet` | 800 mg tablet | Oral | Existing SCD **197313**; [shipped label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=05f42300-2a06-45f1-a9b9-6e5c84ae58ec). No automatic reuse for ocular infection. |
| P4 | `calamine-zinc-oxide-lotion` | 8% + 8% lotion | Topical, external skin | Existing SCD **617954**; [shipped label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=4a79259e-64ac-d187-e063-6294a90a78db). Chickenpox use remains a guidance-derived symptom mapping. |
| P5 | Proposed `cmc-sodium-05pct-ophthalmic-solution` | Carboxymethylcellulose sodium 0.5% (5 mg/mL), sterile eye solution | **Ophthalmic** | [REFRESH TEARS label](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=329d1fe0-4432-4565-b7b1-65666bd86526) lists SCD **1188426**. Bind the single solution/drop product, product NDC 0023-0798, not its co-packaged kit. Sri Lankan equivalent, excipients and new handler still need verification. |
| P6 | Proposed `ors-low-osmolarity-powder` formulation reference | Exact commercial strength/composition **unresolved**; powder for oral solution | Oral **after verified preparation** | WHO establishes a formulation reference, not identity of every local sachet. Actual label, dilution, ingredient concept IDs and a supported product identifier remain unresolved; no RxCUI is invented. |

P5's reference label concerns lubrication and dry-eye discomfort. Its warnings
include product condition/contamination and symptom escalation. Future rules
must bind the exact preparation, preservative/excipient context and ophthalmic
route. A drop amount cannot be converted to mL or mg without a supported product
expression; an as-needed schedule must not become an invented fixed course.
These are requirements for a future policy, not an executable policy in this plan.

### ORS identity gap: do not equate a reference formula with a local pack

The [SPC listing](https://www.spc.lk/products.php), code **1720720700**, describes
Jeevani as a **21.5 g** pack associated with **1000 mL**. The
[WHO reference document](https://iris.who.int/bitstream/handle/10665/69227/1/WHO_FCH_CAH_06.1.pdf)
describes a **20.5 g** reference sachet. The difference is unresolved here:
it does not establish the local ingredient composition or justify a substitution.
The reference mass was visible in the primary document's search-index excerpt;
direct PDF retrieval returned HTTP 403. WHO's publication overview was accessible.
This is not a claim of full PDF inspection or verification of the local formulation.

The listing is an identity lead, not a verified package insert, clinical dose,
current-stock statement or proof of regulatory equivalence. Obtain the actual
manufacturer/approved local label and verify ingredient amounts, excipients,
packet size, preparation volume, storage and patient instructions. Until then,
P6's commercial strength, reconstitution volume, RxCUI and dose policy stay
**null**. A wrong dilution or a missing product identity must prevent clearance.
No home recipe or patient-specific fluid regimen is created by this matrix.

## 4. Necessary context and unresolved clinical boundaries

All six conditions retain condition confirmation, age provenance, allergy
identity/status, current-medicine identity/status, symptom facts/durations,
red-flag assessment, special-population context and applicable renal/hepatic
assessment. A missing observation is **unknown**, not an explicit negative.

For new mappings, extend the facts deliberately:

- **Measles:** capture fever duration, breathing/neurological concern and
  hydration context. The proposed fever mapping does not replace broader care.
  CDC describes supervised vitamin A use; it stays a separate unresolved policy
  rather than an automatic extra candidate in this prototype.
- **Mumps:** add jaw pain, intake difficulty and complication-assessment facts.
  Abdominal/testicular or neurological concerns need a separate review outcome.
  The listed features are selected examples, not a complete referral rule.
- **Conjunctivitis:** distinguish dry/irritated eyes from pain, photophobia,
  altered vision and marked/worsening redness. CDC separates viral from bacterial
  and allergic care; antibiotics do not address viral conjunctivitis. Possible
  specialist disease must not inherit the chickenpox acyclovir schedule.
- **Gastroenteritis:** record fluid-loss symptoms and duration separately from
  dehydration severity, oral tolerance and any fluid/electrolyte restrictions.
  Assess concerning stool/pain/systemic features rather than letting the model
  determine etiology. Oral support can be purpose-relevant while the route or
  clinical context prevents selection. Additional antiemetics/antidiarrhoeals,
  IV fluids and complicated disease remain outside the proposed first mapping.

These selected boundaries are **proposed research controls**. Exact thresholds,
completeness, monitoring and locally appropriate referral messages need a
documented clinical rule review. Public guideline text is not a substitute for
that review. Source checking can support offline technical development while
the clinical-review status remains `not_reviewed`.

## 5. Label and scenario contract

Keep the current provisional relevance labels: `relevant`, `not_relevant`,
`undetermined`. Automatic labels from the documented criteria are `rule_derived`.
For symptom-support mappings, an explicitly present declared target can be
relevant; all declared targets explicitly absent can be not relevant; necessary
unknown targets remain undetermined. This is researcher-defined rule imitation.

The new targets are candidates for a **new criteria version**, not edits to
the existing frozen labels. For ORS, diarrhoea/vomiting/recent fluid loss express
fluid-replacement purpose only; they never authorize preparation or quantity.
For antivirals, retain honest reporting of constant mapped-purpose targets while
leaving individual indication and eligibility outside ML.

Keep `no_medicine_needed`, `requires_clinician_review`, `outside_product_scope`
and `refer_for_assessment` as separate workflow outcomes, not extra relevance
classes or synonyms for model failure. A safety block does not change a relevant
purpose label into not relevant. Unknown safety information never becomes safe.

The first small six-condition batch should include target-present, target-absent,
target-unknown, matching allergy, duplicate medicine, unresolved identity,
out-of-scope age/formulation and escalation examples. Include condition-specific
eye-route/ORS-preparation cases before expanding row counts. Retain scenario ID,
base ID, family, condition, patient facts, product/purpose/role, evidence, versions,
label method and `not_reviewed` status. No live patients or actual review decisions
enter this research dataset.

The existing seven-field ML allowlist lacks the new symptom concepts. Propose
only predecision relevance facts for its successor: fever/body aches/itching,
jaw pain, ocular dryness/irritation and fluid-loss symptoms as appropriate.
Safety outputs, labels/reasons, teacher scores, reviewer fields, IDs and versions
remain excluded. Age, weight, allergy, interaction and dose decisions remain
deterministic in this task. No new numeric completeness score should leak the target.

Each of the **nine condition/purpose/role groups currently has one proposed
product**. There is no meaningful within-group alternative ranking to evaluate.
More disease names or synthetic rows do not create independent clinical evidence.

## 6. Member 1 handoff proposal

Implementation follow-up: [Step 8A](../../backend/prescription_context/STEP8A.md)
now adds the receiver/doctor-demo 2.1 contract. The proposal/gaps below describe
the planning baseline; Member 1 agreement remains pending, and new-condition
catalogue/rule/model support is still unavailable.

[Step 8B](../../backend/prescription_context/STEP8B.md) subsequently stages the
catalogue and selected deterministic handlers offline; it preserves the unresolved
ORS identity and does not enable the new pathways in the live workspace.

Preserve the nested result envelope and provenance. Agree the six canonical
condition codes with Member 1, then version backend/frontend support together.
Do not silently treat a differential as the confirmed primary diagnosis or map
an unsupported code to the closest supported condition.

The new fact names in the JSON companion are **proposed concepts**, not fields
the current API accepts. Preserve unambiguous duration units/source text; unknown
or ambiguous durations must remain unknown. Missing symptom/red-flag fields must
not imply absence. Component 1 extracts observations; clinician verification and
independent assessments remain separate. Persisted allergies/current medicines
and registered DOB continue to use the existing patient-context workflow.

## 7. Engineering gaps found in the existing repository

This is why adding condition names alone would not enable six-condition support:

| Area | Current restriction | Required future change |
| --- | --- | --- |
| Member 1 / flat analysis / frontend parsing | Only two condition codes; symptom alias set is bounded | Version codes, aliases and explicit unknown handling; preserve old payload behavior |
| Catalogue contract | Two conditions; tablet/capsule/lotion; oral/topical; two purposes; at most two uses | Add ophthalmic solution and oral-solution powder identities, rehydration purpose and sufficient use count with focused validation |
| Source URL validation | Only DailyMed/CDC/FDA domains currently accepted | Deliberately allow the relevant NHS/NIDDK/WHO and suitable local primary references; retain HTTPS/domain validation |
| Product concept contract | A verified SCD RxCUI is mandatory | Resolve P6 identity or design a provenance-preserving supported-identifier contract; never fill a fake RxCUI |
| Clinical facts and regimens | Existing symptom trio and four product handlers | Add explicit ocular/ORS facts, route/unit semantics and product-specific handlers; unsupported kinds fail closed |
| Review binding | Catalogue hashes and executable-code digests bind reviews | New mappings/code require corresponding fresh reviews; retain historical reviews and do not reuse an old approval for changed content |
| Research data and model | Current immutable v1/v2 data and model cover two conditions | Create a new criteria/schema/dataset/model version; preserve existing artifacts for comparison |

Do not route a new product through a default branch intended for another product.
Ophthalmic support is not skin-topical lotion logic, and a sachet is not a tablet
mass-dose or a ready-to-drink liquid. These are explicit implementation tasks.

## 8. Delivery order and acceptance checks

1. **This step, complete:** six-condition purpose/evidence plan and a linked
   machine-readable gap register. No implementation or clinical approval implied.
2. **Next:** agree/version the six-condition handoff and patient-fact contract,
   including unknown handling, while resolving the actual ORS label in parallel.
3. Extend the catalogue/identity/source contracts and add proposed content as
   pending. Implement explicit safety/regimen handlers only with traceable rules;
   preserve the review gates and existing records.
4. Build a small inspectable six-condition synthetic batch. Check schema,
   source references, label separation, formulation/units and missing-data
   behavior before expansion. Keep all variants/candidates of a family together.
5. Freeze a new experiment: compare three compact models on identical family
   partitions, fit preprocessing on train only, choose with validation metrics
   and evaluate the frozen choice on held-out test. Report class/condition/role
   counts, errors, abstentions, unique inputs and constant-target groups honestly.
6. Integrate only a clearly labelled synthetic demo after offline checks.
   The current saved model is not a six-condition model. Patient publication
   stays disabled, and neither learned relevance nor unknown facts clear blocks.

Missing local product/clinical evidence does not require fabricating labels or
reviews. Leave the corresponding product/policy unavailable while continuing
independent offline contract and scenario work. Existing two-condition behavior
must remain a regression baseline throughout expansion.

## Evidence register and provenance

The JSON companion records stable source IDs, exact URLs, checked sections and
source-handling dates. Existing product references are reused from the shipped
catalogue with their recorded **2026-10-13** access dates; they are not falsely
reported as freshly re-reviewed labels. The new guidance/product pages and
selected CDC pages were checked for this plan on **2026-10-16**. Public-source
publication/review dates describe those pages, not a review of MediTrack.

The new P5 label page reports an update on 2022-06-30. The NIDDK page reports
May 2018 as its review date; WHO's ORS production guidance is dated 2006-01-01.
Their age and foreign jurisdiction require checking against the eventual local
product/policy, rather than claiming a current Sri Lankan prescribing protocol.
The SPC listing is deliberately classified as an identity lead only.

The current catalogue, safety JSON/engine, research criteria, saved model,
settings, account/clinical data and publication controls are unchanged by these
planning artifacts. No dataset is generated and no model is trained in this step.
