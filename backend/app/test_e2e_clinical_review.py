"""Run against the dedicated E2E database. All fixtures are rolled back."""
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminPermission, AdminRole, AdminUser, AuditLog
from app.models.nutrition import Food
from app.models.mother_profile import MotherProfile
from app.models.user import User
from app.services.admin_security import create_admin_access_token
from app.services import entitlements, free_quota
from app.services.auth_service import create_access_token
from app.services.clinical_review import now


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    from app.routers import recovery, wellbeing

    with engine.connect() as conn:
        transaction = conn.begin()

        active_session = None

        def db():
            return active_session

        for dependency in (get_db, recovery.get_db, wellbeing.get_db):
            app.dependency_overrides[dependency] = db
        try:
            with Session(bind=conn, join_transaction_mode="create_savepoint") as session:
                keys = {"content.create", "content.edit", "content.view", "safety.edit", "safety.view",
                        "nutrition.create", "nutrition.edit", "nutrition.view"}
                permissions = session.scalars(select(AdminPermission).where(AdminPermission.key.in_(keys))).all()
                editor = AdminUser(email="a6-editor.e2e@example.com", name="Synthetic A6 editor",
                                   password_hash="Synthetic token-only account", active=True,
                                   roles=[AdminRole(name="synthetic_a6_editor", permissions=permissions)])
                session.add(editor)
                session.flush()
                eid = editor.id
                reviewer = session.scalar(select(AdminUser).where(AdminUser.email == ADMIN_EMAIL))
                reviewer.name = "Synthetic A6 clinical reviewer"
                rid = reviewer.id
                mid = session.scalar(select(User.id).where(User.email == MOTHER_EMAIL))
                profile = session.scalar(select(MotherProfile).where(MotherProfile.user_id == mid))
                profile.language = "en"
                profile.baby_birth_date = date.today() - timedelta(weeks=12)
                profile.delivery_type = "vaginal"
                profile.onboarding_done = True
                food = session.scalar(select(Food.id))
                session.commit()
            headers = {
                "editor": {"Authorization": "Bearer " + create_admin_access_token(eid)},
                "reviewer": {"Authorization": "Bearer " + create_admin_access_token(rid)},
                "mother": {"Authorization": "Bearer " + create_access_token(mid, "MOTHER")},
            }
            c = TestClient(app)

            def call(method, path, expected=200, role="editor", **kw):
                nonlocal active_session
                with Session(bind=conn, join_transaction_mode="create_savepoint") as active_session:
                    r = c.request(method, path, headers=headers[role], **kw)
                assert r.status_code == expected, (path, r.status_code, r.text[:350])
                return r.json()

            def admin(method, path, expected=200, role="editor", **kw):
                return call(method, "/api/admin/" + path, expected, role, **kw)

            def review_id(entity, entity_id):
                rows = admin("GET", "reviews", params={"entity": entity, "status": "pending"})["items"]
                return next(r["id"] for r in rows if r["entity_id"] == entity_id)

            def decision(id, action, expected=200, role="reviewer", **kw):
                return admin("POST", f"reviews/{id}/{action}", expected, role, **kw)

            fields = {"title_en": "Synthetic A6 article", "title_ta": "சோதனை", "body_en": "Synthetic A6 content",
                      "body_ta": "சோதனை பதிவு", "category": "recovery"}
            created = admin("POST", "articles", 201, json=fields)
            aid = created["id"]
            article = f"articles/{aid}"
            mother_path = f"/articles/{aid}"
            call("GET", mother_path, 404, "mother")
            admin("POST", article + "/submit")
            first = review_id("articles", aid)
            decision(first, "approve", 403, "editor")
            decision(first, "publish", 403, "editor")
            decision(first, "publish", 409)
            decision(first, "request-changes", 422, json={"comment": "  "})
            decision(first, "request-changes", json={"comment": "Synthetic revision request"})
            decision(first, "approve", 409)
            call("GET", mother_path, 404, "mother")
            revised = {**fields, "body_ta": "திருத்தப்பட்ட சோதனை பதிவு"}
            admin("PUT", article, json=revised)
            admin("POST", article + "/submit")
            second = review_id("articles", aid)
            approval = decision(second, "approve")
            assert 365 <= (date.fromisoformat(approval["next_review_due"]) - now().date()).days <= 366
            call("GET", mother_path, 404, "mother")
            admin("POST", f"reviews/resource/articles/{aid}/revise")
            admin("PUT", article, json={**revised, "body_en": "Updated synthetic content"})
            decision(second, "publish", 409)
            admin("POST", article + "/submit")
            third = review_id("articles", aid)
            detail = admin("GET", f"reviews/{third}")
            assert detail["current"]["body_ta"] == revised["body_ta"]
            assert [i["decision"] for i in detail["history"]] == ["pending","approved","changes_requested"]
            decision(third, "approve")
            decision(third, "publish")
            decision(third, "publish", 409)
            assert call("GET", mother_path, role="mother")["body_en"] == "Updated synthetic content"
            assert conn.exec_driver_sql("SELECT COUNT(*) FROM article_chunks WHERE article_id=%s",(aid,)).scalar_one()>=2
            conn.exec_driver_sql("UPDATE clinical_publications SET next_review_due=%s WHERE review_id=%s",
                                 (now().date()-timedelta(days=1),third))
            assert any(r["review_id"]==third and r["overdue"] for r in admin("GET","reviews/due"))
            admin("POST",f"reviews/resource/articles/{aid}/re-review")
            fourth=review_id("articles",aid)
            assert admin("GET",f"reviews/{fourth}")["previous"]["body_ta"]==revised["body_ta"]
            assert call("GET",mother_path,role="mother")["body_en"]=="Updated synthetic content"
            print("PASS article end-to-end, unauthorized actions, immutable decisions, invalidation, bilingual snapshot and overdue re-review")

            cases = [
                ("exercises", "recovery_exercises", {"name":"Synthetic A6 exercise","name_ta":"சோதனை","category":"breathing",
                 "steps":["Synthetic"],"steps_ta":["சோதனை"],"duration_minutes":3,"allowed_delivery_types":["vaginal"],
                 "safety_notes":"Synthetic","safety_notes_ta":"சோதனை","contraindications":"Synthetic","contraindications_ta":"சோதனை"}),
                ("wellbeing-activities","wellbeing_activities",{"title":"Synthetic A6 activity","title_ta":"சோதனை","activity_type":"breathing",
                 "duration_minutes":3,"steps":["Synthetic"],"steps_ta":["சோதனை"]}),
                ("meal-ideas","meal_ideas",{"title":"Synthetic A6 meal","title_ta":"சோதனை","category":"lunch",
                 "description":"Synthetic description", "description_ta":"\u0b9a\u0bcb\u0ba4\u0ba9\u0bc8",
                 "ingredients":[{"food_id":food,"grams":30}]}),
            ]
            mother_paths = {
                "exercises": "/recovery/exercises/for-me",
                "wellbeing-activities": "/wellbeing/activities",
                "meal-ideas": "/nutrition/ideas",
            }
            published_ids = {}
            for route,entity,data in cases:
                row=admin("POST",route,201,json=data)
                published_ids[route] = row["id"]
                assert all(item["id"] != row["id"] for item in call("GET", mother_paths[route], role="mother"))
                admin("POST",f"{route}/{row['id']}/submit")
                assert all(item["id"] != row["id"] for item in call("GET", mother_paths[route], role="mother"))
                pending=review_id(entity,row["id"])
                decision(pending,"approve")
                decision(pending,"publish")
                assert admin("GET",f"{route}/{row['id']}")["status"]=="published"
            exercises = call("GET", "/recovery/exercises/for-me", role="mother")
            assert any(m["name"] == "Synthetic A6 exercise" for m in exercises), (
                [m["name"] for m in exercises],
                conn.exec_driver_sql("SELECT name, editorial_status FROM recovery_exercises WHERE name LIKE %s", ("Synthetic%",)).all(),
            )
            assert any(m["title"] == "Synthetic A6 activity" for m in call("GET", "/wellbeing/activities", role="mother"))
            assert any(m["title"]=="Synthetic A6 meal" for m in call("GET","/nutrition/ideas",role="mother"))
            with Session(bind=conn, join_transaction_mode="create_savepoint") as session:
                profile = session.scalar(select(MotherProfile).where(MotherProfile.user_id == mid))
                profile.language = "ta"
                session.commit()
            for route, _, data in cases:
                item = next(item for item in call("GET", mother_paths[route], role="mother")
                            if item["id"] == published_ids[route])
                field = "name" if route == "exercises" else "title"
                assert item[field] == data[field + "_ta"], (route, item)
                if route == "exercises":
                    assert item["safety_notes"] == data["safety_notes_ta"]
                    assert item["contraindications"] == data["contraindications_ta"]
                    assert item["locked"] and item["steps"] == []
                if route == "wellbeing-activities":
                    assert item["steps"] == data["steps_ta"]
                    english = call("GET", mother_paths[route], role="mother", params={"language": "en"})
                    assert any(row["id"] == item["id"] and row["steps"] == data["steps"] for row in english)
                if route == "meal-ideas":
                    assert item["description"] == data["description_ta"]
            with Session(bind=conn, join_transaction_mode="create_savepoint") as session:
                session.connection().exec_driver_sql(
                    "UPDATE meal_ideas SET description_ta=NULL WHERE id=%s", (published_ids["meal-ideas"],))
                profile = session.scalar(select(MotherProfile).where(MotherProfile.user_id == mid))
                profile.exercise_cleared = "yes"
                moment = free_quota.utc_now()
                if not entitlements.guided_access(session, mid, moment):
                    entitlements.insert_period(session, mid, "trial", "a6-localization-trial",
                                               entitlements.utc_naive(moment))
                session.commit()
            meals = call("GET", mother_paths["meal-ideas"], role="mother")
            assert next(row for row in meals if row["id"] == published_ids["meal-ideas"])["description"] == cases[2][2]["description"]
            exercises = call("GET", mother_paths["exercises"], role="mother")
            exercise = next(row for row in exercises if row["id"] == published_ids["exercises"])
            assert not exercise["locked"] and exercise["steps"] == cases[0][2]["steps_ta"], exercise["lock_reason"]
            session_api = "/recovery/exercise-sessions"
            exercise_id = published_ids["exercises"]
            call("POST", session_api, 422, role="mother", json={"exercise_id": exercise_id, "feeling": "invalid"})
            call("POST", session_api, 404, role="mother", json={"exercise_id": 2147483647, "feeling": "ok"})
            saved = call("POST", session_api, role="mother",
                         json={"exercise_id": exercise_id, "feeling": "hard", "pain": True})
            assert saved["paused_symptoms"] and saved["session"]["exercise_id"] == exercise_id
            visible = call("GET", mother_paths["exercises"], role="mother")
            assert all(item["locked"] and item["paused_symptoms"] and not item["steps"] for item in visible)
            assert call("GET", "/recovery/exercises/today", role="mother") == []
            call("POST", session_api, 409, role="mother", json={"exercise_id": exercise_id, "feeling": "ok"})
            with Session(bind=conn, join_transaction_mode="create_savepoint") as session:
                session.connection().exec_driver_sql(
                    "UPDATE exercise_sessions SET completed_at=%s WHERE id=%s",
                    (now() - timedelta(days=4), saved["session"]["id"]),
                )
                session.commit()
            assert any(item["id"] == exercise_id for item in call("GET", "/recovery/exercises/today", role="mother"))
            print("PASS published Tamil exercise, session validation, pause and resumption")
            published = None
            for text in ("Synthetic safety version one", "Synthetic safety version two"):
                safety=admin("POST","safety/messages",201,json={"message_key":"no_info","body_en":text,"body_ta":"சோதனை"})
                sid=review_id("safety_messages",safety["id"])
                decision(sid,"approve",403,"editor")
                if published:
                    assert admin("GET",f"reviews/{sid}")["previous"]["body_en"]==published
                    assert call("GET","/safety/messages",role="mother")[0]["body_en"]==published
                decision(sid,"approve")
                decision(sid,"publish")
                published=text
            assert call("GET","/safety/messages",role="mother")[0]["body_en"]==published
            target=admin("POST","nutrition-targets",201,json={"feeding_group":"not_breastfeeding","nutrient":"calories",
                         "unit":"kcal","value":1450,"source_note":"Synthetic E2E value only"})
            tid=target["id"]
            admin("POST",f"nutrition-targets/{tid}/submit")
            pending=review_id("nutrition_target_values",tid)
            admin("POST",f"nutrition-targets/{tid}/approve",409,"reviewer")
            decision(pending,"approve")
            lookup="SELECT calories FROM nutrition_targets WHERE feeding_method='formula'"
            assert conn.exec_driver_sql(lookup).scalar_one_or_none()!=1450
            decision(pending,"publish")
            assert conn.exec_driver_sql(lookup).scalar_one()==1450
            with Session(bind=conn) as session:
                actions=set(session.scalars(select(AuditLog.action)))
                assert {"clinical_review.approved","clinical_review.changes_requested","clinical_review.published"}<=actions
            print("PASS Exercises, Wellbeing, Meal Ideas, safety version replacement, nutrition explicit publication and audits")
        finally:
            transaction.rollback()
            app.dependency_overrides.clear()


if __name__ == "__main__":
    run()
