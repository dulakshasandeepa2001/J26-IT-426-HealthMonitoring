# Step 25 — six-condition handoff corrections and an exact ORS research path

## Changes

The v2.1 ingestion adapter no longer adds the obsolete claim that the four
additional conditions have no screening pathway. All six canonical conditions
can be imported and independently confirmed. Handoff acceptance does not claim
product coverage, model support, safety clearance or an approved prescription.

Historical analyses are immutable. The display identifies their exact obsolete
warning as historical; other mapping problems remain visible. An identical
producer retry can match an old analysis after ignoring only that exact warning
for comparison. Changed source facts still conflict; the saved analysis, raw
source, timestamp and original warning are not rewritten.

Gastroenteritis previously had only unresolved/reference-only products. A new,
separate reference identity now has an executable **synthetic adult** screening
extension: Dioralyte Natural GSL, UK marketing authorisation PL 35104/0044. This
does not resolve or replace `ors-low-osmolarity-powder`, and it does not assert
availability/equivalence of Sri Lankan products or WHO low-osmolarity ORS.

The new scope is imported pending. No content/safety acceptance, clinician
identity, signature or validation is fabricated. Existing core catalogue,
profile/condition rules, their review hashes and the frozen research artifacts
are not rewritten. The new rule and its source have separate code/content
bindings. Changed versions invalidate their own effective acceptance and saved
screening; authorization, date/source changes and doctor decisions are still
checked on later requests.

## Source and bounds

