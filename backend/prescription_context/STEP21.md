# Step 21 — history confirmation and current-medicine proposals

## Corrected workflow

Name options now load whenever recorded history exists, including while the
clarification panel is collapsed. The explicit **Save patient information**
action sends the prepared identity details with the history. Previously the
doctor could save reviewed raw history without ever loading that separate
identity record. Missing identity records open the panel automatically. Loading,
failure/retry, unresolved counts and non-exact-product note requirements are
visible; nothing is saved on load or by merely collapsing the panel.

Supported exact allergen names and recorded reactions are proposed. Name/strength
matches for medicine text are displayed as possibilities only: text such as
`Paracetamol 500mg SOS` cannot establish a tablet, route, manufacturer or exact
product. It still requires an explicit product choice and an actual clarification
note, or remains unresolved. Missing reaction dates, schedules and other facts
are not invented. Saved current identities are reused; changed product hashes
return to unresolved. The original raw history remains intact.

Same-visit history saves now retain entered clinical values when the source
analysis is unchanged. History freshness, previews, acknowledgements and clinical
confirmation are invalidated. The doctor must explicitly screen again against
the refreshed history. Changing the patient, visit, registered DOB, diagnosis or
analysis resets the component; clinical entries are not carried to other visits.
The explicit source-refresh action still reloads proposals.

## Separate proposed management notes

Each recorded current medicine has an optional **Proposed current-medicine
actions** section: not decided, propose continuing, propose changing, or propose
stopping. A decided action needs a reason of at least 10 characters. The existing
history-save endpoint accepts a strict `medicine_plans` array bound to the raw
medicine rows, under the same assigned-doctor access and optimistic-concurrency
checks. It stores a server-authored `provenance.medicine_plan` record and includes
before/after plans in the immutable context revision. No migration is needed.

These are visit-specific, proposed-only notes. They are **not** prescription
items, active-status updates, proof that exposure ended, replacement regimens or
interaction clearance. New visits start undecided; changed history drops plans
omitted from a new request. Identity confirmation and management decisions remain
separate. Clients cannot submit approval status, reviewer identities or dates.

## Remaining clinical coverage

Screening actions now distinguish unresolved history from actual allergy
exclusions, duplicate treatment, and current-medicine interaction findings.
Candidate-specific checks and evidence remain visible. Re-confirming an already
resolved name is not presented as a remedy for missing pair-review coverage.

The reported influenza visit can still have zero available candidates after
correct identity confirmation: current paracetamol duplicates a new paracetamol
candidate, and this prototype has no comprehensive current-medicine interaction
clearance or executable continuation/replacement approval workflow. A proposed
stop cannot bypass these checks. Baloxavir, peramivir and zanamivir still need
exact executable product/rule coverage and genuine current reviews. Additional
patient answers cannot supply missing coverage. No guideline is switched, review
fabricated, medication history cleared or clinical answer filled by this change.

Safety screening remains deterministic. RF suggestions remain downstream of a
saved assessment and cannot override its availability. Both frozen RF bundles,
their training datasets, source-bound clinical rules and review bindings are
unchanged. This work does not add clinical validation or real-patient publication.

## Verification and commands

From `backend`, using isolated in-memory SQLite settings:

```powershell
..\.venv\Scripts\python.exe manage.py test prescription_context.test_patient_context prescription_context.test_history_identity medicine_knowledge.test_patient_screening --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe manage.py test prescription_review --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_research.rule_forest.experiment verify
..\.venv\Scripts\python.exe -m prescription_research.random_forest_200.experiment verify
```

From `frontend`, with its development server available:

```powershell
node tests/history-name-suggestions.mjs
node tests/current-medicine-plans.mjs
node tests/screening-reason-groups.mjs
node tests/six-condition-workspace.mjs
node tests/doctor-review.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The browser fixtures intercept backend requests and use an isolated in-memory
Django bridge. They do not change live accounts, clinical history or reviews.
Backend verification: 55 history/screening tests and 14 doctor-review tests
passed. Both frozen RF verification commands passed. All three focused frontend
helper checks, TypeScript and targeted ESLint passed. Both browser regressions
passed: the six-condition workspace and the saved-RF/doctor-review/approved-print
workflow. Browser verification covers
collapsed-panel saving, explicit clarification, reloaded identity/management
records, retained clinical entries with fresh confirmation, genuine duplicate
and interaction exclusions, stale/revoked access and the six condition paths.

The local Django development server was reloaded with the existing settings and
the existing explicit synthetic-ML flag. Its health endpoint reported PostgreSQL
connected, and the frontend workspace returned HTTP 200. No live patient history,
account, catalogue review or database configuration was changed during testing.

## Main changed files

- `prescription_context/serializers.py`, `views.py`: strict proposed actions,
  visit binding and server-authored audit snapshots.
- `frontend/.../PatientContextForm.tsx`, `HistoryClarification.tsx`,
  `historyNameSuggestions.ts`: prepared identity loading, review/save and
  display-only name/strength hints.
- `frontend/.../CurrentMedicinePlans.tsx`, `medicinePlanDrafts.ts`,
  `prescriptionApi.ts`: separate visit-specific management proposals.
- `frontend/.../PrescriptionWorkspace.tsx`, `SixConditionDraftFlow.tsx`:
  retained same-visit clinical values with fresh history binding and confirmation.
- `frontend/.../ScreeningNextActions.tsx`, `screeningReasonGroups.ts`:
  distinguish unresolved names, actual exclusions and incomplete coverage.
- Focused backend tests and frontend helper/browser regressions.

The next implementation step for this particular current-medicine case is a
source-defined, versioned pair-assessment and continuation/replacement workflow,
with explicit decision authority and approval integration. Recording a proposed
action alone must never be used as that workflow's clinical clearance.
