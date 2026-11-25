from datetime import UTC, datetime, timedelta
from unittest.mock import Mock

import jwt
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.google_identity import GoogleIdentity
from app.services import google_identity as identity


def test_link_challenge_is_bound_to_purpose_origin_audience_account_and_session(monkeypatch):
    origin = "http://127.0.0.1:5183"
    binding = identity.LinkBinding.for_session("MOTHER", 1, "synthetic-session")
    challenge = identity.issue_challenge("client", origin, link=binding)
    sign_in = identity.issue_challenge("client", origin)
    verifier = Mock(return_value={"sub": "example", "nonce": challenge["nonce"], "email_verified": True})
    consume = Mock(side_effect=[True, False])
    monkeypatch.setattr(identity.user_privacy, "consume_limit", consume)
    for token, client, source, expected in (
        (challenge, "client", origin, None),
        (sign_in, "client", origin, binding),
        (challenge, "another-client", origin, binding),
        (challenge, "client", "https://wrong.example", binding),
        (challenge, "client", origin, identity.LinkBinding.for_session("ADMIN", 1, "synthetic-session")),
        (challenge, "client", origin, identity.LinkBinding.for_session("MOTHER", 2, "synthetic-session")),
        (challenge, "client", origin, identity.LinkBinding.for_session("MOTHER", 1, "different-session")),
    ):
        with pytest.raises(HTTPException) as error:
            identity.verify_exchange(None, token["challenge"], "fixture", client, source,
                                     link=expected, verifier=verifier)
        assert error.value.status_code == 401
    verifier.assert_not_called()
    consume.assert_not_called()

    exchange = (None, challenge["challenge"], "fixture", "client", origin)
    verifier.return_value["email_verified"] = False
    with pytest.raises(HTTPException):
        identity.verify_exchange(*exchange, link=binding, verifier=verifier)
    consume.assert_not_called()
    verifier.return_value["email_verified"] = True
    assert identity.verify_exchange(*exchange, link=binding, verifier=verifier)["sub"] == "example"
    with pytest.raises(HTTPException) as replay:
        identity.verify_exchange(*exchange, link=binding, verifier=verifier)
    assert replay.value.status_code == 401


def test_expired_challenge_is_rejected_before_provider():
    claims = {"purpose": "mother_google", "nonce": "fixture", "aud": "client",
              "origin": "https://mother.example.com", "exp": datetime.now(UTC) - timedelta(seconds=1)}
    token = jwt.encode(claims, identity.settings.SECRET_KEY, algorithm=identity.settings.ALGORITHM)
    verifier = Mock()
    with pytest.raises(HTTPException) as error:
        identity.verify_exchange(None, token, "fixture", "client", claims["origin"], verifier=verifier)
    assert error.value.status_code == 401
    verifier.assert_not_called()


def test_registry_rejects_duplicate_subjects_duplicate_owners_and_invalid_bindings():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, is_active BOOLEAN)")
        conn.exec_driver_sql("CREATE TABLE admin_users (id INTEGER PRIMARY KEY, active BOOLEAN)")
        conn.exec_driver_sql("INSERT INTO users VALUES (1, 'MOTHER', 1), (2, 'ADMIN', 1), (3, 'MOTHER', 0)")
        conn.exec_driver_sql("INSERT INTO admin_users VALUES (1, 1), (2, 0)")
        GoogleIdentity.__table__.create(conn)
    with Session(engine) as db:
        mother = identity.LinkBinding.for_session("MOTHER", 1, "mother")
        admin = identity.LinkBinding.for_session("ADMIN", 1, "admin")
        identity.claim_identity(db, "subject", mother)
        db.commit()
        assert identity.find_identity(db, "subject").mother_id == 1
        for subject, owner in (("subject", admin), ("different", mother)):
            with pytest.raises(IntegrityError):
                identity.claim_identity(db, subject, owner)
            db.rollback()
        for role, account in (("MOTHER", 2), ("MOTHER", 3), ("ADMIN", 2)):
            with pytest.raises(HTTPException):
                identity.claim_identity(db, "invalid", identity.LinkBinding.for_session(role, account, "fixture"))
        for owners in ({}, {"mother_id": 1, "admin_id": 1}, {"admin_id": 999}):
            db.add(GoogleIdentity(subject="invalid", **owners))
            with pytest.raises(IntegrityError):
                db.flush()
            db.rollback()
        identity.claim_identity(db, "admin-subject", admin)
        db.commit()
        assert identity.find_identity(db, "admin-subject").admin_id == 1


