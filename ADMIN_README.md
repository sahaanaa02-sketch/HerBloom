# HerBloom Admin Portal

The Admin and Mother portals share one React codebase and one FastAPI API. Admin accounts use separate signed tokens and mandatory TOTP. Roles and permissions are maintained in app/seed/sync_admin_permissions.py. Current roles are Super Admin, Content Editor, Clinical Reviewer and Support. API permissions are authoritative, even when a browser route or navigation item is visible.

## Local development and E2E

From backend, install requirements.txt and requirements-dev.txt in a Python virtual environment. Start the local API with python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 and run npm ci and npm run dev from frontend. Keep runtime credentials in the private backend environment. For authenticated verification, follow [the isolated E2E setup](docs/e2e-testing.md) and use the existing private E2E environment file before running:

    python -m app.e2e preflight
    python -m pytest -q app/test_a14_security.py

The separate command python -m app.a14_demo provisions one account per role only in the guarded E2E database. It generates distinct passwords and TOTP secrets and writes them to a14-demo-credentials.json in the existing private E2E directory. Keep that directory owner-restricted. The pytest suite creates temporary accounts in rolled-back transactions and requires no persistent demo seed. Demo accounts use a14-<hyphenated-role>.e2e@example.com.

For a newly approved environment, verify the target database identity, provision the authorized roles, then run python -m app.seed.create_super_admin interactively. The administrator completes authenticator enrollment before receiving an access token. Use private credential provisioning, and verify all role grants before opening access.

## Git security preflight

Run these read-only checks from the repository root:

    git status --short --branch
    git ls-files
    git diff --check
    python backend/scripts/check_repository_secrets.py --history
    git check-ignore .env backend/uploads/sample.png frontend/.env.production

Review candidate binaries, local backups, database files, generated exports, credentials and project configuration manually. The scanner reports paths and lines only. Keep provider keys, database passwords, JWT and TOTP secrets, journal encryption keys, and populated database backups outside the repository. Git ignore rules protect normal staging. A file already in Git history requires incident handling and credential rotation.

After explicit approval, create a review branch from the current main branch, stage only reviewed source files by path, inspect git diff --cached and git diff --cached --name-only, run the scanner with --staged --history, then commit. Push the review branch using git push -u origin HEAD and open a pull request. Verify the existing remote belongs to the intended private GitHub repository. Enable GitHub secret scanning and push protection if the repository supports them. Keep automatic production deploys disabled while the branch is under review.

## Hosted deployment plan

