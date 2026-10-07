# MediTrack schema diagnosis and proposed repair

Status: repair completed on 2026-10-07 after explicit authorization. The exact
four reviewed accounts migrations through `0006` were applied after a private
encrypted PostgreSQL backup and repeated preflight checks passed. The original
diagnosis and reviewed plan below describe the baseline before repair.

Post-repair verification confirms all 23 User columns and the 11-column
`laborator` table match their models, with no pending target migrations. All
original rows and column values across the 52 backed-up tables are unchanged,
including account passwords and roles. The historical `0003_alter_user_role`
record remains intact. Only the expected migration/content-type/permission
metadata was added. No application accounts were created or passwords reset.

The full User model loads successfully; the login view returns HTTP 401 for a
random incorrect password in a read-only transaction, rather than the missing
column error. The existing password was not tested. The separate `admin` role
choice mismatch described below remains outside this repair. The running
backend health check reports PostgreSQL connected with HTTP 200; frontend and
Django admin login pages also return HTTP 200.

See [repair result](schema_audit/repair_result.json),
[post-repair audit](schema_audit/audit.json),
[preflight audit](schema_audit/preflight_audit.json), and
[backup recovery notes](BACKUP_RECOVERY.md). Backup contents and data fingerprints
are kept outside the repository under restricted Windows permissions.

## Connection evidence

- The live `/health-check/` returned HTTP 200 with backend `postgresql` and status
  `connected`.
- The process listening on port 8000 belongs to this project's Django backend.
  Its established PostgreSQL TCP connection was observed reaching an IP address
  resolved from the intended Session pooler hostname on port 5432.
- The diagnostic process uses the project's virtual environment and the actual
  `medicare_project.settings`. Its selected database configuration matches the
  intended local `.env` connection fields. No credentials were printed.
- PostgreSQL confirmed database `postgres`, schema `public`, and
  `transaction_read_only=on`. See [audit.json](schema_audit/audit.json).

## Cause and complete schema findings

`User` declares 23 concrete columns. The actual `public.accounts_user` has 20.
Exactly these three columns are absent:

| Column | Required PostgreSQL definition | Source |
| --- | --- | --- |
| `lab_name` | `varchar(150) NULL` | `accounts.0006` |
| `lab_address` | `varchar(255) NULL` | `accounts.0006` |
| `license_id` | `varchar(50) NULL` | `accounts.0006` |

The remaining 20 User column names, types, lengths, and nullability match the
current model. There are no extra User columns. The primary key and unique
constraints on `username` and `NIC_number` also match. The full field comparison,
defaults, identity columns, indexes, and constraints are in `audit.json`.

Login obtains a complete `User` instance, so Django selects the missing columns
before it can check the password. The previous `dbtest.py` succeeded because it
explicitly selected only existing admin status fields. A health check's
`SELECT 1` also does not validate the application schema.

Additional findings within the accounts app and its dependencies:

1. `laborator` does not exist. The current `Laborator` model therefore has no
   backing table; pending migrations `0003` through `0005` create and configure it.
2. Existing `register_DoctorID`, `pending_doctors`, `accounts_user_groups`, and
   `accounts_user_user_permissions` columns match their models in name, type,
   length, and nullability. Their inspected primary, unique, and foreign-key
   constraints match the declared relationships.
3. `django_migrations` contains an applied `accounts.0003_alter_user_role`, but
   that migration file is absent from this checkout. It is a different migration
   identity from `0003_laborator_alter_user_role`; it does not satisfy that
   migration. Its original operations cannot be verified from the current files.
   Preserve this historical record; do not delete or relabel it.
4. The existing `admin` has role `admin`, with `is_staff`, `is_superuser`,
   `is_approved`, and `is_active` all `True`. However, current `ROLE_CHOICES` does
   not include `admin`. This is a separate model/form validation mismatch; it is
   not the missing-column cause and does not require changing the account to
   repair login. Leave it outside this minimal schema repair.

Current model column definitions match the latest migration state. Creating
another migration to add the same User columns is unnecessary.

Baseline aggregate counts: 6 users, 3 pending doctors, 0 registered doctors, and
0 rows in each User groups/permissions join table. No individual patient data or
password values were exported.

## Migration history and required dependencies

| Migration | Actual status | Relevant operations |
| --- | --- | --- |
| `accounts.0001_initial` | Applied | Initial User table |
| `accounts.0002_doctor_pendingdoctor_rename_phone_number_user_phone_and_more` | Applied | Doctor/pending-doctor tables and current non-laboratory User fields |
| `accounts.0003_alter_user_role` | Applied record; local file absent | Historical operations unknown; not a dependency of the current chain |
| `accounts.0003_laborator_alter_user_role` | Pending | Create `laborator`; change User role choices, with no User-table SQL |
| `accounts.0004_rename_lab_email_laborator_email` | Pending | Rename `laborator.lab_email` to `email` |
| `accounts.0005_laborator_role_alter_laborator_nic_number_and_more` | Pending | Add laboratory role, adjust lengths/nullability, add NIC uniqueness |
| `accounts.0006_user_lab_address_user_lab_name_user_license_id` | Pending | Add the three missing User columns |