def test_mother_link_unlink_preserves_login_and_recovery(monkeypatch):
    from types import SimpleNamespace
    from app.routers import auth
    from app.services import mother_account

    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA foreign_keys=ON")
        conn.exec_driver_sql(
            "CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT, is_active BOOLEAN, "
            "anonymized_at TEXT, session_version INTEGER, hashed_password TEXT, google_subject TEXT)"
        )
        conn.exec_driver_sql("CREATE TABLE admin_users (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("CREATE TABLE mother_account_tokens (id INTEGER PRIMARY KEY, user_id INTEGER, purpose TEXT, "
                             "token_hash TEXT, email_at_issue TEXT, expires_at DATETIME, used_at DATETIME)")
        password = "Synthetic password only"
        hashed = auth.hash_password(password)
        conn.exec_driver_sql("INSERT INTO users VALUES (1,'MOTHER',1,NULL,0,?,NULL), "
                             "(2,'MOTHER',1,NULL,0,?,'legacy-subject')", (hashed, hashed))
        GoogleIdentity.__table__.create(conn)

    def sql(db, query, params=()):
        return db.connection().exec_driver_sql(query.replace("%s", "?").removesuffix(" FOR UPDATE"), params)

    monkeypatch.setattr(auth.user_privacy, "sql", sql)
    monkeypatch.setattr(mother_account, "sql", sql)
    monkeypatch.setattr(mother_account, "rows",
                        lambda db, query, params=(): list(sql(db, query, params).mappings()))
    monkeypatch.setattr(auth, "google_client", lambda *_: "fixture-client")
    monkeypatch.setattr(auth.rate_limits, "enforce", lambda *_: None)
    used = set()

    def consume(_db, key, *_):
        if key in used:
            return False
        used.add(key)
        return True

    monkeypatch.setattr(identity.user_privacy, "consume_limit", consume)
    request = SimpleNamespace(headers={"origin": "http://127.0.0.1:5183"},
                              state=SimpleNamespace(mother_session_version=0))
    mother = SimpleNamespace(id=1)
    google_only = SimpleNamespace(id=2)
    reauth = auth.GoogleReauthentication(password=password)

    with Session(engine) as db:
        with pytest.raises(HTTPException) as bad_password:
            auth.google_link_challenge(auth.GoogleReauthentication(password="wrong"), request, db, mother, "one")
        assert bad_password.value.status_code == 401

        def google_proof(subject):
            issued = auth.google_link_challenge(reauth, request, db, mother, "one")
            monkeypatch.setattr(auth, "verify_google_credential", lambda *_: {
                "sub": subject, "nonce": issued["nonce"], "email_verified": True,
            })
            return auth.GoogleCredential(challenge=issued["challenge"], credential="x" * 60)

        legacy = google_proof("legacy-subject")
        with pytest.raises(HTTPException) as duplicate:
            auth.google_link(legacy, request, db, mother, "one")
        assert duplicate.value.status_code == 409
        proof = google_proof("new-subject")
        with pytest.raises(HTTPException):
            auth.google_link(proof, request, db, mother, "another-session")
        assert auth.google_link(proof, request, db, mother, "one")["linked"]
        assert auth.google_link_status(db, mother) == {"available": True, "linked": True, "google_only": False}
        with pytest.raises(HTTPException) as replay:
            auth.google_link(proof, request, db, mother, "one")
        assert replay.value.status_code == 401
        assert not mother_account.google_only_account(db, mother.id)
        assert mother_account.google_only_account(db, google_only.id)
        monkeypatch.setattr(mother_account.settings, "A7_OUTBOUND_EMAIL_ENABLED", True)
        account = {"id": mother.id, "email": "mother@example.com", "is_active": True, "anonymized_at": None}
        code, _ = mother_account.issue_token(db, account, "password_reset")
        stored, expires = sql(db, "SELECT token_hash,expires_at FROM mother_account_tokens WHERE user_id=%s", (mother.id,)).one()
        if isinstance(expires, str):
            expires = datetime.fromisoformat(expires)
        assert stored == mother_account.otp_digest(account, code, expires) and stored != code
        assert sql(db, "SELECT hashed_password FROM users WHERE id=%s", (mother.id,)).scalar_one() == hashed

        with pytest.raises(HTTPException) as blocked:
            auth.google_unlink(reauth, request, db, google_only)
        assert blocked.value.status_code == 409
        with pytest.raises(HTTPException) as wrong_unlink:
            auth.google_unlink(auth.GoogleReauthentication(password="wrong"), request, db, mother)
        assert wrong_unlink.value.status_code == 401
        assert auth.google_unlink(reauth, request, db, mother)["sign_in_required"]
        assert not auth.google_link_status(db, mother)["linked"]
        assert sql(db, "SELECT session_version FROM users WHERE id=%s", (mother.id,)).scalar_one() == 1
        with pytest.raises(HTTPException) as stale:
            auth.google_link_challenge(reauth, request, db, mother, "one")
        assert stale.value.status_code == 401
