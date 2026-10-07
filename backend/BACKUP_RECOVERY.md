# Backup taken before the accounts schema repair

The pre-repair PostgreSQL custom-format archive is encrypted using Windows
CurrentUser DPAPI and stored outside the repository:

```text
C:\Users\USER\AppData\Local\MediTrack\Backups\supabase-before-accounts-0006-20261007-230628.dump.dpapi
```

The adjacent `.dump.manifest.json` records archive checksums and the private
before/after data fingerprints. `latest_accounts_repair.json` identifies that
manifest. The directory permits access only to the current Windows user and
SYSTEM. Preserve these files and the Windows user profile: this encryption
requires the same Windows user's DPAPI keys to decrypt it. Copying only the
encrypted archive to another account does not make it usable there.

PostgreSQL 17.11 `pg_dump` used a read-only exported snapshot from the intended
Supabase database. All 52 source tables are present, including their data (with
partition data stored under its child tables). `pg_restore` successfully parsed
and decompressed the complete archive, and the encrypted file was decrypted and
compared byte for byte with the original. This verifies archive integrity and
decryptability; an actual restore to a separate database has not been rehearsed.

From the project root, this command validates the saved archive without opening
a database connection, writing plaintext to disk, or executing restore SQL:

```powershell
@'
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, 'backend')
from migration_backup_guard import POINTER_FILE, TOOLS, dpapi, safe_tool
manifest_path = Path(json.loads(POINTER_FILE.read_text())['manifest_file'])
manifest = json.loads(manifest_path.read_text())
protected = Path(manifest['backup_file']).read_bytes()
assert hashlib.sha256(protected).hexdigest() == manifest['encrypted_sha256']
archive = dpapi(protected, False)
assert hashlib.sha256(archive).hexdigest() == manifest['archive_sha256']
safe_tool([str(TOOLS / 'pg_restore.exe'), '--file=NUL'], input=archive)
print('Private backup decrypts correctly and the complete archive parses.')
'@ | .\.venv\Scripts\python.exe -X utf8 -
```

For a future recovery, decrypt with `dpapi(protected, False)` and pass the bytes
directly as subprocess input to `pg_restore`. Prepare a separate compatible
PostgreSQL restore target with the required Supabase roles and extensions first.
This database archive includes database data, schema and ownership/privilege
metadata; cluster roles and Storage object file contents are not included.
Confirm a restored database before authorizing any production recovery. No
restore or rollback is part of this completed schema repair.
