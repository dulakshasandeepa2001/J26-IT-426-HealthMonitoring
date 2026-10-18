# Step 13: screening → ML suggestions → doctor-review draft

The main Prescription Workspace now presents three sequential sections:

1. **Patient safety screening**: review history/diagnosis and clinical facts,
   preview candidates and exclusions, acknowledge the preview, then select
   **Continue to ML suggestions**. If no candidate is available, the action is
   **Save screening assessment**. This saves the existing immutable screening
   checkpoint, not a doctor-approved prescription.
2. **Experimental ML suggestions**: explicitly enable the synthetic research
   workflow and select **Generate ML suggestions**. The existing backend reads
   the saved model against the saved screening snapshot. Each candidate retains
   its treatment purpose and a provisional relevance result, abstention or safety
   exclusion. Inspect the suggestions and select **Prepare doctor-review draft**.
3. **Doctor-review prescription draft**: inspect screened medicines/instructions,
   edit selections, record a reason, confirm the review and save edits, approve
   selected medicines, or reject. Only current doctor approval exposes the
   approved A6 prescription/print view.

### Summary confirmation controls

The prepared summary has its own **Confirm clinical summary** button. It uses
the same explicit confirmation as the lower review checkbox, updates the live
summary status and enables preview when the other encounter prerequisites are
met. Editing clinical facts invalidates confirmation; unknown facts remain
unknown. Filling fields, opening history or confirming the summary does not grant
medicine coverage, save a clinician medicine approval or clear a safety block.

**Review or correct saved patient history above** opens the basic history editor,
scrolls to its section with space for the fixed header and focuses Allergy status.
The link in the exclusions panel opens the same editor. These history links do
not confirm the separate clinical summary. No history or identity record is
written simply by opening the editor.

## Reused implementation and limits

No training, model/artifact change, backend migration, new medical rule or review
decision is introduced. The existing screening and medicine-proposal APIs remain
authoritative. They revalidate the patient/analysis/diagnosis, clinical context,
knowledge versions, product coverage, selected ingredients, treatment purposes
and decision freshness. The new layout does not mark medicines/rules reviewed,
clear unknown facts, override a safety block or enable real-patient publication.

The internal `PatientScreeningDraft` checkpoint must precede ML because inference
accepts only a fresh screened snapshot. The existing immutable `MedicineProposal`
stores model output. **Prepare doctor-review draft** opens its editable selection
view; it does not call an approval endpoint, create a clinician review or train a
model. Unsaved draft preparation is local UI state; saved edits/final decisions
reopen the decision view after reload. With no decision yet, a saved model proposal
is restored as suggestions and must be prepared again for review.

Screening edits require a new checkpoint before decisions. Historical/stale
proposals cannot be used for new decisions. When no screened candidate is
available, draft preparation is disabled and no doctor approval controls appear.
When the model abstains but screened candidates exist, any later explicit doctor
selection remains a doctor choice, not a claimed ML recommendation.

The model still learns provisional relevance from rule-derived labels. Candidate
rows are not presented as a clinically validated ranking, and single-candidate
purpose groups have no meaningful within-group ranking. No medical-confidence
percentage is added. Existing synthetic-only access, explicit opt-in and server
feature flag continue to apply.

## Separate frozen research experiment

The previous standalone fictional-pair panel moved out of the main workflow to
`/doctor/ml-research?consultation=<UUID>`. A link in the connected model's coverage
details opens it. Its existing component and API are reused. It uses the selected
consultation for authorization only; its fictional results cannot populate or
approve the prescription. That page has no manual consultation-creation form.

## Files

- `frontend/src/features/prescription-intelligence/SixConditionDraftFlow.tsx`
- `frontend/src/features/prescription-intelligence/DoctorReviewFlow.tsx`
- `frontend/src/features/prescription-intelligence/ClinicalScreeningResult.tsx`
- `frontend/src/features/prescription-intelligence/PrescriptionWorkspace.tsx`
- `frontend/src/features/prescription-intelligence/EncounterSelector.tsx`
- `frontend/src/features/prescription-intelligence/FrozenMLResearch.tsx`
- `frontend/src/app/doctor/ml-research/page.tsx`
- Existing browser checks updated to the new stage/action names.

## Verification commands (frontend, local Next running)

```powershell
node node_modules/typescript/bin/tsc --noEmit
node tests/doctor-review.mjs
node tests/six-condition-workspace.mjs
node tests/experimental-ml.mjs
node tests/prescription-encounters.mjs
```

Browser checks use intercepted requests or the isolated in-memory Django test
bridge. They do not read/write the configured clinical database. The connected
review check starts with UI screening and continues through saved-model inference,
explicit draft preparation, saved edits, approval/rejection, retries and A6 print.
The six-condition check additionally verifies that an all-excluded assessment
cannot prepare a doctor-review draft. The separate research check retains its
frozen-fixture, no-write, invalid-result and real-visit-exclusion checks.

Verified on 2026-10-18: TypeScript and targeted ESLint passed. The full UI
screening → saved-model suggestions → explicit review-draft preparation → doctor
edit/approval/rejection → A6 print check passed, including retries and stale-slip
denial. All six screening pathways passed, including the all-excluded preparation
block, preserved history identities, stale inputs, Records and revoked access.
The separate research page passed all eight frozen pairs and its error/late-result/
real-visit-exclusion checks. Patient/encounter and returning-history checks passed.
