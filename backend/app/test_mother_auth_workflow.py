"""Mother account flows. Provider verification and email delivery are test doubles."""
from datetime import UTC, date, datetime, timedelta

import jwt
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.user import User
from app.services import mother_account, user_privacy


def test_mother_authentication_flows(monkeypatch):
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    from app.routers import auth

    origin = "http://127.0.0.1:5183"
    monkeypatch.setattr(auth.settings, "E2E_GOOGLE_ENABLED", False)
    monkeypatch.setattr(auth.settings, "E2E_GOOGLE_CLIENT_ID", "test-only-client")
    claims = {}

    def mock_verify(_credential, client_id):
        assert client_id == "test-only-client"
        if not claims:
            raise ValueError("Verification rejected")
        return claims

    monkeypatch.setattr(auth, "verify_google_credential", mock_verify)
    captured = []
    monkeypatch.setattr(mother_account, "send_account_email", lambda email, purpose, token: captured.append((email, purpose, token)))
    from app.config import settings as app_settings
    monkeypatch.setattr(app_settings, "A7_OUTBOUND_EMAIL_ENABLED", True)

    with engine.connect() as connection:
        outer = connection.begin()
        session = None

        def isolated():
            return Session(bind=connection, join_transaction_mode="create_savepoint")

        app.dependency_overrides[get_db] = lambda: session
        monkeypatch.setattr(mother_account, "SessionLocal", isolated)
        try:
            client = TestClient(app)

            def call(method, path, status, token=None, request_origin=origin, **kwargs):
                nonlocal session
                headers = {"Origin": request_origin}
                if token:
                    headers["Authorization"] = "Bearer " + token
                with isolated() as session:
                    response = client.request(method, path, headers=headers, **kwargs)
                assert response.status_code == status, (method, path, response.status_code)
                return response.json() if response.content else None

            spec = call("GET", "/openapi.json", 200)["paths"]
            for route in ("/auth/google/challenge", "/auth/google", "/auth/password-reset/verify"):
                assert "post" in spec[route]

            email = f"auth-{uuid4().hex}@example.com"
            password = "Synthetic first password!"
            signup = {"name": "Synthetic Mother", "email": email, "password": password}
            original = call("POST", "/auth/register", 201, json=signup)["access_token"]
            call("POST", "/auth/register", 409, json=signup)
            call("POST", "/auth/login", 401, data={"username": email, "password": "incorrect"})
            call("POST", "/auth/login", 200, data={"username": email, "password": password})
            call("GET", "/api/admin/me", 401, original)
            call("POST", "/auth/logout", 401)
            claims_expired = jwt.decode(original, options={"verify_signature": False})
            claims_expired.update(iat=datetime.now(UTC) - timedelta(minutes=61),
                                  exp=datetime.now(UTC) - timedelta(minutes=1))
            expired = jwt.encode(claims_expired, auth.settings.SECRET_KEY, algorithm=auth.settings.ALGORITHM)
            call("GET", "/auth/me", 401, expired)
            call("POST", "/auth/logout", 204, original)
            call("GET", "/auth/me", 401, original)
            original = call("POST", "/auth/login", 200, data={"username": email, "password": password})["access_token"]
            call("POST", "/auth/logout", 401, expired)
            assert call("GET", "/profile", 200, original)["onboarding_step"] == 1
            answers = (
                {"baby_birth_date": (date.today() - timedelta(days=10)).isoformat()},
                {"delivery_type": "vaginal"}, {"feeding_method": "both"}, {}, {"language": "ta", "consent_ai_profile": False},
            )
            call("POST", "/profile/onboarding/complete", 409, original)
            call("PATCH", "/profile/onboarding/2", 409, original, json=answers[1])
            call("PATCH", "/profile/onboarding/1", 422, original,
                 json={"baby_birth_date": (date.today() + timedelta(days=2)).isoformat()})
            call("PATCH", "/profile/onboarding/1", 422, original,
                 json={**answers[0], "user_id": 123456})
            for index, answer in enumerate(answers, 1):
                if index == 5:
                    call("POST", "/profile/onboarding/complete", 409, original)
                    call("PATCH", "/profile/onboarding/5", 422, original, json={"language": "ta"})
                    call("PUT", "/profile", 409, original, json={"reminders": []})
                    switch = call("PATCH", "/profile/onboarding/2", 200, original,
                                  json={"delivery_type": "csection", "csection_type": "planned"})
                    assert switch["onboarding_step"] == 5
                    call("PATCH", "/profile/onboarding/2", 422, original,
                         json={"delivery_type": "vaginal", "csection_type": "planned"})
                    call("PATCH", "/profile/onboarding/2", 200, original, json=answers[1])
                    call("PATCH", "/profile/onboarding/3", 200, original,
                         json={"feeding_method": "both", "allergies": ["milk", "milk"]})
                    call("PATCH", "/profile/onboarding/4", 200, original,
                         json={"anaemia": "yes", "hb_value": 11.2, "gdm_history": "yes"})
                    saved = call("GET", "/profile", 200, original)["profile"]
                    assert saved["csection_type"] is None and saved["allergies"] == ["milk"]
                    assert round(saved["hb_value"], 1) == 11.2 and saved["gdm_history"] == "yes"
                    call("PATCH", "/profile/onboarding/4", 200, original,
                         json={"anaemia": "no", "hb_value": 11.2})
                    assert call("GET", "/profile", 200, original)["profile"]["hb_value"] is None
                result = call("PATCH", f"/profile/onboarding/{index}", 200, original, json=answer)
                assert result["onboarding_step"] == min(index + 1, 5)
                if index == 2:
                    fresh = call("POST", "/auth/login", 200, data={"username": email, "password": password})["access_token"]
                    profile = call("GET", "/profile", 200, fresh)
                    assert profile["onboarding_step"] == 3 and not profile["onboarding_done"]
            first_completion = call("POST", "/profile/onboarding/complete", 200, original)
            assert call("POST", "/profile/onboarding/complete", 200, original) == first_completion
            call("PATCH", "/profile/onboarding/1", 409, original, json=answers[0])
            fresh = call("POST", "/auth/login", 200, data={"username": email, "password": password})["access_token"]
            profile = call("GET", "/profile", 200, fresh)
            assert profile["onboarding_done"] and profile["profile"]["language"] == "ta"
            call("GET", "/dashboard/today", 200, fresh)

            clock = mother_account.now()
            monkeypatch.setattr(mother_account, "now", lambda: clock)
            generic = call("POST", "/auth/forgot-password", 202, json={"email": email})
            assert call("POST", "/auth/forgot-password", 202, json={"email": "missing@example.com"}) == generic
            assert call("POST", "/auth/forgot-password", 202, json={"email": email}) == generic
            assert len(captured) == 1  # Resend cooldown is enforced on the server.
            first = captured[-1][2]
            assert len(first) == 6 and first.isascii() and first.isdigit()
            with isolated() as db:
                user = db.scalar(select(User).where(User.email == email))
                entry = user_privacy.sql(db, "SELECT token_hash,expires_at FROM mother_account_tokens WHERE user_id=%s",
                                         (user.id,)).one()
                assert entry.token_hash == mother_account.otp_digest(
                    {"id": user.id, "email": email}, first, entry.expires_at)
                legacy = "x" * 43
                mother_account.store_token(db, {"id": user.id, "email": email}, "password_reset",
                                           user_privacy.secret_hash(legacy), clock + timedelta(hours=1))
                db.commit()
            call("POST", "/auth/reset-password", 400, json={"token": legacy, "password": password})
            call("POST", "/auth/reset-password", 422, json={"token": first, "password": password})
            clock += timedelta(minutes=5)
            expired = call("POST", "/auth/password-reset/verify", 400, json={"email": email, "code": first})
            assert expired["detail"] == "Verification code expired."
            call("POST", "/auth/forgot-password", 202, json={"email": email})
            second = captured[-1][2]
            assert len(captured) == 2 and second != first
            wrong = f"{(int(second) + 1) % 1_000_000:06d}"
            invalid = call("POST", "/auth/password-reset/verify", 400, json={"email": email, "code": first})
            assert call("POST", "/auth/password-reset/verify", 400,
                        json={"email": "missing@example.com", "code": wrong}) == invalid
            for _ in range(4):
                call("POST", "/auth/password-reset/verify", 400, json={"email": email, "code": wrong})
            call("POST", "/auth/password-reset/verify", 400, json={"email": email, "code": second})
            clock += timedelta(seconds=60)
            call("POST", "/auth/forgot-password", 202, json={"email": email})
            current = captured[-1][2]
            grant = call("POST", "/auth/password-reset/verify", 200,
                         json={"email": email, "code": current})["reset_token"]
            replacement = "Synthetic second password!"
            call("POST", "/auth/password-reset/verify", 400, json={"email": email, "code": current})
            call("POST", "/auth/reset-password", 200, json={"token": grant, "password": replacement})
            call("POST", "/auth/reset-password", 400, json={"token": grant, "password": password})
            call("GET", "/auth/me", 401, original)
            call("POST", "/auth/login", 401, data={"username": email, "password": password})
            call("POST", "/auth/login", 200, data={"username": email, "password": replacement})

            assert call("POST", "/auth/forgot-password", 202, json={"email": email}) == generic
            assert len(captured) == 3  # Per-account issuance limit.
            failure_email = f"auth-{uuid4().hex}@example.com"
            call("POST", "/auth/register", 201, json={**signup, "email": failure_email})
            failed = []
            def transport_failure(_email, _purpose, code):
                failed.append(code)
                raise OSError("private provider diagnostic")

            with monkeypatch.context() as transport:
                transport.setattr(mother_account, "send_account_email", transport_failure)
                assert call("POST", "/auth/forgot-password", 202, json={"email": failure_email}) == generic
                assert len(failed) == 1
                call("POST", "/auth/password-reset/verify", 400,
                     json={"email": failure_email, "code": failed[0]})

            call("POST", "/auth/google/challenge", 503)
            monkeypatch.setattr(auth.settings, "E2E_GOOGLE_ENABLED", True)
            call("POST", "/auth/google/challenge", 403, request_origin="https://wrong.example")
            challenge = call("POST", "/auth/google/challenge", 200)

            def exchange(challenge, status):
                return call("POST", "/auth/google", status,
                            json={"challenge": challenge["challenge"], "credential": "mock-" + "x" * 50})

            exchange(challenge, 401)
            google_email = f"auth-{uuid4().hex}@gmail.com"
            claims.update(sub=uuid4().hex, email=google_email, email_verified=True, nonce="wrong")
            exchange(challenge, 401)
            claims["nonce"] = challenge["nonce"]
            first_google = exchange(challenge, 200)
            assert first_google["user"]["role"] == "MOTHER"
            assert call("POST", "/auth/forgot-password", 202, json={"email": google_email}) == generic
            assert len(captured) == 3
            with isolated() as db:
                assert user_privacy.sql(db, "SELECT COUNT(*) FROM mother_account_tokens WHERE user_id=%s",
                                        (first_google["user"]["id"],)).scalar_one() == 0
            exchange(challenge, 401)
            call("GET", "/api/admin/me", 401, first_google["access_token"])
            assert call("GET", "/profile", 200, first_google["access_token"])["onboarding_step"] == 1
            call("PATCH", "/profile/onboarding/1", 200, first_google["access_token"], json=answers[0])
            second = call("POST", "/auth/google/challenge", 200)
            claims["nonce"] = second["nonce"]
            returning = exchange(second, 200)
            assert returning["user"]["id"] == first_google["user"]["id"]
            token = returning["access_token"]
            pending = call("GET", "/profile", 200, token)
            assert pending["onboarding_step"] == 2 and not pending["onboarding_done"]
            for index, answer in enumerate(answers[1:], 2):
                call("PATCH", f"/profile/onboarding/{index}", 200, token, json=answer)
            call("POST", "/profile/onboarding/complete", 200, token)
            third = call("POST", "/auth/google/challenge", 200)
            claims["nonce"] = third["nonce"]
            completed = exchange(third, 200)
            assert completed["user"]["id"] == first_google["user"]["id"]
            assert call("GET", "/profile", 200, completed["access_token"])["onboarding_done"]
            call("GET", "/dashboard/today", 200, completed["access_token"])
            # A matching verified Google address only offers linking until the password is proven.
            existing_email = f"auth-{uuid4().hex}@gmail.com"
            existing = call("POST", "/auth/register", 201,
                            json={**signup, "email": existing_email})["user"]["id"]
            with isolated() as db:
                user_privacy.sql(db, "UPDATE users SET email_verified_at=%s WHERE id=%s",
                                 (user_privacy.now(), existing))
                db.commit()
            # Even a verified local email does not bypass proof of account ownership.
            linking = call("POST", "/auth/google/challenge", 200)
            claims.update(sub=uuid4().hex, email=existing_email, email_verified=False, nonce=linking["nonce"])
            exchange(linking, 401)
            linking = call("POST", "/auth/google/challenge", 200)
            claims.update(email_verified=True, nonce=linking["nonce"])
            offer = exchange(linking, 409)
            assert set(offer) == {"code", "ticket"} and offer["code"] == "google_link_required"
            call("POST", "/auth/google/link-login", 401,
                 json={"ticket": offer["ticket"], "password": "incorrect"})
            try_link = {"ticket": offer["ticket"], "password": password}
            call("POST", "/auth/google/link-login", 403, request_origin="https://wrong.example", json=try_link)
            linked = call("POST", "/auth/google/link-login", 200, json=try_link)
            assert linked["user"]["id"] == existing
            call("GET", "/api/admin/me", 401, linked["access_token"])
            call("POST", "/auth/google/link-login", 401, json=try_link)
            again = call("POST", "/auth/google/challenge", 200)
            claims["nonce"] = again["nonce"]
            assert exchange(again, 200)["user"]["id"] == existing
            call("POST", "/auth/login", 200, data={"username": existing_email, "password": password})
            call("POST", "/auth/google/unlink", 200, linked["access_token"], json={"password": password})
            call("GET", "/auth/me", 401, linked["access_token"])
            call("POST", "/auth/google/link-login", 401, json=try_link)
            call("POST", "/auth/login", 200, data={"username": existing_email, "password": password})

            collision = call("POST", "/auth/google/challenge", 200)
            claims.update(sub=uuid4().hex, email=google_email, nonce=collision["nonce"])
            exchange(collision, 409)
            with isolated() as db:
                assert len(db.scalars(select(User).where(User.email == google_email)).all()) == 1
        finally:
            app.dependency_overrides.pop(get_db, None)
            outer.rollback()

