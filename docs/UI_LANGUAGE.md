# Product-facing language

Updated 2026-10-18. User-facing references to PP1, demo, Component 1 and Member 1
were replaced with consultation analysis, clinical review, prescription and
synthetic research terminology across the application and print view.

Changed areas include admin consultation assignments, patient/visit selection,
voice-analysis loading and details, quick clinical review, medicine knowledge,
saved drafts, Experimental ML, doctor decisions, history and A6 printing.
`frontend/src/lib/productLanguage.ts` also presents neutral error messages,
version labels and analysis-record references for older stored metadata.

Clinical detail panels now show the clinical content rather than integration
envelopes. Saved-input panels show patient, history, diagnosis and assessment
inputs. Original JSON, reference IDs, integration contracts, model artifacts and
review hashes remain unchanged in the backend. This is a presentation change;
it does not rename API keys, rewrite records or invalidate existing reviews.

Experimental ML provenance, synthetic-data disclosures, unverified clinical
inputs and the research-use/not-for-dispensing notice remain visible. No claim
of clinical validation or dispensing eligibility was added.

Verification passed: TypeScript, ESLint, analysis delivery, voice-adapter UI,
admin assignments, medicine review/name checks and the real-API doctor
edit/approve/reject/A6-print browser workflow. A static scan of 57 TSX files
found no remaining legacy terms in rendered static copy/accessibility labels.
Browser tests used fictional or intercepted backend data. No live clinical
records, accounts or doctor reviews were changed.
