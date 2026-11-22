"""Authenticated A12 quota tests against guarded MySQL savepoints."""
from datetime import UTC, datetime, timedelta
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.services import free_quota
from app.services.ai_monitor import AIUnavailable
from app.services.auth_service import create_access_token

LEGACY_CREATED = datetime(2026, 1, 31, 23, 45)
ANCHOR = datetime(2026, 1, 31, 18, 15, tzinfo=UTC)


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app

    with engine.connect() as c:
        outer = c.begin()
        active = None
        app.dependency_overrides[get_db] = lambda: active

        def isolated():
            return Session(bind=c, join_transaction_mode="create_savepoint")

        client = TestClient(app)
        stock = BytesIO()
        Image.new("RGB", (1, 1), "white").save(stock, "PNG")

        def call(path, status, *, token=None, key=None, **kwargs):
            nonlocal active
            headers = {"Authorization": "Bearer " + token} if token else {}
            if key:
                headers["Idempotency-Key"] = str(key)
            with isolated() as active:
                result = client.post(path, headers=headers, **kwargs)
            assert result.status_code == status, (path, result.status_code, result.text[:300])
            return result.json()

        def counts(id):
            return dict(c.exec_driver_sql(
                "SELECT feature,COUNT(*) FROM free_ai_usage_events WHERE user_id=%s GROUP BY feature", (id,)
            ).all())

        try:
            values = ("synthetic_a12_legacy", "Synthetic legacy", "a12-legacy@example.com", "test-only", LEGACY_CREATED)
            id = c.exec_driver_sql(
                "INSERT INTO users (username,full_name,email,hashed_password,role,is_active,created_at) "
                "VALUES (%s,%s,%s,%s,'MOTHER',1,%s)", values,
            ).lastrowid
            token = create_access_token(id, "MOTHER")
            with isolated() as db:
                conn = db.connection()
                conn.exec_driver_sql("UPDATE users SET created_at=%s WHERE id=%s",
                                     (datetime(2099, 1, 1), id))
                try:
                    free_quota.freeze_legacy_anchors(db)
                except ValueError as error:
                    assert str(id) in str(error)
                else:
                    raise AssertionError("Invalid timestamp was accepted")
                db.rollback()
            with isolated() as db:
                assert free_quota.freeze_legacy_anchors(db) >= 1
                db.commit()
            result = c.exec_driver_sql("SELECT created_at,activated_at_utc FROM users WHERE id=%s", (id,)).one()
            assert tuple(result) == (LEGACY_CREATED, ANCHOR.replace(tzinfo=None))
            before = datetime.now(UTC)
            new_user = call("/auth/register", 201, json={"name":"Synthetic new mother", "email":"a12-new@example.com",
                                                         "password":"Synthetic-only-12!"})["user"]["id"]
            new_anchor = c.exec_driver_sql("SELECT activated_at_utc FROM users WHERE id=%s", (new_user,)).scalar_one()
            assert before <= new_anchor.replace(tzinfo=UTC) <= datetime.now(UTC)
            with isolated() as db:
                assert free_quota.freeze_legacy_anchors(db) == 0
                db.commit()

            def scan(status=200, key=None):
                return call("/nutrition/scan", status, token=token, key=key,
                            data={"consent":"true"}, files={"file":("synthetic.png",stock.getvalue(),"image/png")})

            def chat(status=200, key=None):
                return call("/chat/message", status, token=token, key=key,
                            json={"text":"Synthetic question","lang":"en"})

            passages = [{"article_id":1,"title":"Synthetic source","content":"Synthetic answer"}]
            start = ANCHOR + timedelta(days=60)
            chat_key, scan_key = uuid4(), uuid4()
            with patch.object(free_quota, "utc_now", return_value=start + timedelta(days=5)) as clock, \
                 patch("app.routers.chat.search_articles", return_value=passages), \
                 patch("app.routers.chat.generate_answer", return_value="Synthetic answer") as provider, \
                 patch("app.routers.nutrition.scan_food", return_value={"items":[]}) as scanner:
                scan(422)
                chat(422)
                scanner.side_effect = HTTPException(502, "Synthetic scan failure")
                scan(502, scan_key)
                provider.side_effect = AIUnavailable("Synthetic chat failure")
                assert chat(200, chat_key)["type"] == "error"
                assert counts(id) == {}
                scanner.side_effect = None
                provider.side_effect = None
                scan(key=scan_key)
                chat(key=chat_key)
                scan(409, scan_key)
                chat(409, chat_key)
                assert scanner.call_count == provider.call_count == 2
                assert counts(id) == {"scan":1,"chat":1}
                assert provider.call_args.kwargs["entitlement_quota"] is True
                assert scanner.call_args.kwargs["entitlement_quota"] is True
                for _ in range(2):
                    scan(key=uuid4())
                for _ in range(9):
                    chat(key=uuid4())
                scan(429, uuid4())
                chat(429, uuid4())
                assert counts(id) == {"scan":3,"chat":10}
                with patch("app.routers.chat.check_text", return_value={"type":"urgent","text":"Synthetic safety result"}):
                    assert chat()["type"] == "urgent"
                assert counts(id) == {"scan":3,"chat":10}
                clock.return_value = start + timedelta(days=30) - timedelta(microseconds=1)
                scan(429, uuid4())
                clock.return_value = start + timedelta(days=30)
                scan(409, scan_key)
                scan(key=uuid4())
                assert counts(id)["scan"] == 4
                # Simulate return dates after a seven-day Trial and a 30-day paid period.
                # A later Free window always derives from the original activation.
                for elapsed in (7, 37):
                    clock.return_value = start + timedelta(days=30+elapsed)
                    charge = None
                    with isolated() as db:
                        charge = free_quota.begin_request(db, id, "chat", str(uuid4()))
                    expected = free_quota.free_quota_window(ANCHOR, clock.return_value)
                    assert charge.window_start_utc == expected.starts_at.replace(tzinfo=None)

            assert c.exec_driver_sql("SELECT activated_at_utc FROM users WHERE id=%s", (id,)).scalar_one() == ANCHOR.replace(tzinfo=None)
            # Hold the existing account row on this transaction, and use a
            # different connection to confirm the quota lock fails promptly.
            with Session(engine) as second:
                try:
                    free_quota.begin_request(second, new_user, "scan", str(uuid4()))
                except HTTPException as error:
                    assert error.status_code == 409, error.detail
                else:
                    raise AssertionError("Concurrent request did not fail closed")
        finally:
            app.dependency_overrides.pop(get_db, None)
            outer.rollback()

    print("PASS A12 authenticated legacy and signup anchors, failures, deduplication, quota/reset, safety bypass and lock contention.")


if __name__ == "__main__":
    run()
