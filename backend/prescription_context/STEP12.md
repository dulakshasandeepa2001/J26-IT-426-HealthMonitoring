# Step 12: readable consultation references and JSON history prefill

Later UI update (2026-10-18): the separate **Confirm recorded identities** form
has been removed at the user's request. The basic allergy/current-medicine
summary, editor, JSON prefill and explicit visit review remain. The UI no longer
fetches identity choices or submits new identity decisions. Unchanged history
continues to reuse existing identity details through the backend; edited history
retains the existing stale-resolution invalidation and deterministic blocks.
The description of the identity editor below records the earlier implementation.

## Consultation reference

The workspace displays an uppercase `MT-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx`
reference. It is a lossless, fixed-width base-36 encoding of all 128 UUID bits;
it is not a truncated UUID or an independently allocated sequence. Existing
UUIDs remain the database/API/appointment identifiers. Expand **Technical record
ID** to see the original UUID. No database migration or renumbering is needed.

## History prefill

`historyPrefill.ts` reads only a validated analysis for the exact selected
consultation, registered patient and doctor. The supported reported fields are
`payload.extracted_clinical_notes.patient_reported_allergies` and
`patient_current_medications` in the retained voice-analysis envelope.

- With no saved history, reported positive entries fill the proposed history.
- For a return visit, reported entries supplement saved positive entries, with
  case/whitespace deduplication. They never erase a saved allergy or silently
  discontinue a saved current medicine. The doctor can explicitly correct the
  combined proposal, including medicines that are no longer current.
- Missing/empty arrays, legacy analyses without history and invalid/unbound
  analyses do **not** establish absence. With no established saved status they
  remain `unknown`. Explicit saved doctor-confirmed `none` is retained when no
  new positives are reported. The existing JSON schemas do not provide a separate
  trustworthy assessed-absence flag; one would require a future versioned contract.
- A later saved review for the current visit takes precedence over older source
  extraction. A later incoming report with additional positive history proposes
  additions and requires another review.
- Incoming JSON never replaces unsaved manual edits. **Use reported and saved
  history** explicitly restores the proposal when the doctor wants it. New source
  input invalidates the unsaved review acknowledgement.
- Prefill itself does not write to the database or mark anything reviewed.
  The doctor still confirms identities and saves the history for this visit.
  Existing immutable before/after context revision recording remains in use.

## Simplified interface

The history form starts with two compact summary cards. Known or saved history
keeps the status/text editor collapsed; **Edit allergies and current medicines**
opens it. A completely unknown history starts with the editor open. It stays open
while changing statuses and text. The doctor can choose **None reported** after
checking absence with the patient.

The duplicated **Saved patient context** box in the encounter selector and the
redundant manual medicine-name check in this form are removed. The identity editor
and deterministic controls remain: a reported name does not prove exact product,
interaction clearance or safety. The standalone medicine catalogue/name-check
features remain available.

Unsaved history changes block workspace screening and doctor medicine decisions.
Saving current reviewed history restores the screening flow. No medicine review,
clinical rule, ML artifact, approval/publication policy, account or database
configuration is changed by this step.

## Verification commands (frontend)

```powershell
node tests/history-prefill.mjs
node tests/prescription-encounters.mjs
node tests/member1-adapter.mjs
node tests/six-condition-workspace.mjs
node tests/medicine-knowledge.mjs
node tests/admin-assignments.mjs
node tests/component1-analysis.mjs
node tests/doctor-review.mjs
node node_modules/typescript/bin/tsc --noEmit
```

Browser checks use intercepted requests or the isolated in-memory Django bridge,
not the configured clinical database. The pure helper check covers source binding,
unknown/empty/missing data, saved history, review precedence, new positive reports,
deduplication, and complete round-trip preservation of the readable UUID encoding.

Verified on 2026-10-18: the helper, encounter, voice-adapter, legacy-analysis,
assignment, Medicine Knowledge, six-condition screening and doctor-review browser
checks passed. TypeScript and targeted ESLint passed. The six-condition bridge
checked all six preview/save paths and history identity persistence; the doctor
review bridge checked proposals, edits, approval/rejection and A6 printing.