Primary reference, checked 2026-10-21:
[Phoenix Labs Dioralyte Natural GSL SmPC](https://www.medicines.org.uk/emc/product/2774/smpc),
sections 2, 4.1–4.5, 6.1 and 8. The page reports an update on 2024-01-26 and
text revision on 2023-06-30. Structured facts and provenance are in
`medicine_knowledge/data/ors_reference.json`.

The exact product's adult instructions are event-based, with per-sachet water
reconstitution. The extension deliberately excludes individualized fluid-deficit
plans and does not create a fixed daily frequency or course. The UI and A6 view
render the sachet range, after-stool timing and dilution explicitly rather than
formatting them as a tablet regimen. Storage/reassessment information is retained.

The narrower research criteria require all of the following:

- A synthetic registered adult, assessed standard mild/moderate outpatient
  context, no source red flags and independently assessed absence of the required
  concerns. This is an implementation scope, not a universal product restriction.
- Current genuine content and executable safety reviews of this exact scope.
- Explicit confirmation of the named reference product. A generic ORS name,
  another sachet or an unverified product never satisfies it.
- Independently reviewed history and exact-product/excipient suitability.
  Unknown allergies/current medicines stay unknown; current medicine combinations
  are outside this new scope. The label's absence of stated interactions is not
  interpreted as comprehensive interaction clearance.
- Standard renal/hepatic and diabetes/metabolic context, no relevant sodium or
  potassium dietary restrictions and no suspected intestinal obstruction.
- Confirmed diarrhoea up to 24 hours, no/mild dehydration and tolerated oral
  fluids. The 24-hour limit is a conservative research boundary, not a label
  contraindication. Unknown/unsupported, child, severe, concerning and real-patient
  contexts remain unavailable. No IV plan is generated.

New questions start Unknown and are never confirmed by importing JSON or merely
opening the page. Generic ORS, loperamide, bismuth and zinc reference entries keep
their existing exclusions. Other conditions retain their existing safety gates.

## ML and approval

Neither dataset nor saved model was expanded or retrained. This exact product is
outside the frozen RF product coverage and must abstain. The doctor may explicitly
select it only after deterministic screening makes it available. Approval requires
the existing reason, review, freshness and selection checks; only that saved
selection opens the research A6 view. This is not an ML best-medicine/dose model
or a clinically validated prescribing system. Real-patient publication remains
disabled.

Older medicine proposals need new ML suggestions after the decision-service
implementation changes. A newly imported scope also changes the existing global
knowledge binding, so old saved screenings can require a new preview/save. This
does not manufacture a repeat review for unchanged catalogue/rule versions.

## Run and use

From `backend`:

```powershell
..\.venv\Scripts\python.exe manage.py seed_reference_ors
..\.venv\Scripts\python.exe manage.py test medicine_knowledge prescription_review prescription_context.test_member1_v21 --settings=medicare_project.test_settings --noinput
```

The import command adds/updates only the separate reference metadata and preserves
review history; it is idempotent for the same version. It creates no reviews,
accounts, patient histories, analyses or decisions. No migration is required.

For the new reference, the assigned doctor can open:

`/doctor/medicine-knowledge?medicine=dioralyte-natural-gsl-sachet`

Review the source/content and executable scope genuinely. Then open an appropriate
synthetic gastroenteritis visit, verify patient facts and the exact reference,
preview and save screening, inspect the explicit RF abstention, and independently
select/approve only if applicable. Never choose a normal answer simply to enable
the button; absent information must remain Unknown.

From `frontend`, with the frontend server running:

```powershell
$env:MEDITRACK_TEST_URL = 'http://localhost:3000'
node node_modules/typescript/bin/tsc --noEmit
node tests/ors-workflow.mjs
node tests/doctor-review.mjs
node tests/six-condition-workspace.mjs
node tests/medicine-selection.mjs
node tests/preview-csrf.mjs
```

All browser backend calls are intercepted into the disposable in-memory SQLite
bridge. The ORS test imports a pending scope, records reviews through the actual
doctor UI using fictional accounts, checks the product gate/exclusions, then
verifies RF abstention, independent approval and event-based A6 rendering.

## Files

- Handoff: `prescription_context/member1_v21.py`, `analysis_ingestion.py`,
  `test_member1_v21.py`; frontend `Member1Report.tsx`.
- New reference: `medicine_knowledge/data/ors_reference.json`, `ors_reference.py`,
  `ors_contracts.py`, `ors_screening.py`, `complete_screening.py`,
  `management/commands/seed_reference_ors.py`, `test_ors_reference.py`.
- Integration: `medicine_knowledge/reference_reviews.py`, `condition_views.py`,
  `screening_views.py`, `prescription_review/services.py`.
- Frontend: `clinicalScreeningApi.ts`, `clinicalAssessmentFields.ts`,
  `quickReviewData.ts`, `PatientClinicalInputs.tsx`, `ClinicalScreeningResult.tsx`;
  `PrescriptionSlip.tsx` for event-based A6 formatting;
  `tests/ors-workflow.mjs` and the isolated API bridge.

The existing research teacher/core source files and all frozen model/dataset
artifacts remain intact. No database configuration or patient-facing publication
setting was changed.

## Verification results

- The combined Django suite passed all **108 tests** using in-memory SQLite.
  After adding inspectable rule source to the final ORS metadata, all seven
  focused ORS tests passed again.
- All three browser workflows passed: the new exact-ORS path, the existing
  doctor edit/approve/print path, and the six-condition screening/history path.
  This includes unknown/different-product exclusion, genuine test-only review,
  frozen RF abstention, independent selection, approved-only A6 access, lost
  response retries, stale versions, duplicates and revoked access.
- The new browser test caught and fixed a separate A6 formatter that initially
  treated the event-based sachet regimen as a numeric tablet course. The final
  print view contains no undefined/null frequency or course values. Its mobile
  screenshot was visually inspected.
- TypeScript, targeted ESLint, pure selection checks and CSRF helper checks passed.
- The actual app received only the new pending reference metadata, with no
  invented review or clinical record. Importing the same version is idempotent.
  Backend/frontend were restarted with the original PostgreSQL configuration.

Initial browser runs on `127.0.0.1:3000` could not hydrate because the installed
Next.js development server blocked that dev-resource origin. Final browser tests
used `localhost:3000`, matching the allowed development origin. The running
frontend was restarted with `next dev --webpack`; no Next configuration file or
application security policy was changed. Use localhost for the app/test commands.
