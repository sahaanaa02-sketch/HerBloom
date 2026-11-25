# Local E2E testing

HerBloom uses one React application and one FastAPI application. The E2E profile uses isolated MySQL credentials, keys, browser origins, and media storage.

| Setting | Normal local development | E2E |
|---|---|---|
| API | http://127.0.0.1:8000 | http://127.0.0.1:8100 |
| Frontend | http://127.0.0.1:5173 | http://127.0.0.1:5183 |
| Backend environment | Repository root .env | %LOCALAPPDATA%\HerBloom\E2E\backend.env |
| Database and account | Existing configured identity | herbloom_e2e_test, herbloom_e2e_user@localhost |
| Media | uploads/admin_media relative to backend working directory | %LOCALAPPDATA%\HerBloom\E2E\media |

## Future provisioning requires approval

A database administrator will create the E2E schema and dedicated account, then apply a reviewed schema-only baseline. Include current tables, foreign keys, and the article-chunk FULLTEXT index. Do not import application records or credentials. The runtime account needs exactly SELECT, INSERT, UPDATE, and DELETE scoped to herbloom_e2e_test. Keep DDL privileges with the provisioning identity. On a server with partial_revokes disabled, escape underscores in the database-level GRANT to avoid wildcard grants.

No database setup is performed by the commands in this foundation. The fixture and reset commands require the verified E2E schema and exact runtime grants. The provisioned schema is checked against the private schema-metadata.json baseline before either command can write.

## Private test configuration

After provisioning approval, save backend.env under %LOCALAPPDATA%\HerBloom\E2E. Use the following keys and replace the placeholders with real **test-only** values. Environment references are not expanded inside this file. Enter the complete absolute media path, using forward slashes if quoting a Windows path.

    DB_HOST=localhost
    DB_PORT=3306
    DB_NAME=herbloom_e2e_test
    DB_USER=herbloom_e2e_user
    DB_PASSWORD=<dedicated test account password>
    SECRET_KEY=<random mother JWT key, at least 32 characters>
    ADMIN_JWT_SECRET=<different random admin JWT key, at least 32 characters>
    JOURNAL_ENCRYPTION_KEY=<Fernet key generated for E2E>
    E2E_ADMIN_PASSWORD=<generated test admin password>
    E2E_MOTHER_PASSWORD=<different generated test mother password>
    E2E_API_PORT=8100
    E2E_FRONTEND_ORIGIN=http://127.0.0.1:5183
    E2E_MEDIA_DIR=C:/Users/<your user>/AppData/Local/HerBloom/E2E/media

Use separate randomly generated keys and never paste real credentials into the file. E2E settings do not load the repository .env or inherit its settings from process variables. Gemini chat, weekly AI summaries, and the external food scanner cannot use provider credentials in this profile. The local article retrieval path remains available.

## Run preflight and start the apps

From the backend directory in a dedicated PowerShell terminal:

    $env:HERBLOOM_ENV = 'e2e'
    $env:HERBLOOM_E2E_ENV_FILE = Join-Path $env:LOCALAPPDATA 'HerBloom/E2E/backend.env'
    .\venv\Scripts\python.exe -m app.e2e preflight
    .\venv\Scripts\python.exe -m app.e2e fixtures
    .\venv\Scripts\python.exe -m app.e2e serve

Preflight verifies the private media path, the active DB and MySQL account, and exact runtime grants. Use the E2E launcher to start FastAPI. It binds only to 127.0.0.1:8100 and checks preflight before serving requests.

From the frontend directory in a separate PowerShell terminal:

    $env:VITE_API_URL = 'http://127.0.0.1:8100'
    npm run dev -- --mode e2e

Vite E2E mode takes the API URL explicitly from this terminal and disables environment-file loading. It binds to 127.0.0.1:5183 with strict port selection. The browser checks the E2E readiness response before rendering the app. A missing or incorrect API URL fails during Vite configuration. Keep these environment variables out of your ordinary development terminal.

## Browser verification and future fixtures