def test_google_token_verifier_uses_signature_issuer_audience_and_expiry(monkeypatch):
    import json
    from datetime import UTC, datetime
    from types import SimpleNamespace

    import jwt
    import pytest
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from fastapi import HTTPException
    from google.auth.transport import requests

    from app.routers import auth

    authorize_e2e_launcher()
    preflight()
    client_id = "test-only-client"
    monkeypatch.setattr(auth.settings, "E2E_GOOGLE_CLIENT_ID", client_id)
    monkeypatch.setattr(auth.settings, "E2E_GOOGLE_ENABLED", False)
    with pytest.raises(HTTPException) as disabled:
        auth.verify_google_credential("unused", client_id)
    assert disabled.value.status_code == 503
    monkeypatch.setattr(auth.settings, "E2E_GOOGLE_ENABLED", True)

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    ).decode()
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    def mock_get(url, *, timeout, method):
        assert url == "https://www.googleapis.com/oauth2/v1/certs"
        assert method == "GET" and timeout == 5
        return SimpleNamespace(status=200, data=json.dumps({"test-key": public_key}).encode())

    monkeypatch.setattr(requests, "Request", lambda: mock_get)
    now = datetime.now(UTC)
    claims = {"iss": "https://accounts.google.com", "sub": "synthetic", "aud": client_id,
              "iat": now - timedelta(seconds=5), "exp": now + timedelta(minutes=5)}

    def sign(values, key=private_key):
        return jwt.encode(values, key, algorithm="RS256", headers={"kid": "test-key"})

    assert auth.verify_google_credential(sign(claims), client_id)["sub"] == "synthetic"
    for candidate in (
        sign({**claims, "iss": "https://untrusted.example"}),
        sign({**claims, "aud": "wrong-client"}),
        sign({**claims, "iat": now - timedelta(minutes=10), "exp": now - timedelta(minutes=5)}),
        sign(claims, other_key),
    ):
        with pytest.raises(ValueError):
            auth.verify_google_credential(candidate, client_id)

