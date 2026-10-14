# Step 6B: automatic rule-based regimen suggestions

**Historical implementation note:** [Step 6C](STEP6C.md) supersedes the editor
flow below. The current workspace automatically selects applicable medicines
and regimens for all four catalogue products, with no manual dose fields.
The Step 6B description remains here for the earlier API/version history.

The regimen editor now fills supported amount, unit, doses/day, duration and
route from the **backend's reviewed dose expression**. This is a rules-only
draft suggestion; the doctor must review/edit it before saving the screening
draft. Approval and publication remain unavailable.

## Use the flow

1. In Medicine Knowledge, keep the catalogue content review current and save a
   **current safety rule review**. This code update changes the engine digest:
   earlier executable reviews become outdated and require review again. Their
   original audit records and notes remain available; catalogue content reviews
   are unchanged. The safety form shows the current engine version and explains
   outdated reviews.
2. In Prescription Workspace, select the patient/visit, review and save allergies
   and current medicines, load the analysis and confirm the diagnosis.
3. Complete the relevant clinical assessments and verified onset. Once the
   selected checks support an encoded regimen, all five regimen fields fill
   automatically. Source links and the rule version appear beside the suggestion.
4. Review or edit the fields. A clinician edit is preserved during subsequent
   recalculation, retries and refreshes. **Use rule suggestion for <medicine>**
   explicitly replaces the entered regimen with the latest available suggestion.
5. Acknowledge the clinical inputs/regimen, then generate the draft. A changed
   clinical input clears an automatic regimen and triggers recalculation; manual
   edits remain. The acknowledgement resets after changed inputs or suggestions.
6. Saved versions preserve their regimen and origin. Reload restores saved
   regimens as clinician inputs, with the acknowledgement unchecked. The latest
   rule suggestion can be reapplied explicitly.

## Boundaries

- Only **Oseltamivir 75 mg capsule** and **Acyclovir 800 mg tablet** currently have
  quantitative rules. Paracetamol and calamine retain their explicit “policy not
  encoded” dose finding; product strength alone never becomes a prescribed dose.
- Registered DOB supplies age on the backend. Pediatric rules require newly
  measured weight when applicable; a cached weight is not used. A dose requiring
  a different product strength/formulation is withheld, with the specific reason.
- Red flags, unresolved allergy/medicine identities, duplicate ingredients,
  unknown/nonstandard renal or special-population context, missing/out-of-window
  onset, and selected unresolved interaction cautions withhold automatic filling.
- The existing final coverage warning remains: an available numerical suggestion
  does not establish comprehensive patient-specific prescribing suitability.
- A Member 1 sample reporting three days of symptoms does not automatically
  supply verified onset. If the doctor confirms 72 hours, the selected influenza
  timing profile withholds automatic filling and displays the scope reason.
  Broader indications require another reviewed policy.

The shared calculation uses the already encoded label values. Sources were
checked again on 2026-10-14:

- [TAMIFLU label, section 2.2 and Table 1](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=ee3c9555-60f2-4f82-a760-11983c86e97b).
- [Acyclovir tablets label, Chickenpox dosing and renal precautions](https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=05f42300-2a06-45f1-a9b9-6e5c84ae58ec).
- [CDC varicella indication guidance](https://www.cdc.gov/chickenpox/hcp/clinical-guidance/index.html).

## API and audit

`POST /api/prescription/drafts/regimens/<visit-uuid>/` accepts only the diagnosis
ID, expected context timestamp and clinical fields. It uses the same approved
doctor/patient, visit ownership, diagnosis-reference, context-review and knowledge
gates as generation. It requires CSRF and returns no-store responses. It performs
no record/review writes. Preview forces `reviewed=false` because the resulting
regimen has not yet been acknowledged.

The response contains per-medicine availability, a dose or explicit reasons,
source sections, medicine/rule hashes, and engine version/hash. No age, patient,
doctor, cached weight or numeric rule is accepted from the client.

Generation records proposal origin (`manual` or `rule_suggestion`). For automatic
origin, the server recalculates availability and verifies the entire regimen
against current inputs before saving. A forged or outdated automatic proposal
returns HTTP 409. Accepted suggestions and their evidence are archived in the
immutable draft snapshot. Manual proposals continue through the existing checks.

The frontend debounces requests, cancels outdated requests and ignores late
responses. Failed previews retain clinician edits and offer **Refresh dose
suggestions**. Changing the patient/visit resets unsaved inputs and suggestions.
Revoked access clears displayed data. No database migration or data seeding is
needed for this addition; no clinical review was performed automatically.

## Verification

```powershell
# From backend: isolated SQLite test database
..\.venv\Scripts\python.exe manage.py test prescription_drafts prescription_context medicine_knowledge --settings=medicare_project.test_settings --noinput

# From frontend; APIs mocked, real Python adapter and rule engine used
npx tsc --noEmit
npx eslint src/features/prescription-intelligence
node tests/prescription-drafts.mjs
```

Backend tests cover read-only previews, clinical acknowledgement, source/origin
audit, forged automatic proposals, permissions/CSRF, unknown/out-of-scope facts,
allergy/duplicate identities, pediatric product boundaries and varicella scope.
Browser checks cover automatic filling of all five fields, manual edits and
reapplication, preview failure recovery, late responses, mobile layout and
immutable persistence.

Verified in this workspace: 116 backend tests passed, followed by all 30 draft
tests after refining unavailable-dose reasons. The extended browser flow,
TypeScript and targeted ESLint passed. No model migration is needed, and the
local database health check returned 200. Existing executable reviews are
outdated under engine v2 until a doctor reviews the current code/data version.
