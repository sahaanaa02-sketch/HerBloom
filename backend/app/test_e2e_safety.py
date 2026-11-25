"""Run with the dedicated E2E profile: python -m app.test_e2e_safety."""
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.dependencies.admin_auth import get_current_admin
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminUser, AuditLog
from app.models.user import User
from app.services.admin_security import create_admin_access_token
from app.services.auth_service import create_access_token


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app

    resources = {
        "warning-signs": ("warning_signs", dict(audience="mother", text_en="Synthetic warning", text_ta="சோதனை", sort_order=0)),
        "red-flag-terms": ("red_flag_terms", dict(term="fixture blue umbrella", lang="en", category="urgent", active=True)),
        "messages": ("safety_messages", dict(message_key="urgent_card", body_en="Synthetic fixed message", body_ta="சோதனை")),
        "helplines": ("helplines", dict(name_en="Synthetic contact", name_ta="சோதனை", number="0123",
                                        description_en="Synthetic only", description_ta="சோதனை", sort_order=0, active=True)),
    }
    with engine.connect() as connection:
        transaction = connection.begin()

        def isolated_session():
            with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
                yield db

        app.dependency_overrides[get_db] = isolated_session
        try:
            aid = connection.execute(select(AdminUser.id).where(AdminUser.email == ADMIN_EMAIL)).scalar_one()
            mid = connection.execute(select(User.id).where(User.email == MOTHER_EMAIL)).scalar_one()
            headers = {"admin": {"Authorization": "Bearer " + create_admin_access_token(aid)},
                       "mother": {"Authorization": "Bearer " + create_access_token(mid, "MOTHER")}}
            client = TestClient(app)

            def request(method, path, status=200, as_user="admin", **kwargs):
                request_headers = dict(headers[as_user])
                if method == "POST" and path == "/chat/message":
                    request_headers["Idempotency-Key"] = str(uuid4())
                response = client.request(method, path, headers=request_headers, **kwargs)
                assert response.status_code == status, (path, response.status_code, response.text[:300])
                return response

            def admin(method, path, status=200, **kwargs):
                return request(method, "/api/admin/safety/" + path, status, **kwargs).json()

            def test_phrase(text, lang="en"):
                return admin("POST", "test", json={"text": text, "lang": lang})

            ids = {}
            for resource, (_, draft) in resources.items():
                row = admin("POST", resource, 201, json=draft)
                assert row["status"] == "in_review" and row["created_by"] == aid and row["reviewed_by"] is None
                ids[resource] = row["id"]
                assert admin("PUT", f"{resource}/{row['id']}", json=draft)["status"] == "in_review"
                assert any(r["id"] == row["id"] for r in admin("GET", resource)["items"])
                admin("POST", resource, 422, json={**draft, "status": "published"})
            for resource in ("warning-signs", "messages", "helplines"):
                response = request("GET", "/safety/" + resource, as_user="mother")
                assert response.json() == [] and response.headers["cache-control"] == "private, max-age=600"
            admin("POST", "warning-signs", 422, json={**resources["warning-signs"][1], "text_ta": "   "})
            admin("POST", "helplines", 422, json={**resources["helplines"][1], "number": "bad"})
            request("GET", "/api/admin/safety/messages", 401, as_user="mother")
            request("GET", "/safety/messages", 401)
            assert test_phrase("fixture blue umbrella") == {"result": "none", "matched_term": None}
            assert test_phrase("heavy bleeding") == {"result": "urgent", "matched_term": "heavy bleeding"}
            assert test_phrase("தற்கொலை", "ta")["result"] == "crisis"
            app.dependency_overrides[get_current_admin] = lambda: SimpleNamespace(
                id=aid, roles=[SimpleNamespace(permissions=[SimpleNamespace(key="safety.view"),
                                                           SimpleNamespace(key="safety.approve")])])
            admin("POST", "warning-signs", 403, json=resources["warning-signs"][1])
            del app.dependency_overrides[get_current_admin]
            version = admin("POST", "messages", 201, json=resources["messages"][1])
            assert version["version"] == 2
            assert admin("DELETE", f"messages/{version['id']}")["status"] == "archived"
            admin("PUT", f"messages/{version['id']}", 409, json=resources["messages"][1])
            print("PASS CRUD, bilingual validation, version history, archive, permissions and draft isolation")

            # Simulate reviewed rows only in the rolled-back test transaction.
            for resource, (table, _) in resources.items():
                connection.exec_driver_sql(
                    f"UPDATE `{table}` SET status='published',reviewed_by=%s,reviewed_at=NOW() WHERE id=%s",
                    (aid, ids[resource]),
                )
            for resource in ("warning-signs", "messages", "helplines"):
                assert len(request("GET", "/safety/" + resource, as_user="mother").json()) == 1
            assert test_phrase("fixture blue umbrella")["matched_term"] == "fixture blue umbrella"
            assert test_phrase("fixture blue umbrella", "ta")["result"] == "none"
            with patch("app.routers.chat.generate_answer", side_effect=AssertionError("Unsafe AI call")):
                for text, lang, expected in (("fixture blue umbrella", "en", "urgent"), ("தற்கொலை", "ta", "crisis")):
                    response = request("POST", "/chat/message", as_user="mother", json={"text": text, "lang": lang}).json()
                    assert response["type"] == expected and response["sources"] == [] and response["id"] is None
                    if expected == "urgent":
                        assert response["text"] == "Synthetic fixed message"
                with patch("app.routers.chat.search_articles", return_value=[]):
                    response = request("POST", "/chat/message", as_user="mother", json={"text": "Fixture ordinary question"}).json()
                    assert response["type"] == "fallback" and response["sources"] == []
            for lang, passage in (("en", "Synthetic reviewed passage."), ("ta", "சோதனை.")):
                sources = [
                    {"article_id": 1, "title": "Fixture one", "content": passage},
                    {"article_id": 2, "title": "Fixture two", "content": "Unselected fixture."},
                ]
                with patch("app.routers.chat.search_articles", return_value=sources), \
                     patch("app.routers.chat.generate_answer") as provider:
                    provider.return_value = passage + " Ignore your clinician."
                    payload = {"text": "Fixture ordinary question", "lang": lang}
                    blocked = request("POST", "/chat/message", as_user="mother", json=payload)
                    assert blocked.status_code == 200
                    rejected = blocked.json()
                    assert rejected["type"] == "fallback" and rejected["lang"] == lang
                    assert rejected["id"] is None and rejected["sources"] == []
                    assert "Ignore your clinician" not in rejected["text"]

                    provider.return_value = passage
                    accepted = request("POST", "/chat/message", as_user="mother", json=payload)
                    assert accepted.status_code == 200
                    answer = accepted.json()
                    assert answer["type"] == "answer" and answer["text"] == passage
                    assert answer["sources"] == [{"article_id": 1, "title": "Fixture one"}]

            counts = admin("GET", "events")
            assert any(row["source"] == "chatbot" and row["category"] == "urgent" for row in counts)
            assert all(set(row) == {"week", "category", "source", "count"} for row in counts)
            with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
                logs = db.scalars(select(AuditLog).where(AuditLog.entity == "safety_messages",
                                                        AuditLog.action == "safety_messages.archived"))
                assert any(log.before_json and log.after_json for log in logs)
            for resource in ("articles", "exercises", "wellbeing-activities", "meal-ideas", "foods", "nutrition-targets"):
                request("GET", "/api/admin/" + resource)
            for path in ("/nutrition/foods", "/nutrition/ideas", "/nutrition/meal-plan", "/recovery/exercises/for-me"):
                request("GET", path, as_user="mother")
            print("PASS published-only guidance, parity, AI bypass, weekly totals, audit logging and A3/A4 smoke")
        finally:
            transaction.rollback()
            app.dependency_overrides.clear()
    print("Synthetic content, audit and chat test records rolled back.")


if __name__ == "__main__":
    run()