def test_onboarding_concurrent_profile_creation():
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from sqlalchemy import delete

    from app.database import SessionLocal
    from app.models.mother_profile import MotherProfile
    from app.services.auth_service import create_access_token

    authorize_e2e_launcher()
    preflight()
    from app.main import app

    identifier = f"onboarding-race-{uuid4().hex}"
    with SessionLocal.begin() as db:
        mother = User(username=identifier, full_name="Synthetic Mother",
                      email=f"{identifier}@example.invalid", hashed_password="unusable")
        db.add(mother)
        db.flush()
        user_id = mother.id
    barrier = Barrier(2)
    headers = {"Authorization": "Bearer " + create_access_token(user_id, "MOTHER")}

    def retrieve():
        with TestClient(app) as client:
            barrier.wait(timeout=10)
            response = client.get("/profile", headers=headers)
        assert response.status_code == 200
        return response.json()

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            requests = [pool.submit(retrieve), pool.submit(retrieve)]
            first, second = (request.result(timeout=25) for request in requests)
        assert first["onboarding_step"] == second["onboarding_step"] == 1
        assert first["profile"]["id"] == second["profile"]["id"]
        with SessionLocal() as db:
            profile = db.scalars(select(MotherProfile).where(MotherProfile.user_id == user_id)).one()
            assert profile.id == first["profile"]["id"]
    finally:
        with SessionLocal.begin() as db:
            db.execute(delete(User).where(User.id == user_id, User.username == identifier))


