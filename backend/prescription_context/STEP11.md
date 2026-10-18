# Step 11: consultation handoff and returning-patient prefill

The workspace accepts `/doctor/prescription-workspace?consultation=<saved UUID>`.
It loads the current server session, assigned patients and doctor-scoped visits
before selecting the exact encounter and its patient. The explicit URL wins over
the previous browser selection. Invalid, empty, duplicated or unavailable IDs
leave no patient selected and offer the assigned patient selector; they never
fall back silently to another visit. Manual selection updates the URL and saved
selection, including subsequent retry/reload.

Opening a link is read-only: it does not create another consultation, modify a
visit reason, copy a diagnosis, confirm history or approve a prescription.

## What fills automatically

- Registered name, DOB and calculated age come from the assigned patient API.
- The selected consultation supplies its recorded visit reason. A newly delivered
  analysis can additionally display its own reported chief complaint, clearly
  marked for confirmation. Analysis, patient, doctor and visit bindings are checked
  before showing that complaint. Neither value comes from a previous visit.
- Saved patient allergies, current medicines and identity details are reused by
  the existing patient-context form. A return-visit notice shows when that history
  was last reviewed, when known. The doctor checks for changes and explicitly
  saves a review for the selected visit. Previous visit review status does not
  satisfy the new visit's deterministic screening checks.
- The existing encounter-specific analysis polling loads incoming JSON while
  waiting; it does not reuse another encounter's analysis or diagnosis.

The manual new-visit form is collapsed under **Start a visit manually**. Use it
only if a visit does not already exist. Its reason is initially empty, and changing
the selected visit clears the displayed unsaved reason. Existing creation and
access policies remain in place.

## Appointment integration contract

The appointment service is not implemented in this repository yet. Its trusted
backend must create or resolve one consultation per appointment, with the correct
registered patient, assigned doctor, current visit reason and synthetic/live
status. Reopening that appointment must reuse its saved consultation ID. Do not
deduplicate appointments merely by patient/day: distinct same-day visits exist.

After resolving the consultation, navigate the doctor to the URL above. Send
analysis to the existing authenticated analysis ingestion endpoint using the same
patient/doctor/consultation IDs. A link supplies selection only; it grants no access
and cannot supply clinical facts, DOB or a review decision. The workspace does
not implement appointment scheduling, automatic appointment creation or service
credentials. That upstream integration remains the next step.

No database migration, clinical-record update, model retraining, catalogue/rule
review change or prescription-publication change is needed for this UI handoff.

## Focused checks (from frontend, with local Next running)

```powershell
node node_modules/typescript/bin/tsc --noEmit
node tests/prescription-encounters.mjs
node tests/member1-adapter.mjs
node tests/six-condition-workspace.mjs
```

The browser fixtures intercept backend requests. They cover exact handoff,
invalid/ambiguous links, reload, manual selection, history prefill and fresh visit
review, no opening-time writes, complaint arrival and isolation, and revoked access.
No live patient data is created by these checks.

Verification completed on 2026-10-18: TypeScript and targeted ESLint passed;
encounter and voice-analysis browser checks passed; the six-condition workspace
regression passed through the isolated Django bridge (all six preview/save paths,
identity history, stale inputs, retries, Records, mobile and revoked access).