1. **Vercel.** Use two projects from the same frontend directory, with npm ci, npm run build, and dist. Use separate stable hosting-provided HTTPS hostnames, one for Admin and one for Mother. Set VITE_API_URL to the backend HTTPS origin. Set VITE_PORTAL_MODE=admin on the Admin build and mother on the Mother build. The Vercel rewrite configuration serves SPA routes such as /admin/login and /admin/setup. Share the stable Admin URL with staff. The Admin API accepts the exact Admin origin in hosted mode. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite)
2. **FastAPI.** A Render web service can build from backend with pip install -r requirements.txt and start with uvicorn app.main:app --host 0.0.0.0 --port $PORT. Configure trusted proxy addresses with the selected host and test login throttling from different IPs. Set A14_HOSTED=true, A14_ADMIN_ORIGIN, A14_MOTHER_ORIGIN, and a private persistent A14_MEDIA_DIR. Use /health as the liveness check and confirm database connectivity separately. A disk-backed single instance preserves uploaded files across deploys. [FastAPI on Render](https://render.com/docs/deploy-fastapi) · [Persistent disks](https://render.com/docs/disks)
3. **Hosted MySQL.** Use a managed MySQL 8.0 deployment with authorized backend network access, encrypted storage and backups, and separate application and migration principals. Supply DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASSWORD as backend secrets. Supply the provider CA via the absolute DB_SSL_CA certificate path. Hosted mode verifies certificate and hostname. Use the hostname in the certificate. Confirm data residency, outbound IP allowlisting and operating costs before selecting the host. [MySQL TLS verification](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ConnectToInstanceSSL.CLI.html)
4. **Environment isolation.** Store separate SECRET_KEY, ADMIN_JWT_SECRET and JOURNAL_ENCRYPTION_KEY values in each backend's private settings. Set ADMIN_TOKEN_MINUTES=60. Keep A7_EXPORTS_ENABLED, A7_OUTBOUND_EMAIL_ENABLED and A9_ADMIN_INVITES_ENABLED false. Keep payment and provider credentials in backend settings only. The frontend needs the public API URL and portal mode. A hosted build rejects a missing HTTPS API URL when deployed by Vercel.
5. **PayHere Sandbox.** Register the stable sandbox frontend hostname with PayHere once eligibility and hostname support are confirmed. Use a public HTTPS callback at /api/billing/payhere/notify, pointing only to an isolated sandbox backend. Keep its merchant settings, credentials and data separate from production. The current adapter is locked to the guarded local E2E environment. A hosted sandbox verification path requires an approved forwarding arrangement or a separately reviewed hosted sandbox mode. Keep live PayHere disabled. [PayHere JavaScript SDK](https://support.payhere.lk/api-&-mobile-sdk/javascript-sdk)

## Pending schema rollout and recovery

Use the following order after checking the exact schema baseline and obtaining separate authorization:

| Migration | Dependency | SHA-256 |
|---|---|---|
| a11_notifications.sql | Existing Admin and A6 review schema | 509c7e0f1c7de1e244514f30459317f93cd7d49a798eb5eb5f1660fb497ec3c5 |
| a12_free_quota.sql | Mother user schema | 09c7995f9e8ee150dced47d84baa0a5683e38914fc267e6a48d3c97389cfc834 |
| a12_entitlements.sql | A12 Free quota ledger | f58bf3401024316df11b60176c9f6329ba0db8f2b7b6f0901e9d98da078d4ecd |
| a12_payhere_sandbox.sql | A12 entitlement periods | bad23034d06ed7081c3e1aba510e7eca48d19d4841947ebbbff526bd263f89b7 |
| a13_analytics_support.sql | A7 accounts and audit, A3 content schemas, A12 for billing metrics | 6e84f876596568ff636c6350fa8970681be1596ce44c370d032ef9cd86e465db |

Before an approved rollout, stop writers, take a fresh encrypted logical backup outside the repository, capture schema metadata and row counts and hashes, and restore-test the backup in an isolated MySQL instance. Run reviewed statements individually with a bounded metadata lock wait. Compare definitions, indexes, check constraints and foreign keys after each statement. Compare original data and confirm newly created tables are empty. Approve and perform the Free anchor backfill separately. It preserves historical created_at values and reports invalid legacy anchors. Deploy the backend and authorized idempotency-key frontend together before restoring traffic.

MySQL DDL commits per statement. If execution is interrupted, preserve the verified backup and compare the live schema with the last approved statement. Continue only with verified unapplied statements after approval. For an application regression, roll back the application deployment while keeping compatible additive schema changes. For corrupted or missing data, validate an isolated restore and seek explicit authorization before a production restore. [MySQL backup](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html) · [MySQL atomic DDL](https://dev.mysql.com/doc/refman/8.0/en/atomic-ddl.html)

## Database migration replay and restore verification

The 15 SQL files under `backend/migrations` are incremental. They create 33 tables and the `v_admin_users` view across 49 statements. A full replay targeting the current 72-table E2E schema needs a versioned, reviewed 39-table starting schema with matching MySQL version, engine, charset, collation, columns, indexes and keys. It must include the A3.1 and A3.2 Articles and Exercises editorial columns required by A6, plus the pre-migration definitions of all other ALTER targets. The current ORM setup scripts and the post-migration E2E metadata cannot establish that historical state.

Use this dependency-safe order after verifying the starting schema. A3.3 Wellbeing, A3.4 Meal Ideas, A4 Nutrition, A5 Safety, A6 Clinical Review, A7 Users, A9 Settings, A10 AI Monitoring, A11 Notifications, A12 Free Quota, A12 Entitlements, A12 PayHere Sandbox, A13 Analytics and Support, Mother Google Identity, and Food Log Saves. The last two require the existing users table and do not depend on each other. Keep A7 after the baseline mother profile and user definitions, and keep A6 after all four editorial schemas are present.

1. Obtain a schema-only baseline and manifest with provenance, checksum, MySQL version and the last applied change. Confirm the baseline includes the 39 expected existing tables and excludes the objects added by this chain.
2. Restore the baseline to a new empty disposable schema. Verify the server identity, `SELECT DATABASE()`, `CURRENT_USER()` and exact target-scoped grants. Use a separate schema-scoped migration account, and use a CRUD-only account for application tests.
3. Record the SQL checksums. Apply each statement individually with a bounded metadata-lock wait and record its result. If a statement fails, inspect the actual schema and stop before retrying. MySQL DDL can commit between statements.
4. Compare effective columns, defaults, nullability, indexes including FULLTEXT, checks, foreign keys and referential actions, table engines, collations and the account-only view definition against the verified E2E schema. Verify no cross-schema references or orphan rows. Run guarded regressions with synthetic accounts, or compare read-only and run those regressions against the existing guarded E2E profile without altering its guard.

For a production backup restore rehearsal, obtain explicit approval for the source backup, the data handling location, the operators and the retention period.

1. Use a consistent encrypted backup and manifest from the approved source. Verify the encrypted artifact checksum and read-back integrity. Capture source version, schema definitions, table row counts and deterministic data hashes tied to the same backup snapshot. Record the backup timestamp or recovery point.
2. Prepare a fresh isolated MySQL instance with no production credentials, application connections or outbound integrations. Verify the destination and its restore-scoped account before decrypting or importing. Inspect the dump for hardcoded schema names, definers, grants and cross-schema references. Reject any restore input that can target another schema or change instance security.
3. Restore through the approved encrypted workflow without placing plaintext in the repository or logs. Check the full import exit status and inspect any failure before attempting another restore.
4. Accept only if schema and view definitions match, row counts and data hashes match the manifest, all expected foreign keys and ownership checks pass, and the required read-only smoke checks succeed with outbound operations disabled. Record the elapsed restore time, achieved recovery point, verification evidence and approved cleanup. Keep restored production data subject to the same access restrictions as the source.

## Final acceptance

- Complete Admin and Mother browser testing on separate HTTPS origins, including 2FA setup, dashboard workflows, responsive layout, keyboard navigation and English/Tamil rendering.
- Confirm authoring, request changes, resubmission, approval and publication through the Mother view in both languages. Confirm urgent safety terms and scanner aliases through the actual approved integrations.
- Review the clinical content inventory for reviewer and review date before release. Keep operational email, private exports and deletion gated. The isolated suite tests those behaviors with mocked transport and synthetic data.
- Resolve PayHere hosted sandbox sign-off, pending-order reconciliation, taxes and refund policy, data retention, and any remaining clinical or AI policy decisions before activating affected features.
