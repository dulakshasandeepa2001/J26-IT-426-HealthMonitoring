# Mobile login and signup integration prompt

Copy the prompt below into the coding assistant working on your mobile app.

The configuration values below come from this web repository. Database passwords and secret keys are represented by placeholders because they belong only on the backend, never in a mobile bundle. This analysis is based on source code and configuration; a live database connection was not tested.

---

## Task

Update my existing mobile app's login and signup behavior to match my MediTrack web application. Inspect the mobile project first and use its existing framework, navigation, state management, networking, and storage conventions. Implement the integration, not just a plan.

**Preserve my mobile designs.** Keep the existing layouts, colors, typography, spacing, assets, and components. Bind the existing screens to the correct API and validation logic. If required fields are missing, add them using the existing component styles with minimal layout changes. Do not copy the web app's design or introduce a new design system.

## Existing architecture and source of truth

The web app uses Next.js and calls a Django REST API. Django uses the `accounts.User` model and connects to the existing Supabase PostgreSQL database when `USE_SUPABASE=true`.

The integration path must be:

```text
Mobile app -> Django HTTP API -> existing Supabase PostgreSQL database
```

Do not connect the mobile app directly to PostgreSQL. Do not replace this login with Supabase Auth, Firebase Auth, or a separate user database. Although the web repository contains a Supabase browser client, the login/signup screens do not use it. Existing credentials are checked with Django `check_password()`.

Reference files in the web repository:

- `frontend/src/app/login/page.tsx`
- `frontend/src/app/register/page.tsx`
- `frontend/src/lib/api.ts`
- `backend/accounts/views.py`
- `backend/accounts/models.py`
- `backend/medicare_project/urls.py`
- `backend/medicare_project/settings.py`

## Environment configuration

These are the existing frontend `.env.local` values:

```dotenv
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_SUPABASE_URL=https://wixgbvdcwteghicynwvz.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_iGnekHrvPU8Z83CtjftksA_csRshAHw
```

Use the following logical configuration for mobile, adapting variable names and loading to the actual framework. These names are a template, not an assumption about the mobile framework:

```dotenv
# Example for the standard Android emulator reaching Django on the host computer:
API_BASE_URL=http://10.0.2.2:8000

# Existing public project configuration; NOT needed for Django login/signup:
SUPABASE_URL=https://wixgbvdcwteghicynwvz.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_iGnekHrvPU8Z83CtjftksA_csRshAHw
```

For a physical phone, replace `API_BASE_URL` with `http://<COMPUTER_LAN_IP>:8000`, using a reachable computer on the same network. The web value `127.0.0.1` points to the phone itself when used on a physical phone. Use the deployed Django HTTPS URL for production; no deployed API URL is provided in this repository. Configure any development-only HTTP exceptions narrowly. Do not add Supabase SDK dependencies solely for this authentication flow.

For reference, the root `.env` and backend `.env` contain the following configuration. **These are server-side values, not a mobile configuration file:**

```dotenv
SUPABASE_DB_PASSWORD=<KEEP_EXISTING_VALUE_IN_BACKEND_ENV_ONLY>
SUPABASE_URL=https://wixgbvdcwteghicynwvz.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_iGnekHrvPU8Z83CtjftksA_csRshAHw
SUPABASE_SECRET_KEY=<KEEP_EXISTING_VALUE_IN_BACKEND_ENV_ONLY>
SUPABASE_JWKS_URL=https://wixgbvdcwteghicynwvz.supabase.co/auth/v1/.well-known/jwks.json
REACT_APP_BASE_URL=http://127.0.0.1:8000

# Present in backend/.env:
USE_SUPABASE=true
```

Django's configured defaults, rather than explicit entries in those environment files, are:

```dotenv
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_HOST=db.wixgbvdcwteghicynwvz.supabase.co
SUPABASE_DB_PORT=5432
```

Django requires SSL for this database connection. The Supabase JWKS URL and publishable key do not imply that this API issues or verifies Supabase tokens. Never put database credentials, the Supabase secret key, or Django's secret key in mobile code, mobile environment files, logs, or committed examples.

## Shared API behavior

- Send JSON with `Content-Type: application/json`.
- Use `/login/` and `/create-user/` directly under the API base URL, with trailing slashes. There is no `/api` prefix.
- Centralize base URL handling, JSON parsing, and errors in the existing network layer.
- On non-success responses, prefer the server's `error`, then `message`, then a useful status-based fallback.
- Handle network failures, timeouts, and unexpected non-JSON responses without crashing or exposing raw HTML to users.
- Disable repeated submissions while a request is pending and restore the loading state in all outcomes.
- Do not log passwords or full signup payloads.

