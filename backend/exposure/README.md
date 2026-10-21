# Exposure database and backend extension

Implementation status: storage, authenticated APIs, conservative zone matching,
optional configured GPS co-observations, scheduled processing and bounded cleanup
are implemented. Following explicit user authorization, the seven new tables
were migrated to the live PostgreSQL database on 2026-10-21. Original rows and
column values across all 76 pre-existing tables were verified unchanged. A
verified, Windows-DPAPI-encrypted PostgreSQL backup was saved outside the repo.
See `deployment_result.json` for deployment verification. Scheduler installation
has NOT been performed. Mobile and existing prescription endpoints were not changed.
This is not a completed clinical exposure prediction service.

## 1. Review the additive schema

| New table | Purpose / references |
| --- | --- |
| exposure_trackingconsent | Explicit consent, existing accounts.User |
| exposure_locationsample | GPS, client UUID, accuracy, recorded/received time, mode; user FK |
| exposure_proximityencounter | Ordered user pair, bounded observation segment, estimated distance/duration, source, quality, mode, unique replay key |
| exposure_diagnosismetadata | One-to-one existing diagnosis; optional onset/diagnosis times, status and separate approval metadata |
| exposure_riskzoneversion | Immutable circle boundary, disease, effective time, discovery time, source, review, mode, version |
| exposure_riskzonevisit | Existing user + zone version, estimated observation times/duration, quality, replay key |
| exposure_exposureanalysis | Latest minimal summary per user/disease/mode, nullable model score, model/schema version and optional SET_NULL source references |

Existing user records are reused. Disease code, confirming doctor, confirmation
time and patient ownership are read from the existing diagnosis/consultation;
no duplicate diagnosis or patient is created. Additional metadata defaults to
unknown dates/status, and approving a suspected record does not confirm it.
Only the consultation's assigned approved doctor can write metadata.

User deletion cascades into this feature's own user-owned rows; diagnosis deletion
cascades into its new metadata only. Removing an encounter nulls its optional
analysis reference. These child deletions cannot delete a parent user/diagnosis.
Zone visits protect referenced zone versions. There are no legacy save signals.

The repository's `prescription_context` app had models but **no migrations**.
Its new `0001_initial` captures those exact existing models, so the new diagnosis
FK has a valid migration dependency. On an existing database it must be verified
and recorded using `--fake-initial`; it must not recreate existing tables.
The disposable migration test exercises this populated legacy scenario.
Never use plain `--fake` to bypass a mismatch.

The exposure initial migration contains CREATE TABLE operations with inline
constraints and new indexes only; the generated SQLite SQL has no DROP/ALTER or
legacy table writes. `schema.sqlite.sql` and `schema.postgresql.sql` contain
reviewed generated SQL for the initial migration. PostgreSQL DDL was subsequently
executed successfully against the authorized live target.

`0002_restrict_direct_access` addresses Supabase's default anon/authenticated
grants: it enables RLS and revokes public-client table/sequence privileges on
the seven new backend-only tables. It leaves existing tables and permissions
untouched. The Django owner/bypass-RLS database role retains access. This security
migration is intentionally irreversible; reversing it must not silently restore
public access. SQLite tests treat this PostgreSQL-specific step as a no-op.

## 2. Validate in an isolated database

From `backend`, using a working Python with the project's dependencies:

```powershell
python manage.py check --settings=medicare_project.test_settings
python manage.py makemigrations --check --dry-run --settings=medicare_project.test_settings
python manage.py test exposure --settings=medicare_project.test_settings --noinput
python -m exposure.validate_migrations
python manage.py sqlmigrate exposure 0001 --settings=medicare_project.test_settings
```

The last-but-one command forces an in-memory database, seeds legacy test records,
baselines the legacy migration, applies the exposure migration, compares every
legacy row and checks that no legacy DDL/DML occurred.

Validation performed on 2026-10-21:

- All 23 exposure tests passed.
- Populated legacy migration/data-survival check passed.
- Django system checks and migration consistency checks passed.
- The configured PostgreSQL database was inspected inside a read-only transaction:
  basic legacy structure checks passed and the only pending migration in the
  targeted plan was `exposure.0001_initial`. The legacy baseline is already
  recorded in this database's migration history. PostgreSQL SQL was generated
  and reviewed: seven new tables and FK/index operations on new exposure tables
  only. That initial review made no live changes; the subsequently authorized
  deployment is recorded in section 3 and `deployment_result.json`.
- Existing backend suite: 254 tests, 235 passed, 15 failures and 4 errors.
  The environment lacks scikit-learn; frozen Experimental ML integrity checks
  return 503. A representative failure was reproduced with exposure removed from
  INSTALLED_APPS, the original HEAD URL configuration and legacy migration behavior.
  No model artifacts were rebuilt and no existing safety check was bypassed.
- Available Python launcher/venv executables were broken. Validation used installed
  Python 3.13 with `backend/Venv/Lib/site-packages` on PYTHONPATH. That environment
  does not satisfy the frozen prescription model environment manifest.

## 3. Deployment procedure and completed live deployment

The user subsequently explicitly authorized live deployment. The guarded
`python -m exposure.deploy_live backup`, `apply`, and `secure` stages implement
backup, narrowly scoped schema creation with row-preservation checks, and
backend-only access controls. The backup is stored under
`%LOCALAPPDATA%/MediTrack/Backups`, with access restricted to the Windows user
and SYSTEM. Its archive was completely parsed by pg_restore and its DPAPI
encryption/decryption round trip verified. Restoration was not rehearsed.
Never commit the archive, manifest or patient-data fingerprints.

The following commands document checks for other deployments; do not repeat
the initial migration on an already migrated database.

Back up the intended database using the existing backup procedure. Review this
schema diff and the target-engine SQL, confirm there are no unrelated pending
migrations, then run the read-only checks using the normal deployment environment:

```powershell
python manage.py check_exposure_schema
python manage.py migrate exposure --plan
python manage.py sqlmigrate exposure 0001
```

The schema check verifies legacy tables, columns, nullability, unique keys and
FKs. It does not prove column types/defaults match: review those separately before
baselining. Stop on any mismatch; do not reset or delete a database to fix it.
For a verified existing database the intended deployment command is:

```powershell
python manage.py migrate exposure --fake-initial
```

On a fresh empty development database the same command creates the legacy tables
normally. Do not reverse these migrations in production: rollback would delete
the feature tables, and reversing the baseline could delete legacy tables.

## 4. API connection

All endpoints use the existing Django login session and SessionAuthentication.
Unsafe requests need the existing CSRF token. Global REST authentication settings
are unchanged. No caller-supplied user ID is accepted. Responses use no-store.

| Endpoint under `/api/exposure/` | Method | Behavior |
| --- | --- | --- |
| consent/ | GET, PUT | Read/set own `{ "granted": true }` tracking consent |
| locations/ | POST | Atomic offline batch, max 500 samples, UUID replay deduplication |
| locations/?data_mode=real | GET | Own latest 500 unexpired samples, one mode only |
| analyses/?data_mode=real | GET | Own minimal summaries, refreshed to exclude expired evidence |
| zones/ | POST | Approved admin only; append a higher immutable zone version |
| diagnoses/{id}/metadata/ | PUT | Assigned approved doctor only; update separate metadata |

Location upload shape (substitute a recent timezone-aware recorded_at):

```json
{
  "samples": [{
    "client_record_id": "9f405eca-c036-4ed7-bd29-98bad23e7f30",
    "latitude": 5.9496,
    "longitude": 80.5469,
    "recorded_at": "2026-10-21T08:00:00Z",
    "accuracy_m": 5,
    "data_mode": "real"
  }]
}
```

