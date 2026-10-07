# MediTrack database configuration

Django reads `backend/.env` explicitly, regardless of the current working
directory. Operating-system environment variables take priority over this file.
Supabase API URLs and API keys do not configure the Django PostgreSQL connection.
When `SUPABASE_URL` is present, the pooled username must match that project's
reference so another project's pooler configuration is rejected.

Set `DATABASE_BACKEND=postgresql`. In your intended Supabase project, open
**Connect > Session pooler** and copy these fields into `backend/.env`:

| Local variable | Value to copy |
| --- | --- |
| `SUPABASE_DB_HOST` | Session pooler hostname, without a URL scheme or port |
| `SUPABASE_DB_PORT` | Session pooler port (`5432`) |
| `SUPABASE_DB_NAME` | Database name shown in the connection details |
| `SUPABASE_DB_USER` | Full pooled username shown in the connection details |
| `SUPABASE_DB_PASSWORD` | Your existing database password, kept locally |

Use the details from the intended project, rather than another project's
connection string. The pooler hostname cannot be derived from the region. Do not
replace the pooled username with the direct-connection username. If copying
separate fields, use the password as entered; do not URL-encode it.

Reference: [Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Missing or invalid fields stop startup with an error naming the affected
variables. PostgreSQL uses SSL and a 10-second connection timeout. Connection
failures never switch databases. The existing SQLite file is retained; using it
requires deliberately setting `DATABASE_BACKEND=sqlite`.

After updating the local file, check the connection from the project root:

```powershell
.\.venv\Scripts\python.exe backend\dbtest.py
```

Alternatively, from `backend`, run:

```powershell
..\.venv\Scripts\python.exe manage.py check_database
```

The command executes `SELECT 1`, reports the connected PostgreSQL database, and
reads existing admin/staff accounts with their role, approval, active, staff, and
superuser flags. PostgreSQL queries run in a read-only transaction. It does not
check passwords, run migrations, create accounts, or modify records. A successful
connection does not prove a particular password can log in to the application.

Restart the backend after editing `.env`; an already-running process retains its
previous configuration. `/health-check/` now runs `SELECT 1`, returning HTTP 200
and the actual database backend when connected, or HTTP 503 and a credential-free
failure description when unavailable. Configuration errors must be resolved
before Django can start. A failed check does not fall back to SQLite.

The focused tests use mocked database connections and a dummy backend. They do
not create test databases or run migrations. From `backend`, run:

```powershell
..\.venv\Scripts\python.exe -m unittest medicare_project.test_database -v
```