## Login

Keep the existing login screen. Authenticate with an identifier and password. The web label is “Username”, but the backend also accepts email in the same `username` property and matches either case-insensitively. Do not require a role selector for login.

```http
POST /login/
Content-Type: application/json
```

```json
{
  "username": "username_or_email",
  "password": "user_entered_password"
}
```

Require both inputs. The web's empty-input message is `Please enter your username and password.` Trim the identifier; never trim or otherwise change the password.

Successful response, HTTP 200:

```json
{
  "message": "Login successful",
  "username": "example_user",
  "role": "patient",
  "doctorID": null,
  "lab_name": null,
  "license_id": null,
  "lab_address": null
}
```

The last four fields may contain strings or null. Do not assume the API returns a user ID, email, access token, refresh token, or expiration time.

Handle these existing server errors:

| Status | Error |
| --- | --- |
| 400 | `Username and password are required` |
| 400 | `Invalid JSON` |
| 401 | `Invalid username or password` |
| 403 | `Your doctor registration is pending administrator review & approval.` |
| 403 | `Your account is pending admin approval.` |
| 500 | Server failure; show an appropriate error state |

After successful login, retain `username`, `role`, `doctorID`, `lab_name`, `license_id`, and `lab_address`. The web stores this profile under `meditrack_user`; use an equivalent mobile storage/state abstraction. Never persist the password.

Route using the returned role:

| Role | Web destination | Mobile behavior |
| --- | --- | --- |
| `admin` | `/admin/dashboard` | Existing admin destination, if supported |
| `doctor` | `/doctor/dashboard` | Existing doctor destination |
| `lab` | `/lab/dashboard` | Existing laboratory destination |
| `patient` | `/patient/dashboard` | Existing patient destination |

Map destinations to actual mobile routes. If this app only supports patients or lacks a role destination, show a clear unsupported-role state using existing UI; do not silently give another role's access or build unrelated dashboards. The web defaults other roles to the patient dashboard, but do not treat that fallback as authorization.

Restore valid cached profile state on app launch for the existing navigation behavior; clear malformed cached data. Logout clears local profile/auth state and resets navigation to login. No backend logout endpoint is implemented in the supplied URL configuration.

## Signup

The web defaults the selected role to `patient`. Available signup roles are `patient`, `doctor`, and `lab`. Admin self-registration is not supported.

Common required web fields:

| JSON property | Value |
| --- | --- |
| `username` | Username string |
| `email` | Valid email address |
| `password` | Password, sent unchanged |
| `phone` | Phone number string |
| `birthday` | Date-only string, `YYYY-MM-DD` |
| `role` | `patient`, `doctor`, or `lab` |
| `NIC_number` | National identity number string; preserve this exact property casing |

Missing common fields show `Please fill in all required fields.` Preserve leading zeros in phone and NIC values. If the mobile design has password confirmation, validate it locally and do not send it to the API.

Doctor-specific fields are `degrees`, `university`, and `working_hospital`. The web displays these for doctors but does not explicitly require them in its submit validation. Do not invent required professional-license or doctor-ID fields. `doctorID` is not a signup input and the current approval handler does not populate it.

The web loads Sri Lankan university names from `http://universities.hipolabs.com/search?country=Sri Lanka` and provides an “Other University” option. Preserve selection/manual-entry behavior where applicable. Send the actual university name in `university`, not the literal `other`. Allow manual entry if lookup fails; do not let a third-party list failure prevent signup.

Laboratory signup additionally requires `lab_name`, `lab_address`, and `license_id`. Missing lab details show `Please fill in all laboratory details.`

Relevant model lengths are phone 15, NIC 12, degrees/university 100, working hospital/lab name 150, lab address 255, and license ID 50. Username follows Django's user model and pending-doctor maximum of 150. Use these to prevent oversized inputs without adding undocumented password-strength requirements. Although password validators exist in settings, the current signup view does not invoke them.

```http
POST /create-user/
Content-Type: application/json
```

The web sends this complete shape, with empty strings for nonapplicable optional fields:

```json
{
  "username": "example_user",
  "email": "user@example.com",
  "password": "user_entered_password",
  "phone": "0771234567",
  "birthday": "1998-05-20",
  "role": "patient",
  "NIC_number": "199812345678",
  "degrees": "",
  "university": "",
  "working_hospital": "",
  "lab_name": "",
  "lab_address": "",
  "license_id": "",
  "created_at": "<current ISO-8601 timestamp>",
  "updated_at": "<current ISO-8601 timestamp>"
}
```