def test_hosted_reset_opt_in_does_not_enable_administrative_email(monkeypatch, tmp_path):
    import pytest
    from pydantic import ValidationError
    from app import config

    monkeypatch.setattr(config, "E2E_MODE", False)
    ca = tmp_path / "ca.pem"
    ca.touch()
    values = dict(
        DB_USER="fixture", DB_PASSWORD="fixture", DB_NAME="fixture", DB_SSL_CA=ca,
        SECRET_KEY="test-only-key-" * 3, A14_HOSTED=True,
        A14_ADMIN_ORIGIN="https://admin.example.com", A14_MOTHER_ORIGIN="https://mother.example.com",
        A14_MEDIA_DIR=tmp_path / "media", MOTHER_PASSWORD_RESET_EMAIL_ENABLED=True,
        ACCOUNT_SMTP_HOST="smtp.example.com", ACCOUNT_SMTP_FROM="reset@example.com",
        ACCOUNT_SMTP_USER="fixture", ACCOUNT_SMTP_PASSWORD="fixture",
    )
    hosted = config.Settings(_env_file=None, **values)
    assert hosted.MOTHER_PASSWORD_RESET_EMAIL_ENABLED
    assert not hosted.A7_OUTBOUND_EMAIL_ENABLED
    with pytest.raises(ValidationError, match="authenticated SMTP configuration"):
        config.Settings(_env_file=None, **{**values, "ACCOUNT_SMTP_PASSWORD": None})
    with pytest.raises(ValidationError, match="Restricted A7 and A9"):
        config.Settings(_env_file=None, **values, A7_OUTBOUND_EMAIL_ENABLED=True)


