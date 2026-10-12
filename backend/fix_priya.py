import hashlib
import base64
import os
import psycopg2

# 1. Generate Django-compatible PBKDF2 SHA256 hash for 'Priya@123'
new_password = "Priya@123"
salt = "priyasecret"
iterations = 1000000

dk = hashlib.pbkdf2_hmac('sha256', new_password.encode('utf-8'), salt.encode('utf-8'), iterations)
b64_hash = base64.b64encode(dk).decode('ascii').strip()
django_hash = f"pbkdf2_sha256${iterations}${salt}${b64_hash}"

print(f"\n🔑 Generated Django Password Hash for '{new_password}':")
print(django_hash)
print("-" * 60)

# 2. Try updating directly via psycopg2 on all possible Supabase hosts and ports
hosts = [
    "db.wixgbvdcwteghicynwvz.supabase.co",
    "db.yuemlsjtzdpgclgnlogg.supabase.co",
    "aws-0-ap-southeast-1.pooler.supabase.com",
]
password = "Ddugiborn@2001"
updated = False

for host in hosts:
    if updated:
        break
    for port in (5432, 6543):
        try:
            print(f"Connecting to {host}:{port}...")
            conn = psycopg2.connect(
                host=host,
                port=port,
                user="postgres",
                password=password,
                dbname="postgres",
                sslmode="require",
                connect_timeout=4
            )
            with conn.cursor() as cur:
                # Find table name: either accounts_user or auth_user
                cur.execute("""
                    SELECT table_name FROM information_schema.tables 
                    WHERE table_name IN ('accounts_user', 'auth_user') AND table_schema = 'public'
                """)
                tables = [r[0] for r in cur.fetchall()]
                for tbl in tables:
                    cur.execute(f"UPDATE {tbl} SET password = %s, is_active = TRUE WHERE username = 'Priya Singh'", (django_hash,))
                    if cur.rowcount > 0:
                        conn.commit()
                        print(f"✅ SUCCESS! Updated Priya Singh password in table '{tbl}' on {host}:{port}!")
                        updated = True
                        break
            conn.close()
            if updated:
                break
        except Exception as e:
            # print(f"Failed on {host}:{port}: {e}")
            pass

if not updated:
    # Also check local SQLite
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), 'db.sqlite3')
    if os.path.exists(db_path):
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        for tbl in ['accounts_user', 'auth_user']:
            try:
                cur.execute(f"UPDATE {tbl} SET password = ?, is_active = 1 WHERE username = 'Priya Singh'", (django_hash,))
                if cur.rowcount > 0:
                    conn.commit()
                    print(f"✅ SUCCESS! Updated Priya Singh password in local SQLite table '{tbl}'!")
                    updated = True
            except Exception:
                pass
        conn.close()

if updated:
    print(f"\n🎉 ALL DONE! Priya Singh can now log in with password: {new_password}")
else:
    print("\n👉 If direct DB connection timed out, copy the hash above and paste it directly into Supabase Table Editor for Priya Singh!")
