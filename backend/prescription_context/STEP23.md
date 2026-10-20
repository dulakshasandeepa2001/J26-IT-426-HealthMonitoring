# Step 23 — visible doctor-review actions and automatic prescription opening

The doctor-review screen previously disabled the decision buttons for a short
reason or unchecked review confirmation without explaining those requirements.
The Edit medicines button enabled medicine checkboxes but provided little visible
feedback, especially when there was only one screened candidate. A successful
approval required another manual Open approved prescription action.

## Behavior

- Edit medicines opens a clearly labelled selection-editing panel and enables
  the candidate checkboxes. Done choosing medicines closes that mode. The screen
  shows the selection count and explains when only one medicine passed screening.
  Editing changes the selection among available candidates. It does not introduce
  an excluded alternative or an unvalidated custom dose.
- The decision reason has a live trimmed-character count and the existing
  10-character minimum. Missing reason, explicit review, selection and independent
  combination-review requirements appear next to the buttons. Busy, stale and
  final states remain guarded. Save edits and reject show clear feedback; saved
  decision reasons remain visible. Editing details clears review confirmation.
- Only a successful, matching server-approved decision response navigates to the
  approved prescription route. Errors and lost responses preserve the current
  inputs and idempotency key for retry. Saving edits, rejecting, loading history
  and merely checking a review box do not open a prescription. The manual open
  link remains available for saved current approvals.
- Final decisions retain their immutable selection. A separate Create new
  medicine proposal button starts a revision through the existing workflow;
  prior decisions are retained in history.
- The A6 view contains patient name, registered age at approval, approval date,
  the approved medicines and screened instructions. Its compact profile-stamp
  panel uses only the saved doctor name, qualifications, university and hospital.
  Missing university information is shown as not recorded. The panel is explicitly
  unsigned, with the existing signature/authorized-seal space retained. No
  signature, verified credential, registration number or university is invented.
  Existing research-use and non-dispensing labels remain.
- The user can print A6 from the approved view. The print action revalidates the
  saved approval before opening the browser print dialog. No PDF generator,
  training, migration or live clinical-record update is needed for these changes.

## Files

- `frontend/src/features/prescription-intelligence/DoctorReviewFlow.tsx`:
  visible edit state, requirements, feedback, revision action and approval-only
  client navigation.
- `frontend/src/features/prescription-intelligence/PrescriptionSlip.tsx`:
  compact unsigned profile stamp with recorded doctor details.
- `frontend/tests/doctor-review.mjs`: short-reason/unchecked-review guards,
  editable controls, saved edits, approval retry, automatic opening, doctor stamp,
  approved-only A6 print, rejection and superseded/revoked access.
- `frontend/tests/six-condition-workspace.mjs`: automatic opening after the
  selected-pair path; the printed selection excludes duplicate paracetamol.
- `frontend/tests/six_condition_api_bridge.py`: an explicit fictional-doctor
  profile fixture for verifying stamp values, entirely within in-memory SQLite.

## Verification

With the frontend development server running, from `frontend`:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/DoctorReviewFlow.tsx src/features/prescription-intelligence/PrescriptionSlip.tsx
node tests/doctor-review.mjs
node tests/six-condition-workspace.mjs
```

The browser tests intercept API calls and use disposable in-memory Django
fixtures. They never approve a live patient's medicines or update a live doctor
profile. The doctor-review regression passed the short-reason guard, actual
edit/save, lost-response retry with no duplicate approval, automatic approved-view
navigation, recorded stamp details, A6 print, rejection and stale/revoked access.
The generated print screenshot was visually inspected for name/age, approved
selection and compact unsigned doctor-stamp layout. TypeScript and targeted ESLint
passed. The running application's health check reported PostgreSQL connected.

The six-condition browser regression also passed, including the selected-pair
single-candidate path opening its approved prescription automatically while
excluding duplicate paracetamol. History identity persistence, medicine-review
refresh, slow/failed requests, stale inputs, records, mobile width and revoked
access remained covered.

Existing deterministic exclusions, source-specific pair coverage, RF abstention,
doctor authorization and approved-only prescription access are unchanged.
