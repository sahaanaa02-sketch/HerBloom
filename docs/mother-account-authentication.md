# Mother account authentication

Google sign-in is disabled unless the backend is configured and the Google identity migration is present. The guarded E2E profile reads the dedicated Google opt-in and public client ID only from its private backend.env. Automated tests use synthetic identities and offline Google verification. The opt-in remains off by default.

- Provision a Google OAuth web client for the Mother Portal. Register the exact frontend origin as an authorized JavaScript origin. Set the backend's MOTHER_GOOGLE_CLIENT_ID to the public client ID. Hosted mode uses the existing A14_MOTHER_ORIGIN. For local development, set MOTHER_GOOGLE_ORIGIN to the exact development frontend origin already allowed by CORS. No Google client secret is needed for this button flow.
- Keep Admin on the dedicated origin and existing TOTP flow. Google sign-in identifies returning mothers by Google's subject. Matching emails are never linked automatically. Existing password accounts continue to use their existing sign-in method.
- Apply backend/migrations/mother_google_identity.sql only through a separately authorized rollout. After applying to E2E, verify that its private schema baseline differs by only the added column, index, and constraint before refreshing that baseline.
- Password recovery uses the existing 30-minute one-time token as a code or link. Live delivery requires separately approved SMTP configuration, the approved Mother frontend origin, and A7_OUTBOUND_EMAIL_ENABLED. Leave outbound email disabled in E2E and verify with the mock mail transport.
- Mother sessions persist within the current browser tab. The backend verifies the token and persisted onboarding status on refresh. Admin sessions and TOTP challenges are not persisted in Mother session storage.


## Enable Google for an isolated manual browser test

1. In Google Cloud Console, open Google Auth Platform > Branding and configure the test app. Under Audience, keep the app in Testing and add a dedicated Google test user if prompted.
2. Open Google Auth Platform > Clients and create a Web application client for this test environment.
3. Add http://127.0.0.1:5183 under Authorized JavaScript origins. Use that exact address in Chrome. Port 8100 is the API, not the origin of the browser page.
4. Leave Authorized redirect URIs empty for this popup and JavaScript callback flow. Copy the public Client ID only.
5. Add E2E_GOOGLE_ENABLED=true and E2E_GOOGLE_CLIENT_ID=<your-web-client-id> to %LOCALAPPDATA%\HerBloom\E2E\backend.env. Keep the repository's root .env unchanged. Vite receives the public client ID from the challenge endpoint.
6. Restart only the guarded FastAPI E2E process on 127.0.0.1:8100 with python -m app.e2e serve. A Vite restart is unnecessary for these backend settings.
7. Open http://127.0.0.1:5183/login, wait for the official button to load, and use the dedicated test Google account. Sign out and repeat to verify returning login resolves the same Mother account.
8. To stop manual Google testing, remove the opt-in or set E2E_GOOGLE_ENABLED=false and restart the guarded FastAPI process.