The same UUID and content returns a duplicate count; changed content under the
same UUID rejects the entire batch. There is no partial-success ambiguity.
Modes are `real` and `synthetic_demo`, kept separate throughout processing.
Future timestamps (zero future-skew allowance), naive timestamps, nonfinite or
out-of-range coordinates, negative accuracy and samples older than 14 days are
rejected explicitly. The mobile OS's one-minute interval is not assumed.
Revoking consent stops new uploads and scheduled processing, while existing
raw/encounter rows expire normally. Account deletion/privacy workflows remain
the existing application's responsibility.

Zone payload fields: zone_id (optional UUID for a new zone), version (positive
integer), disease_code, latitude, longitude, radius_m, risk_level, valid_from,
valid_to (nullable), identified_at, source, review_status and data_mode.
Only approved versions participate. Unknown valid_to is open-ended. A higher
approved version supersedes earlier versions from its effective start. Historical
visits remain stored but superseded observations are excluded from current summaries.
Approval/rejection of a pending version is represented by a new version.

Metadata payload supports diagnosis_status (`unknown`, `suspected`, `confirmed`),
nullable symptom_started_at and diagnosed_at, and required doctor_approved.
The backend sets approved_by/approved_at; those fields cannot be forged.
They are never interpreted as an infectious period.

## 5. Processing and cleanup

Uploads return `processing: pending_scheduled_processing`. A separate command
rechecks retained records and existing diagnoses, so a legacy diagnosis save
never depends on the new feature's processing succeeding.

```powershell
python manage.py process_exposure --all-users --limit 100
python manage.py cleanup_exposure --dry-run
python manage.py cleanup_exposure --execute --batch-size 500 --max-batches 10
```

No existing scheduler was found. Configure the deployment's cron or Windows Task
Scheduler to run processing every five minutes and cleanup hourly, from `backend`
with its working virtualenv and normal environment. Do not start overlapping runs.
The processing command pages users; without --all-users, use --after-user-id to
continue the next page. A complete scheduled cycle restarts at zero. At scale,
measure runtime before selecting frequency: circle/GPS matching uses database
filters plus Python distance calculations and is not a spatial-indexed pipeline.

Monitor exit codes, processing completion time and cleanup dry-run counts. Retry
failed processing before expiry; expiry is never postponed for a backlog.
Cleanup deletes at most batch-size * max-batches per table per invocation; rerun
until the backlog clears. Ordinary deletion lag is up to the hourly schedule
plus processing time, and can be longer after an outage/backlog. Read/analysis
queries enforce expiry even if deletion is delayed. Backups follow the separate
backup-retention policy and are not erased by this command.

Only raw samples older than 14 days from recorded_at and encounters older than
7 days from ended_at are deleted. Equality at the cutoff remains retained until
the next instant. Zones, zone visits and minimal summaries are not automatically
deleted: their retention still needs a separate decision. No complete identifiable
encounter payload is copied into the summary or application logs.

## Explicit remaining decisions

- GPS encounter matching is **disabled by default**. To enable it, a reviewed
  deployment settings module must define `EXPOSURE_GPS_POLICY` with finite
  nonnegative `distance_m`, `max_accuracy_m`, `time_tolerance_seconds` and a
  nonempty `review_reference`. No clinical thresholds were invented. Tests use
  test-only values. Matches are zero-duration co-observations, not evidence of
  continuous contact between readings. BLE ingestion is not implemented.
- Zone matching requires the whole sample accuracy disk to fit inside the circle.
  It records a zero-duration observation with `duration_unknown`; uncertain boundary
  overlap and missing samples are not proof of absence or continuous residence.
- Six stable disease codes are supported, but reviewed transmission categories
  and infectious windows were not supplied. No clinical disease mapping is seeded.
- The sibling mobile research model is marked `simulation_only_not_clinical`.
  Its inputs include medical/vaccination data, indoor/shared-food context and
  28-day exposure aggregates, which cannot be computed from this 14-/7-day schema.
  No model was copied, retrained or supplied fabricated values. Analysis returns
  `model_score: null`, `status: not_scored` and explicit limitations. An approved
  feature contract/model adapter is required before inference can be connected.
- This change does not modify mobile capture/upload code, prescribe medicines,
  change existing diagnosis confirmation behavior, or deploy the scheduler.
