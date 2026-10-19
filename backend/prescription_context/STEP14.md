# Step 14: resolve screening blockers through explicit doctor actions

This step reuses the existing history-identity, patient-context and medicine-review
APIs. Clinical rules, review hashes, database configuration and ML artifacts are
unchanged. No live review or patient history is written by this implementation.

## Doctor workflow

1. Preview the current patient. **What needs attention** groups unresolved
   patient history, clinical assessments, current medicine reviews and incomplete
   product/rule coverage.
2. **Clarify patient history** opens the existing patient history section and its
   optional **Confirm medicine and allergy names** panel. A unique exact allergen
   or product alias is proposed. A name such as `Paracetamol 500mg SOS` does not
   establish an exact product; the doctor selects the confirmed product and
   records at least ten characters explaining the clarification.
3. Keep raw history, reaction and schedule. Unknown products/allergens can remain
   unresolved. Review the patient's history explicitly and choose **Save patient
   information**. Changing a name, reaction, schedule or note requires renewed
   confirmation. Cancelling discards only unsaved name choices. Existing current
   resolutions for unchanged entries are retained, including when another entry
   is added. Product-hash changes return the affected product to unresolved.
4. **Review clinical details** opens and focuses the correction fields without
   changing facts. Source severe disease/red flags continue to block the limited
   outpatient pathway; a mild dropdown cannot clear a severe reported finding.
5. For supported products with pending reviews, **Review [medicine]** opens the
   exact medicine in a separate tab. Record a genuine current content/safety
   review there. On returning, **Refresh medicine reviews** reloads review status
   and invalidates the previous preview while retaining clinical entries and
   confirmation. Preview again for authoritative server checks.
6. Continue through the existing screening → ML suggestions → doctor review flow
   when candidates are available. Duplicate ingredients, unresolved interactions,
   unsupported products and other deterministic blocks remain enforced.

The three reference-only influenza antivirals are still unavailable because their
product/rule coverage is incomplete. Additional answers or content reviews do not
enable them. This step does not implement a clinical correction/override of the
original analysis, an interaction database, new drug policies or patient-facing
publication.

## Files

- `frontend/src/features/prescription-intelligence/HistoryClarification.tsx`
- `frontend/src/features/prescription-intelligence/historyNameSuggestions.ts`
- `frontend/src/features/prescription-intelligence/PatientContextForm.tsx`
- `frontend/src/features/prescription-intelligence/ScreeningNextActions.tsx`
- `frontend/src/features/prescription-intelligence/QuickClinicalReview.tsx`
- `frontend/src/features/prescription-intelligence/SixConditionDraftFlow.tsx`
- `frontend/src/features/prescription-intelligence/MedicineKnowledge.tsx`
- Focused helper and real-API browser checks in `frontend/tests`.

## Verification

From `frontend`:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node tests/history-name-suggestions.mjs
node tests/six-condition-workspace.mjs
node tests/doctor-review.mjs
```

From `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context.test_history_identity prescription_context.test_patient_context medicine_knowledge.test_patient_screening --settings=medicare_project.test_settings --noinput
```

The 45 focused backend tests use SQLite in memory. The browser bridge also uses
only isolated fictional records. It verifies UI name proposals and explicit
confirmation, note gating, cancel/reopen, raw-history preservation, save/reload,
duplicate blocks, exact-medicine review links, real test-doctor review submission,
review refresh retaining clinical entries, and severe-source exclusion. The full
ML/doctor-decision check verifies the existing approval/rejection/print workflow.