Generate timestamps if preserving the exact web payload, but the signup view does not use these supplied timestamps. Do not send `is_approved`, an admin role, or a fabricated doctor ID.

### Patient outcome

Django creates an approved `accounts.User` and hashes the password. Existing success response is HTTP 200:

```json
{"message":"Account created! You can login now."}
```

Show `Account created successfully! Redirecting to login...` and navigate to login after approximately two seconds. Do not automatically sign in.

### Doctor outcome

Django creates a `PendingDoctor` record with status `pending`; it does not yet create the login user. Existing success response is HTTP 200:

```json
{
  "message": "Registration submitted! Waiting for admin approval.",
  "pending_id": 123
}
```

The web displays `Registration submitted for admin approval! You will be notified once reviewed.` and stays on the registration screen. Preserve the approval-pending outcome and do not auto-login or open a doctor dashboard. No notification delivery implementation was found in this flow; do not claim to implement notification delivery as part of mobile login.

Existing web administration calls `GET /pending-doctors/`, `POST /approve-doctor/<id>/`, and `POST /reject-doctor/<id>/`. Approval creates an approved doctor `User`; rejection marks the pending record rejected. Do not call these routes from normal mobile signup.

### Laboratory outcome

Django creates an approved `accounts.User` with role `lab` and the laboratory fields. Despite a separate `Laborator` model existing, this signup flow does not write to it. Existing response is HTTP 200:

```json
{"message":"Laboratory registered successfully."}
```

Show `Laboratory registered successfully! Redirecting to login...` and navigate to login after approximately two seconds. Do not automatically sign in.

### Signup failures

Handle invalid role and empty body errors as HTTP 400. Current duplicate/database failures may return HTTP 500 with `{"error":"Registration failed: ..."}`; do not assume a structured field-error response or HTTP 409. Keep the user on the form and allow correction/retry. Do not claim email uniqueness is enforced for all users: it is explicitly unique on `PendingDoctor`, whereas the normal Django user email field is not unique here.

## Existing backend limitations: do not invent functionality

The current `/login/` only validates credentials and returns profile JSON. It does not issue tokens, call Django session login, or establish authenticated API access. REST framework authentication classes are empty, and the supplied approval/list views have no explicit permission checks. Cached `meditrack_user` data is navigation state, not proof of authorization.

Implement compatibility with the existing API, but explicitly report that production authenticated access requires backend work. Do not fabricate a JWT, send a fake bearer token, or claim a secure session exists. Keep the client auth/network code structured so a real server-issued session/token can be integrated later. Any backend authentication change must preserve compatibility with the web app and be described separately if the backend is outside the mobile workspace.

Additional observed issues to report rather than silently reproduce in new code:

- Pending doctor passwords are currently stored as plaintext until approval, when `set_password()` hashes the value for the new user. Fixing this requires coordinated backend changes; do not hash the mobile password in a way that breaks current login.
- The pending-doctor login check tests record existence without filtering status, so rejected records can still receive the “pending” message. Display the actual API outcome rather than inventing a rejection-status endpoint.
- No email verification, OTP, password-reset, refresh-token, current-user, or server logout endpoint is implemented in this authentication flow. Do not replace the specified flow with any of these.
- `backend/accounts/views.py` imports Windows-only `_winapi`; this may block deployment to a non-Windows server unless removed from the backend. Do not confuse a backend startup error with mobile credential validation.

## Verification and deliverables

Implement focused checks using the mobile project's existing tools. Verify:

1. Required fields, loading state, duplicate-submit prevention, and network failures.
2. Username/email login request shape and handling of HTTP 200, 400, 401, and 403.
3. Correct role navigation, nullable profile fields, cached state restoration, and logout.
4. Patient and laboratory signup returning to login without auto-login.
5. Doctor signup remaining pending and login remaining blocked until backend approval.
6. Exact field casing, date formatting, optional fields, and laboratory-specific validation.
7. Existing UI appearance is preserved and no server secrets enter the mobile bundle.

Use mocks or an authorized test environment for automated checks; do not create test accounts or approve doctors in a live shared database without authorization. Explain which checks were actually run.

Deliver the updated mobile code, a mobile-safe environment example, concise connection/run instructions for the detected platform, and a list of any remaining backend dependencies. If backend changes are unavailable, clearly distinguish the working API integration from the missing production authentication layer.
