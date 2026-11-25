# Mother account authentication

Google sign-in requires backend configuration and the legacy Google subject column. Connecting or disconnecting Google on an existing account also requires the Google identity registry. The guarded E2E profile reads the dedicated Google opt-in and public client ID only from its private backend.env. Automated tests use synthetic identities and offline Google verification. The opt-in remains off by default.

- Provision a Google OAuth web client for the Mother Portal. Register the exact frontend origin as an authorized JavaScript origin. Set the backend's MOTHER_GOOGLE_CLIENT_ID to the public client ID. Hosted mode uses the existing A14_MOTHER_ORIGIN. For local development, set MOTHER_GOOGLE_ORIGIN to the exact development frontend origin already allowed by CORS. No Google client secret is needed for this button flow.
- Google sign-in is available only for Mothers. Google sign-in identifies returning mothers by Google's subject. Matching emails are never linked automatically. Eligible Mothers can connect Google from the shared Login prompt or from Profile Settings after confirming their HerBloom password. Password login and recovery remain available for password-based accounts.
- Apply backend/migrations/mother_google_identity.sql only through a separately authorized rollout. After applying to E2E, verify that its private schema baseline differs by only the added column, index, and constraint before refreshing that baseline.
- Password recovery uses a five-minute, six-digit email code. Successful verification issues a separate five-minute, single-use authorization to set the password in the same tab. Legacy password reset links are no longer accepted. Google-only accounts continue to use Google sign-in. The hosted password-reset opt-in and isolated delivery procedure are below.
- Mother sessions persist within the current browser tab. The backend verifies the token and persisted onboarding status on refresh. Admin and Mother session storage are separate.


## Enable Google for an isolated manual browser test

1. In Google Cloud Console, open Google Auth Platform > Branding and configure the test app. Under Audience, keep the app in Testing and add a dedicated Google test user if prompted.
2. Open Google Auth Platform > Clients and create a Web application client for this test environment.
3. Add http://127.0.0.1:5183 under Authorized JavaScript origins. Use that exact address in Chrome. Port 8100 is the API, not the origin of the browser page.
4. Leave Authorized redirect URIs empty for this popup and JavaScript callback flow. Copy the public Client ID only.
5. Add E2E_GOOGLE_ENABLED=true and E2E_GOOGLE_CLIENT_ID=<your-web-client-id> to %LOCALAPPDATA%\HerBloom\E2E\backend.env. Keep the repository's root .env unchanged. Vite receives the public client ID from the challenge endpoint.
6. Restart only the guarded FastAPI E2E process on 127.0.0.1:8100 with python -m app.e2e serve. A Vite restart is unnecessary for these backend settings.
7. Open http://127.0.0.1:5183/login, wait for the official button to load, and use the dedicated test Google account. Sign out and repeat to verify returning login resolves the same Mother account.
8. To stop manual Google testing, remove the opt-in or set E2E_GOOGLE_ENABLED=false and restart the guarded FastAPI process.


## Password reset delivery

Use an authenticated transactional SMTP relay with STARTTLS and a verified sender.
Allow outbound connections from the backend to the relay's STARTTLS port. Keep
SMTP values in private backend settings.

```dotenv
MOTHER_PASSWORD_RESET_EMAIL_ENABLED=true
ACCOUNT_SMTP_HOST=<relay hostname>
ACCOUNT_SMTP_PORT=587
ACCOUNT_SMTP_FROM=<verified sender email>
ACCOUNT_SMTP_USER=<relay username>
ACCOUNT_SMTP_PASSWORD=<relay password or app-specific credential>
```

The dedicated reset opt-in validates the Mother frontend origin at startup.
Hosted mode uses `A14_MOTHER_ORIGIN`, normal local development uses
`ACCOUNT_EMAIL_FRONTEND_ORIGIN` (for example, `http://localhost:5173`), and
E2E uses its fixed frontend origin. The reset email contains the code only.
Keep `A7_OUTBOUND_EMAIL_ENABLED=false` in hosted mode. The reset-only opt-in
leaves administrative mail, invitations, and exports gated independently.

### Controlled real delivery test

1. Create or select a synthetic email/password Mother account in the isolated
   database using a test mailbox you control. Google-only accounts cannot reset.
2. In the private E2E `backend.env`, add the settings above using dedicated
   provider credentials, plus `E2E_PASSWORD_RESET_TEST_RECIPIENT` set to that
   exact mailbox address. Keep `A7_OUTBOUND_EMAIL_ENABLED=false`.
3. Run the guarded E2E preflight and restart only the isolated API. Start the
   E2E frontend as described in [the E2E runbook](e2e-testing.md).
4. Open `http://127.0.0.1:5183/login`, select **Forgot password**, and request
   a code. Check the inbox and spam folder. Enter the received code, choose a
   new password, and sign in using the new password. Check that the old
   password and the used code are rejected.
5. Turn the reset opt-in off, remove the test SMTP credentials, and restart the
   isolated API after testing. Automated tests should use mocked delivery.