def test_isolated_reset_smtp_uses_tls_and_limits_recipient(monkeypatch):
    from unittest.mock import MagicMock
    import pytest
    from fastapi import HTTPException
    from pydantic import SecretStr

    options = dict(
        MOTHER_PASSWORD_RESET_EMAIL_ENABLED=True, A7_OUTBOUND_EMAIL_ENABLED=False,
        ACCOUNT_SMTP_HOST="smtp.example.com", ACCOUNT_SMTP_PORT=587,
        ACCOUNT_SMTP_FROM="reset@example.com", ACCOUNT_SMTP_USER="fixture",
        ACCOUNT_SMTP_PASSWORD=SecretStr("fixture"), E2E_PASSWORD_RESET_TEST_RECIPIENT="mother@example.com",
    )
    for key, value in options.items():
        monkeypatch.setattr(mother_account.settings, key, value)
    relay = MagicMock()
    monkeypatch.setattr(mother_account.smtplib, "SMTP", relay)
    with pytest.raises(RuntimeError, match="isolated test recipient"):
        mother_account.send_account_email("other@example.com", "password_reset", "012345")
    with pytest.raises(HTTPException) as error:
        mother_account.send_account_email("mother@example.com", "verify_email", "x" * 43)
    assert error.value.status_code == 503
    relay.assert_not_called()
    mother_account.send_account_email("mother@example.com", "password_reset", "012345")
    relay.assert_called_once_with("smtp.example.com", 587, timeout=7)
    client = relay.return_value.__enter__.return_value
    assert [call[0] for call in client.method_calls] == ["starttls", "login", "send_message"]
    message = client.send_message.call_args.args[0]
    assert message["To"] == "mother@example.com"
    content = message.get_content()
    assert "012345" in content and "5 minutes" in content and "Do not share" in content
    assert "http" not in content
