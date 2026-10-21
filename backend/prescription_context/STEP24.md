# Step 24 — explicit bulk selection and fewer review round trips

The warning in the reported screenshot was an empty selection, not a missing
decision reason or review checkbox. An available candidate can have no automatic
selection when the experimental RF abstains. Previously its checkbox also needed
the separate Edit medicines mode, making the empty selection difficult to fix.

## Doctor workflow

1. Prepare the doctor-review draft after reviewing the saved screening and ML
   outputs. Medicine checkboxes are immediately editable for a current draft.
2. Click **Select all compatible medicines**, or tick medicines individually.
   The button selects only available candidates with screened regimens, distinct
   purposes/roles and non-overlapping normalized ingredient names. If a purpose
   has several alternatives, the doctor must choose one individually; an existing
   single explicit choice is retained. Ingredient conflicts and missing ingredient
   identities are not automatically selected. This is a selection convenience,
   not an interaction clearance or a claim that ML recommended an abstained item.
3. Enter the actual decision reason (at least 10 trimmed characters). If several
   medicines are selected, independently review their combination and confirm
   that checkbox. Confirm the overall decision review last. Selection, reason or
   combination changes invalidate the previous review confirmation.
4. Approve selected medicines. A matching saved approval opens the existing A6
   prescription automatically. Excluded medicines never appear in the selectable
   list. Backend authorization, freshness, purpose, duplicate-ingredient and
   combination checks remain authoritative for individual and bulk selections.

Empty selections may still be saved as edits or rejected, but cannot be approved.
Final decisions remain immutable. No clinical answers, patient history, catalogue
reviews, doses, database settings or frozen RF artifacts were changed.

## Performance changes

- Successful proposal/decision POST responses reuse validation completed by that
  exact service transition. An outer transaction retains the existing clinical
  locks until the response data has been built. This removes a second set of
  identical freshness/model checks. Each new action still performs its original
  checks; reads and idempotent replays independently calculate current state.
  There is no persistent clinical-validation cache or timeout-based clearance.
- The workspace requests only the latest proposal for its saved draft, avoiding
  revalidation of every historical proposal on opening. The full list/history API
  remains available and authorization-filtered. Prefetched decision rows are used
  without issuing an extra ordered query for each proposal.
- The two request-key-protected review writes reuse the session CSRF token
  already obtained by the page. Django authenticates and validates CSRF on every
  write. An explicit CSRF rejection can refresh once using the identical body
  and request key. Authorization failures, connection errors and 5xx responses
  are never automatically replayed. Other writes retain their existing default.
- Busy feedback and duplicate-click prevention remain active. Cold model loading
  still performs the full frozen-artifact audit; remote database/network latency
  is not eliminated by these changes.

## Reproduce checks

From `backend`, with the project's Python environment:

```powershell
..\.venv\Scripts\python.exe manage.py test medicine_knowledge.test_selected_interactions medicine_knowledge.test_patient_screening prescription_review --settings=medicare_project.test_settings --noinput
..\.venv\Scripts\python.exe -m prescription_review.profile_workflow
```

The profiler forces disposable in-memory SQLite, measures real fictional API
requests and prints query counts/timings without SQL or patient details. The
initial before/after query counts are:

| Request | Before | After |
| --- | ---: | ---: |
| Create proposal (cold/warm) | 60 | 48 |
| Save edits | 63 | 51 |
| Approve | 63 | 51 |
| Full two-proposal history | 24 | 22 |
| Workspace latest-proposal request | Not previously used | 19 |
| Open prescription | 18 | 18 |

Counts include SQLite transaction statements. These are local measurements, not
Supabase latency measurements. Timing varies with concurrent tests, model loading
and machine load; the query reduction does not establish a specific speedup for
the remote database.

A final local run with no other test processes measured cold proposal creation
at 8,854 ms, warm proposal creation at 576 ms, edits at 385 ms, approval at
348 ms, slip retrieval at 197 ms and latest-proposal loading at 192 ms. The
initial baseline measured 10,532 / 880 / 553 / 735 / 187 ms respectively for
the first five operations. These are single-run observations, not controlled
latency guarantees; slip retrieval was deliberately not optimized.

From `frontend`, with the frontend development server running:

```powershell
node tests/medicine-selection.mjs
node tests/preview-csrf.mjs
node tests/doctor-review.mjs
node tests/six-condition-workspace.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/medicineSelection.ts src/features/prescription-intelligence/DoctorReviewFlow.tsx src/features/prescription-intelligence/clinicalScreeningApi.ts src/features/prescription-intelligence/reviewApi.ts src/lib/api.ts
```

Browser workflows intercept every backend call and use the isolated SQLite API
bridge. No live patient, clinical review, doctor decision or profile is changed.
Focused coverage includes ambiguous alternatives, ingredient conflicts, excluded
medicines, explicit selection after ML abstention, combination review, approval
and A6 navigation, lost-response idempotency, changed-source replay freshness and
revoked access. The workflow remains an explicitly enabled synthetic experiment;
these changes do not enable real-patient prescribing or dispensing.

Verification completed: all 54 combined Django tests passed; both browser
workflows passed, including the bulk-selection and combination-review checks;
pure selection and CSRF helper checks passed; TypeScript and targeted ESLint
passed. The updated backend was restarted and its live read-only health check
reported PostgreSQL connected. The frontend remained available on port 3000.

## Files

- Frontend: `DoctorReviewFlow.tsx`, `medicineSelection.ts`,
  `clinicalScreeningApi.ts`, `reviewApi.ts`, `src/lib/api.ts`.
- Backend: `prescription_review/views.py`, `profile_workflow.py`, `tests.py`.
- Verification: `medicine-selection.mjs`, `preview-csrf.mjs`,
  `doctor-review.mjs`, `six-condition-workspace.mjs`.

Existing screening, safety-review and model implementation hashes are unchanged;
there is no need to invent or repeat reviews simply because of this UI update.