Required order:

```text
contenttypes.0001 -> contenttypes.0002 (already applied)
auth.0001 -> ... -> auth.0012 (all 12 already applied)
accounts.0001 -> accounts.0002 (already applied)
accounts.0003_laborator_alter_user_role
  -> accounts.0004_rename_lab_email_laborator_email
  -> accounts.0005_laborator_role_alter_laborator_nic_number_and_more
  -> accounts.0006_user_lab_address_user_lab_name_user_license_id
```

The complete transitive dependency graph and each migration's operations are in
`audit.json`. Django reports no inconsistent applied dependencies in the current
graph. The extra historical `0003_alter_user_role` record remains a provenance
issue, not an applied substitute for the new laboratory migration.

## SQL inspected

Generated PostgreSQL SQL for every pending migration is saved separately:

- [0003 SQL](schema_audit/0003_laborator_alter_user_role.sql)
- [0004 SQL](schema_audit/0004_rename_lab_email_laborator_email.sql)
- [0005 SQL](schema_audit/0005_laborator_role_alter_laborator_nic_number_and_more.sql)
- [0006 SQL](schema_audit/0006_user_lab_address_user_lab_name_user_license_id.sql)

The SQL for `0006` is exactly:

```sql
BEGIN;
ALTER TABLE "accounts_user" ADD COLUMN "lab_address" varchar(255) NULL;
ALTER TABLE "accounts_user" ADD COLUMN "lab_name" varchar(150) NULL;
ALTER TABLE "accounts_user" ADD COLUMN "license_id" varchar(50) NULL;
COMMIT;
```

There are no defaults, data backfills, or changes to existing User columns in
`0006`. Existing rows receive NULL in the new columns. `0003` creates a new empty
table, `0004` renames a column in that table, and `0005` changes only that new
table. Its length reductions and uniqueness constraint therefore have no
existing laboratory data to truncate or reject under the audited baseline.
None of the four pending migrations contains `RunPython` or a record update.

SQL was generated using Django's `sqlmigrate` collection mode inside the
read-only transaction. See [Django sqlmigrate documentation](https://docs.djangoproject.com/en/6.1/ref/django-admin/#sqlmigrate).

## Reviewed minimal repair plan — authorized and completed

1. Confirm a usable backup/restore point for the intended Supabase database.
   Coordinate a quiet write window while the four schema migrations run.
2. Repeat the read-only audit immediately before repair. Require the same four
   pending migrations, the same three missing User columns, and no `laborator`
   table. If the schema or plan differs, stop and reassess rather than force it.
3. Preview the narrowly targeted migration plan from the project root:

   ```powershell
   .\.venv\Scripts\python.exe -X utf8 backend\manage.py migrate accounts 0006_user_lab_address_user_lab_name_user_license_id --database default --plan
   ```

   It must contain only the four forward accounts migrations listed above.
   All required auth/contenttypes dependencies are already applied.
4. Only after explicit authorization, execute the same target without `--plan`:

   ```powershell
   .\.venv\Scripts\python.exe -X utf8 backend\manage.py migrate accounts 0006_user_lab_address_user_lab_name_user_license_id --database default
   ```

   This is the minimal normal Django repair that keeps both schema and migration
   history correct. Do not run the saved SQL directly, remove fields, edit old
   migration records, or use `--fake`/`--fake-initial`. Targeting `0006` includes
   its pending dependencies; it is not an instruction to skip them. See
   [Django migration dependencies](https://docs.djangoproject.com/en/6.1/topics/migrations/#dependencies).
5. Verify with read-only checks:

   ```powershell
   .\.venv\Scripts\python.exe -X utf8 backend\schema_audit.py
   .\.venv\Scripts\python.exe -X utf8 backend\dbtest.py
   ```

   Require all 23 User columns, matching types/nullability, a matching `laborator`
   table, no pending target migrations, and the four new migration records.
   Preserve the legacy `0003_alter_user_role` record and the existing admin flags.
   Existing user/pending-doctor/registered-doctor counts must match the baseline
   if writes were paused. Check the health endpoint and retry login in the UI
   using the existing password locally; no password reset is part of the repair.

Django will record the four applied migrations and may create content-type and
permission metadata for the new model through `post_migrate`. These are expected
framework metadata changes. The plan does not create application user accounts,
update prescriptions/patients, or modify existing account passwords or flags.
Each PostgreSQL migration is atomic, but the four-migration chain is not one
transaction. If a step fails, stop, inspect the remaining plan, and resume the
normal forward migration after diagnosis. Do not blindly roll back: reversing
these migrations would drop the new columns/table and any data later stored in
them. The forward repair above has now been executed successfully; no rollback
was executed.
