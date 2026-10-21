# Step 17: persistent safety reviews and reference-scope acknowledgement

Safety review decisions are database records, not login/session preferences.
A current accepted executable review is reused after logout/login and refresh.
Login performs no review POST and creates no audit entry. Repeating the same
current profile decision/notes also reuses the recorded review, matching the
existing condition-scope behavior. Changed rules, products or revoked reviewer
authorization still invalidate an executable review.

The pilot engine digest was checked before/after this change and stays
`2c7c37cc211fc915d8dcddba06454ab836132fa4c90ecd15effd6b2ce1dd7d10`.
No hash-bound clinical engine files, catalogue source JSON, numerical thresholds
or patient safety answers were changed. Previously stale reviews were not
relabeled current; the doctor must actually inspect/save the current version.

## Review modes

- Complete supported products keep **executable safety review**. Saving it once
  records the actual doctor, time, notes and bound versions. The UI explains the
  exact stale-binding reason when the prior review cannot be reused.
- Incomplete/reference-only products now offer **Reference safety scope reviewed
  — screening unavailable** as well as Pending/Rejected. This requires explicit
  evidence/coverage-gap acknowledgement and notes. It is not executable approval.

Reference reviews use the existing immutable review ledger and JSON snapshot:
`review_scope=reference_only`, `executable_approval=false`. No migration or fake
reviewer is needed. They bind to the exact stored content/rules hashes and
timestamp. Runtime implementation changes do not revoke a review of unchanged
reference evidence/gaps, but changes to the stored scope or reviewer authority
do. Stored hash tampering is rejected.

The API exposes **two separate facts**: `reference_review_is_current=true` can
record a completed reference review, while `safety_review.is_current=false`
continues to fail the executable screening gate. No product/dose is invented.
The sidebar and detail panel say reference reviewed / screening unavailable;
they do not present it as executable clearance. A reference acknowledgement
cannot be submitted for a complete executable product as a shortcut.

## Outdated imports

If Save returns a version conflict, **Refresh current scope version** lets the
doctor explicitly import the verified shipped version for that one selected
scope. It checks both expected hashes and updated timestamp, retains every
existing review, and creates no approval. Unchanged valid content reviews remain
current. A previously recorded review is reused only if it matches the restored
exact version; otherwise the changed rules require an actual new review.
Unavailable/tampered bundles and stale requests fail without partial imports.
Neither page load nor login performs this update automatically.

## Changes and verification

Backend: `medicine_knowledge/reference_reviews.py`, `models.py`,
`condition_views.py`, and `prescription_drafts/views.py` implement the separate
review modes, read-only binding explanation, per-scope version refresh and
same-version reuse. Clinical gates still use executable `is_current` only.

Frontend: `SafetyRuleReview.tsx`, `AdditionalMedicineScopes.tsx`,
`MedicineKnowledge.tsx`, `medicineApi.ts`, `draftApi.ts` display persistent saved
states, explicit reference review and version-refresh feedback.

From `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py test medicine_knowledge prescription_drafts.tests.SafetyProfileReviewTests --settings=medicare_project.test_settings --noinput
```

Result: **67 tests pass**, including actual logout/new-client login, immutable
review reuse, coverage remaining blocked after reference review, version refresh
without approvals, source integrity, stale requests and authorization.

From `frontend`, with the local frontend running:

```powershell
node node_modules/typescript/bin/tsc --noEmit
node tests/safety-review-persistence.mjs
node tests/expanded-knowledge.mjs
node tests/condition-knowledge.mjs
node node_modules/eslint/bin/eslint.js src/features/prescription-intelligence/SafetyRuleReview.tsx src/features/prescription-intelligence/AdditionalMedicineScopes.tsx src/features/prescription-intelligence/medicineApi.ts src/features/prescription-intelligence/draftApi.ts src/features/prescription-intelligence/MedicineKnowledge.tsx
```

TypeScript and targeted ESLint pass. Browser tests use either intercepted mocks
or the actual APIs backed by disposable in-memory SQLite. They verify saved
executable review reuse, all nine reference-only medicines offering an explicit
review option, reference review persistence without enabling screening,
safe version refresh retaining the audit history, desktop/mobile layouts and no
automatic review writes. No live clinical records, reviews, accounts, database
configuration or research/model artifacts were modified.
