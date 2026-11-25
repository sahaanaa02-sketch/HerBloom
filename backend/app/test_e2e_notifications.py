"""A11 integration tests. All synthetic mutations roll back."""
from datetime import UTC, timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser, AuditLog
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.services.admin_security import create_admin_access_token
from app.services import clinical_review, entitlements, free_quota
from app.services.auth_service import create_access_token
from app.services.recovery_rules import local_today


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app

    with engine.connect() as connection:
        outer = connection.begin()

        def isolated():
            return Session(bind=connection, join_transaction_mode="create_savepoint")

        active = None
        app.dependency_overrides[get_db] = lambda: active
        try:
            with isolated() as db:
                mother = db.scalar(select(User).where(User.email == MOTHER_EMAIL))
                profile = db.scalar(select(MotherProfile).where(MotherProfile.user_id == mother.id))
                profile.baby_birth_date = local_today() - timedelta(weeks=6)
                profile.language = "ta"
                profile.delivery_type = "csection"
                profile.reminders = ["water", "exercises", "appointments"]
                manager = db.scalar(select(AdminUser).where(AdminUser.email == ADMIN_EMAIL))
                grants = {}
                for key in ("notifications.view", "notifications.create", "notifications.send", "notifications.manage"):
                    permission = db.scalar(select(AdminPermission).where(AdminPermission.key == key))
                    if permission is None:
                        permission = AdminPermission(key=key)
                        db.add(permission)
                    grants[key] = permission
                manager.roles.append(AdminRole(name="a11_synthetic_manager", permissions=list(grants.values())))
                editor = AdminUser(email="a11-editor@example.com", name="Synthetic content editor",
                                   active=True,  password_hash="Synthetic token-only account",
                                   roles=[AdminRole(name="a11_synthetic_editor",
                                                    permissions=[grants["notifications.view"], grants["notifications.create"]])])
                other = User(username="a11_other", email="a11-other@example.com", full_name="Synthetic mother",
                             role="MOTHER", hashed_password="Synthetic token-only account", is_active=True)
                db.add_all([editor, other])
                db.flush()
                db.add(MotherProfile(user_id=other.id, baby_birth_date=local_today() - timedelta(weeks=7),
                                     delivery_type="vaginal", language="en", reminders=[]))
                db.flush()
                ids = manager.id, editor.id, mother.id, other.id
                db.commit()

            headers = {
                "admin": create_admin_access_token(ids[0]),
                "editor": create_admin_access_token(ids[1]),
                "mother": create_access_token(ids[2], "MOTHER"),
                "other": create_access_token(ids[3], "MOTHER"),
            }
            client = TestClient(app)

            def call(method, path, status=200, role="admin", **kw):
                nonlocal active
                with isolated() as active:
                    auth = {"Authorization": "Bearer " + headers[role]} if role else {}
                    response = client.request(method, path, headers=auth, **kw)
                assert response.status_code == status, (method, path, response.status_code, response.text[:500])
                return response.json()

            def api(method, path, status=200, role="admin", **kw):
                return call(method, "/api/admin/notifications" + path, status, role, **kw)

            def mother_get(path, role="mother"):
                return call("GET", path, role=role)

            call("GET", "/announcements/active", 401, role=None)
            api("GET", "/announcements", 401, role="mother")
            call("GET", "/announcements/active", 401, role="admin")
            stamp = clinical_review.now()

            def utc(days):
                return (stamp + timedelta(days=days)).isoformat() + "Z"

            audience = {"week_min": 0, "week_max": 6, "delivery_type": "csection", "language": "ta"}
            preview = api("POST", "/announcements/audience-preview", json=audience)
            assert preview == {"count": 1}
            assert api("POST", "/announcements/audience-preview", json={**audience, "plan": "premium"}) == {"count": 0}
            api("POST", "/announcements/audience-preview", 422, json={"week_min": 7, "week_max": 6})
            draft = {**audience, "title_en": "Synthetic announcement", "title_ta": "சோதனை அறிவிப்பு",
                     "body_en": "Synthetic announcement body", "body_ta": "சோதனை செய்தி",
                     "channel": "banner", "start_at": utc(1), "end_at": utc(2)}
            api("POST", "/announcements", 422, json={**draft, "title_ta": " "})
            api("POST", "/announcements", 422, json={**draft, "end_at": utc(0)})
            api("POST", "/announcements", 422, json={**draft, "status": "published"})
            item = api("POST", "/announcements", 201, role="editor", json=draft)
            path = "/announcements/" + str(item["id"])
            assert mother_get("/announcements/active") == []
            assert api("GET", path)["lifecycle"] == "draft"
            api("PUT", path, json={**draft, "title_en": "Synthetic edited"})
            api("POST", path + "/publication?action=publish", 403, role="editor")
            assert api("POST", path + "/publication?action=publish")["lifecycle"] == "scheduled"
            assert api("GET", "/announcements?status=scheduled&search=edited&page_size=1")["total"] == 1
            api("PUT", path, 409, json=draft)
            with patch.object(clinical_review, "now", return_value=stamp + timedelta(days=1, hours=1)):
                assert mother_get("/announcements/active") == [
                    {"id": item["id"], "title": draft["title_ta"], "body": draft["body_ta"], "channel": "banner"}]
                assert mother_get("/announcements/active", "other") == []
                assert api("GET", "/announcements?status=active")["total"] == 1
            with patch.object(clinical_review, "now", return_value=stamp + timedelta(days=2, hours=1)):
                assert api("GET", path)["lifecycle"] == "expired"
                assert mother_get("/announcements/active") == []
            assert api("POST", path + "/publication?action=unpublish")["lifecycle"] == "draft"
            api("PUT", path, json={**draft, "plan": "premium", "start_at": utc(-1)})
            api("POST", path + "/publication?action=publish")
            assert mother_get("/announcements/active") == []
            api("DELETE", path, 403, role="editor")
            api("DELETE", path, 409)
            api("POST", path + "/publication?action=unpublish")
            api("DELETE", path)
            api("GET", path, 404)

            plan_audience = {**audience, "week_max": 7, "delivery_type": "vaginal", "language": "en"}
            for offset, code in enumerate(("free", "trial", "premium")):
                plan_draft = {**draft, **plan_audience, "plan": code, "start_at": utc(-1)}
                plan_item = api("POST", "/announcements", 201, json=plan_draft)
                api("POST", f"/announcements/{plan_item['id']}/publication?action=publish")
                with isolated() as db:
                    moment = stamp.replace(tzinfo=UTC) + timedelta(minutes=offset)
                    db.connection().exec_driver_sql(
                        "UPDATE users SET activated_at_utc=%s WHERE id=%s",
                        (entitlements.utc_naive(moment - timedelta(days=1)), ids[3]))
                    if code != "free":
                        db.connection().exec_driver_sql(
                            "UPDATE entitlement_periods SET ends_at_utc=%s "
                            "WHERE user_id=%s AND starts_at_utc < %s AND ends_at_utc > %s",
                            (entitlements.utc_naive(moment), ids[3], entitlements.utc_naive(moment),
                             entitlements.utc_naive(moment)))
                        entitlements.insert_period(db, ids[3], code, "a11-target-" + code,
                                                   entitlements.utc_naive(moment + timedelta(seconds=1)))
                    db.commit()
                instant = moment + timedelta(seconds=2)
                with isolated() as db:
                    assert entitlements.current(db, ids[3], instant).code == code, code
                with patch.object(free_quota, "utc_now", return_value=instant):
                    assert api("POST", "/announcements/audience-preview",
                               json={**plan_audience, "plan": code}) == {"count": 1}
                    assert [row["id"] for row in mother_get("/announcements/active", "other")] == [plan_item["id"]]
                    assert mother_get("/announcements/active") == []
            print("PASS Free, Trial and Premium announcement audience and aggregate preview")

            tip_payload = {"week": 6, "text_en": "Synthetic tip", "text_ta": "சோதனை குறிப்பு"}
            tip = api("POST", "/daily_tips", 201, json=tip_payload)
            assert mother_get("/daily-tips/active") is None
            tip_path = "/daily_tips/" + str(tip["id"])
            api("PUT", tip_path, 422, json={**tip_payload, "reviewed_by": ids[0]})
            api("POST", tip_path + "/editorial?action=submit", role="editor")
            queue = call("GET", "/api/admin/reviews?entity=daily_tips")
            review_id = next(row["id"] for row in queue["items"] if row["entity_id"] == tip["id"])
            review_path = "/api/admin/reviews/" + str(review_id)
            call("POST", review_path + "/publish", 409)
            call("POST", review_path + "/approve", 403, role="editor")
            call("POST", review_path + "/approve")
            assert mother_get("/daily-tips/active") is None
            call("POST", review_path + "/publish")
            assert mother_get("/daily-tips/active") == {"week": 6, "text": tip_payload["text_ta"]}
            assert mother_get("/daily-tips/active", "other") is None

            assert mother_get("/dashboard/reminders/templates") == []
            for key in ("water", "recovery", "appointment", "gdm_test"):
                template = api("POST", "/reminder_templates", 201, json={
                    "key": key, "text_en": "Synthetic reminder", "text_ta": "சோதனை நினைவூட்டல்"})
                api("POST", f"/reminder_templates/{template['id']}/publication?action=publish")
            assert {row["key"] for row in mother_get("/dashboard/reminders/templates")} == {"water", "recovery", "appointment"}
            assert mother_get("/dashboard/reminders/templates", "other") == []
            with isolated() as db:
                profile = db.scalar(select(MotherProfile).where(MotherProfile.user_id == ids[2]))
                assert profile.reminders == ["water", "exercises", "appointments"]
                profile.reminders = ["gdm_test"]
                db.commit()
            assert [row["key"] for row in mother_get("/dashboard/reminders/templates")] == ["gdm_test"]
            archived = api("POST", "/daily_tips", 201, json=tip_payload)
            archived_path = f"/daily_tips/{archived['id']}/editorial"
            api("POST", archived_path + "?action=archive")
            api("POST", archived_path + "?action=submit", 409)
            assert mother_get("/daily-tips/active") == {"week": 6, "text": tip_payload["text_ta"]}
            with isolated() as db:
                audit = db.scalars(select(AuditLog).where(AuditLog.entity == "announcements",
                                                        AuditLog.entity_id == str(item["id"]))).all()
                assert {"notifications.created", "notifications.updated", "notifications.publish",
                        "notifications.unpublish", "notifications.deleted"} <= {log.action for log in audit}
                assert any(log.before_json and log.after_json for log in audit)
        finally:
            app.dependency_overrides.pop(get_db, None)
            outer.rollback()

    print("A11 authenticated E2E PASS: bilingual validation, windows, targeting, permissions, clinical approval, preferences and audit")


if __name__ == "__main__":
    run()
