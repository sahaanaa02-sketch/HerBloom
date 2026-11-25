"""Authenticated Trial, Premium and Free entitlement integration tests."""
from datetime import UTC, datetime, timedelta
from io import BytesIO
from unittest.mock import patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_fixtures import ADMIN_EMAIL, MOTHER_EMAIL
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.admin import AdminUser
from app.models.user import User
from app.services.admin_security import create_admin_access_token
from app.services import entitlements, free_quota, weekly_insights
from app.services.ai_monitor import AIUnavailable
from app.services.auth_service import create_access_token
from app.services.recovery_rules import local_today


def run():
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    from app.routers import recovery

    with engine.connect() as conn:
        transaction = conn.begin()
        active = None

        def isolated():
            return Session(bind=conn, join_transaction_mode="create_savepoint")

        def db():
            return active

        app.dependency_overrides.update({get_db: db, recovery.get_db: db})
        try:
            mother = conn.execute(select(User.id).where(User.email == MOTHER_EMAIL)).scalar_one()
            admin = conn.execute(select(AdminUser.id).where(AdminUser.email == ADMIN_EMAIL)).scalar_one()
            other = conn.exec_driver_sql(
                "INSERT INTO users (username,full_name,email,hashed_password,role,is_active,activated_at_utc) "
                "VALUES ('a12_entitlement_other','Synthetic other','a12-entitlement-other@example.com','synthetic','MOTHER',1,%s)",
                (entitlements.utc_naive(free_quota.utc_now()),),
            ).lastrowid
            tokens = {"mother": create_access_token(mother, "MOTHER"), "admin": create_admin_access_token(admin),
                      "other":create_access_token(other, "MOTHER")}
            client = TestClient(app)

            def call(method,path,status=200,actor="mother",key=None,**kwargs):
                nonlocal active
                auth = {"Authorization":"Bearer "+tokens[actor]} if actor else {}
                if key:
                    auth["Idempotency-Key"] = str(key)
                with isolated() as active:
                    response=client.request(method,path,headers=auth,**kwargs)
                assert response.status_code==status,(method,path,response.status_code,response.text[:300])
                return response.json()

            def purchase(ref, uid=mother):
                with isolated() as session:
                    id=entitlements.apply_verified_purchase(session,uid,ref)
                    session.commit()
                    return id

            def balance():
                return call("GET","/api/features/entitlements")

            image=BytesIO()
            Image.new("RGB",(1,1)).save(image,"PNG")
            def scan(status=200,key=None):
                return call("POST","/nutrition/scan",status,key=key or uuid4(),
                            data={"consent":"true"}, files={"file":("test.png",image.getvalue(),"image/png")})

            def chat(status=200,key=None):
                return call("POST","/chat/message",status,key=key or uuid4(),
                            json={"text":"Synthetic plain question","lang":"en"})

            start=free_quota.utc_now() + timedelta(seconds=1)
            day=timedelta(days=1)
            stamp=lambda value: datetime.fromisoformat(value).astimezone(UTC)
            with patch.object(free_quota,"utc_now",return_value=start) as clock, \
                 patch("app.routers.nutrition.scan_food",return_value={"items":[]}) as scanner, \
                 patch("app.routers.chat.search_articles",return_value=[{"article_id":1,"title":"Synthetic reviewed","content":"Synthetic answer"}]), \
                 patch("app.routers.chat.generate_answer",return_value="Synthetic answer") as provider:
                call("GET","/api/plans",401,actor=None)
                assert {x["code"]:x["price_lkr"] for x in call("GET","/api/plans")["plans"]} == {"free":0,"trial":0,"premium":790}
                original_anchor=conn.exec_driver_sql("SELECT activated_at_utc FROM users WHERE id=%s",(mother,)).scalar_one()
                original_reset=balance()["quota_resets_at"]
                assert scan()["recognized"] is False
                call("POST","/api/billing/trial/start",422,json={"confirm":False})
                assert balance()["remaining"]=={"scan":2,"chat":10}
                exercise=call("POST","/api/admin/exercises",201,"admin",json={
                    "name":"Synthetic A12 guided","name_ta":"Synthetic",
                    "category":"breathing","steps":["Synthetic"],"steps_ta":["Synthetic"],"duration_minutes":3,
                    "allowed_delivery_types":["vaginal"],"safety_notes":"Synthetic safety","safety_notes_ta":"Synthetic",
                    "contraindications":"Synthetic","contraindications_ta":"Synthetic",
                })
                exercise_id=exercise["id"]
                call("POST",f"/recovery/exercise-sessions",404,json={"exercise_id":exercise_id,"feeling":"ok"})
                call("POST",f"/api/admin/exercises/{exercise_id}/submit",actor="admin")
                queue=call("GET","/api/admin/reviews?entity=recovery_exercises&status=pending",actor="admin")
                review=next(row["id"] for row in queue["items"] if row["entity_id"]==exercise_id)
                call("POST",f"/api/admin/reviews/{review}/approve",actor="admin")
                call("POST",f"/api/admin/reviews/{review}/publish",actor="admin")

                def guided():
                    return next(row for row in call("GET","/recovery/exercises/for-me") if row["id"]==exercise_id)

                assert guided()["locked"] and guided()["steps"]==[] and guided()["safety_notes"]=="Synthetic safety"
                call("POST","/recovery/exercise-sessions",409,json={"exercise_id":exercise_id,"feeling":"ok"})
                trial=call("POST","/api/billing/trial/start",201,json={"confirm":True})
                assert trial["plan"]=="trial" and stamp(trial["expires_at"])==start+7*day
                assert trial["remaining"]=={"scan":7,"chat":25} and not trial["trial_eligible"]
                call("POST","/api/billing/trial/start",409,json={"confirm":True})
                assert not guided()["locked"] and guided()["steps"]==["Synthetic"]
                with patch("app.routers.recovery.entitlements.ready", return_value=False), \
                     patch("app.routers.recovery.entitlements.guided_access") as resolve_access:
                    locked = guided()
                    assert locked["locked"] and locked["steps"] == []
                    assert all(locked[field] is None for field in ("equipment", "image_url", "video_url"))
                    assert locked["safety_notes"] == "Synthetic safety"
                    assert locked["contraindications"] == "Synthetic"
                    assert call("GET", "/recovery/exercises/today") == []
                    call("POST", "/recovery/exercise-sessions", 409,
                         json={"exercise_id": exercise_id, "feeling": "ok"})
                    resolve_access.assert_not_called()
                conn.exec_driver_sql("UPDATE mother_profiles SET delivery_type='csection' WHERE user_id=%s",(mother,))
                assert guided()["locked"] and guided()["steps"]==[]
                conn.exec_driver_sql("UPDATE mother_profiles SET delivery_type='vaginal' WHERE user_id=%s",(mother,))
                assert all(row["locked"] for row in call("GET","/recovery/exercises/for-me") if row["review_date"] is not None and row["id"]!=exercise_id)

                order=purchase("synthetic-first")
                assert order==purchase("synthetic-first")
                try:
                    purchase("synthetic-first",other)
                except HTTPException as error:
                    assert error.status_code==409
                else:
                    raise AssertionError("Cross-account payment replay granted access")
                assert balance()["plan"]=="trial"

                key=uuid4()
                scanner.side_effect=HTTPException(502,"Synthetic scanner failure")
                scan(502,key)
                scanner.side_effect=None
                scan(key=key)
                scan(409,key)
                provider.side_effect=AIUnavailable("Synthetic chat failure")
                assert chat()["type"]=="error"
                provider.side_effect=None
                for _ in range(6):
                    scan()
                for _ in range(25):
                    chat()
                scan(429)
                chat(429)
                with patch("app.routers.chat.check_text",return_value={"type":"urgent","text":"Synthetic safety"}):
                    assert chat()["type"]=="urgent"
                clock.return_value=start+3*day
                assert balance()["remaining"]=={"scan":0,"chat":0}

                insight_path="/insights/weekly"
                conn.exec_driver_sql("UPDATE mother_profiles SET consent_ai_profile=0 WHERE user_id=%s",(mother,))
                assert call("GET",insight_path)["eligibility"]=="consent_required"
                conn.exec_driver_sql("UPDATE mother_profiles SET consent_ai_profile=1 WHERE user_id=%s",(mother,))
                assert call("GET",insight_path)["eligibility"]=="policy_pending"
                with patch.object(weekly_insights,"minimum_days",return_value=1), \
                     patch.object(weekly_insights,"generate_weekly_summary",return_value="Synthetic note") as generate:
                    assert call("GET",insight_path)["eligibility"]=="insufficient_data"
                    first=(start.astimezone(free_quota.DISPLAY_TIMEZONE)+day).date()
                    conn.exec_driver_sql(
                        "INSERT INTO walk_logs (user_id,date,minutes,note) VALUES (%s,%s,10,'private synthetic note')",
                        (mother,first),
                    )
                    for moment in (start+3*day,start+10*day):
                        clock.return_value=moment
                        if moment>start+3*day:
                            with patch.object(weekly_insights,"aggregate",return_value={"completeness":{"days_with_data":1}}):
                                call("POST",insight_path+"/generate",201,json={})
                        else:
                            call("POST",insight_path+"/generate",201,json={})
                        call("POST",insight_path+"/generate",409,json={})
                    clock.return_value=start+17*day
                    with patch.object(weekly_insights,"aggregate",return_value={"completeness":{"days_with_data":1}}):
                        call("POST",insight_path+"/generate",201,json={})
                    call("POST",insight_path+"/generate",409,json={})
                    assert generate.call_count==3
                    assert "private synthetic note" not in str(generate.call_args_list)
                    assert call("GET",insight_path,actor="other")["items"]==[]
                clock.return_value=start+7*day
                assert balance()["plan"]=="premium" and balance()["remaining"]=={"scan":30,"chat":150}
                assert not guided()["locked"] and guided()["steps"] == ["Synthetic"]
                scan(409,key)
                scan()
                addon=purchase("synthetic-extension")
                assert addon!=order and addon==purchase("synthetic-extension")
                assert balance()["remaining"]=={"scan":29,"chat":150}
                assert stamp(balance()["quota_resets_at"])==start+37*day
                assert stamp(balance()["expires_at"])==start+67*day
                clock.return_value=start+35*day
                assert call("GET",insight_path)["eligibility"]=="plan_or_interval_unavailable"
                clock.return_value=start+37*day
                assert balance()["remaining"]=={"scan":30,"chat":150}
                clock.return_value=start+67*day
                assert balance()["plan"]=="free" and balance()["remaining"]=={"scan":3,"chat":10}
                assert not balance()["trial_eligible"] and not balance()["guided_exercises"]
                assert len(call("GET",insight_path)["items"])==3
                separate=call("POST","/api/billing/trial/start",201,actor="other",json={"confirm":True})
                clock.return_value=stamp(separate["expires_at"])
                expired=call("GET","/api/billing/me",actor="other")
                assert expired["plan"]=="free" and not expired["trial_eligible"]
                call("POST","/api/billing/trial/start",409,actor="other",json={"confirm":True})
                assert original_reset!=balance()["quota_resets_at"]
                assert conn.exec_driver_sql("SELECT activated_at_utc FROM users WHERE id=%s",(mother,)).scalar_one()==original_anchor
                assert guided()["locked"]
                assert call("GET","/reports/weekly")["ai_summary"]["status"] in {"use_insights","cached"}
            print("PASS authenticated entitlement windows, exact limits, grant replay, safety, clinical gating and insight isolation")
        finally:
            app.dependency_overrides.clear()
            transaction.rollback()


if __name__=="__main__":
    run()