1. In a terminal with the same backend E2E environment, run .\venv\Scripts\python.exe -m app.e2e smoke. It verifies test readiness, route registration, and anonymous access denial without making writes.
2. The fixtures command creates admin.e2e@example.com and mother.e2e@example.com, test Articles and Exercises, and a generated local PNG. Use the generated credentials from the private E2E file.
3. Open http://127.0.0.1:5183 in a separate browser profile. Check the network panel for API calls to port 8100. Test admin login, Articles and Exercises CRUD, status transitions, image permissions, and Mother Portal visibility. Live YouTube thumbnails require access to YouTube's image host.
4. Before reset, stop the E2E backend and close the E2E browser sessions. Run .\venv\Scripts\python.exe -m app.e2e reset only when you want to discard all test data. It rechecks the database, account, schema and media path before replacing only E2E fixtures and media.

## PayHere Sandbox

The payment adapter is enabled only in the guarded HerBloom E2E profile on herbloom_e2e_test. It has no live mode. Apply a12_free_quota.sql and a12_entitlements.sql before a12_payhere_sandbox.sql, and verify the isolated schema baseline before starting the E2E API. Synthetic lifecycle tests use mocked provider responses and require no PayHere account.

To test the hosted popup separately, privately configure the following values in the existing E2E settings file. Use PayHere Sandbox credentials, a registered sandbox checkout domain, and synthetic contact and payment details.

| Setting | Purpose |
|---|---|
| A12_PAYHERE_SANDBOX_ENABLED | Explicit true opt-in. Default is false. |
| A12_PAYHERE_MERCHANT_ID | Sandbox merchant ID. |
| A12_PAYHERE_MERCHANT_SECRET | Sandbox merchant secret for the registered checkout domain. |
| A12_PAYHERE_NOTIFY_URL | Public HTTPS URL ending in /api/billing/payhere/notify, forwarding only to the guarded E2E API. |
| A12_PAYHERE_APP_ID and A12_PAYHERE_APP_SECRET | Optional sandbox Merchant API credentials for Retrieval. |

Open **Profile & Settings → My Plan** to access the sandbox checkout and payment history. PayHere popup events refresh the backend order state. A pending order remains pending until a signed status arrives, and a verified failure or cancellation allows another attempt. The Admin **Subscriptions** page shows provider events and linked entitlement periods. Staff with billing.manage can retrieve sandbox refund and chargeback status. This records a review flag and leaves entitlement periods intact.

See the [PayHere JavaScript SDK](https://support.payhere.lk/api-&-mobile-sdk/javascript-sdk) and [PayHere Retrieval API](https://support.payhere.lk/api-&-mobile-sdk/retrieval-api).

## Optional live Gemini meal scan

The guarded E2E backend normally blocks all external AI. For a one-off meal-scanner
test, create a key in a separate Gemini test project and add these two entries to
the private `%LOCALAPPDATA%/HerBloom/E2E/backend.env` file:

    E2E_LIVE_MEAL_SCANNER_ENABLED=true
    E2E_MEAL_SCANNER_GEMINI_API_KEY=<dedicated test-project API key>

Use the guarded preflight and restart only the E2E API with `python -m app.e2e serve`.
Use the existing scanner model configuration; the model must be enabled, approved
by the gateway, and available to the test project. The key is only read by the
server-side scanner and never by the shared chat, summary, or meal-plan provider.
Do not put it in the root environment file or any frontend variable.

Use a synthetic Mother account with a scan remaining. At
`http://127.0.0.1:5183/login`, open Nutrition and the scanner. Upload one food-only
Sri Lankan meal photo, check the existing consent box, and analyze it. Confirm
the recognized items and estimated portions render, then correct a portion or
catalog match, save, and reload the Food Diary. Check that one successful scan
consumed one allowance and that the edited portion persists. Set the flag to
`false`, remove the test key from the private file, and restart the E2E API after
the live check.

## Final Mother onboarding schema

`backend/migrations/mother_onboarding_v2.sql` adds one nullable JSON column to `mother_profiles`. There is no backfill. Completed profiles remain completed. An unfinished legacy profile keeps its answers and earned progress, and resumes at the first section that must be revisited in the new flow. The app serves the legacy wizard while the column is absent. After migration, the profile response advertises version 2 and the frontend uses the versioned step saves. Keep both application deployments coordinated after separate migration approval.

Rehearse with a verified copy of the current schema and synthetic partial and complete profiles. Compare every original profile value before and after DDL, then test the versioned flow, consent, retries and role isolation through a CRUD-only account scoped to the disposable database. The production migration and the historical Phase 2 chain replay remain separate verification tasks. Stored daily reminder time uses local wall-clock time and does not enable outbound reminder delivery.
