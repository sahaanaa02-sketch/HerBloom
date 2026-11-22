"""Mother nutrition and report contracts against the guarded E2E database."""
from datetime import timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import engine, get_db
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.nutrition import Food, FoodLog, MealPlanItem
from app.services.recovery_rules import local_today


def test_mother_nutrition_and_summary(monkeypatch):
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    from app.routers import recovery

    with engine.connect() as connection:
        transaction = connection.begin()
        session = None
        dependencies = (get_db, recovery.get_db)
        for dependency in dependencies:
            app.dependency_overrides[dependency] = lambda: session
        client = TestClient(app)

        def call(method, path, expected, token=None, **kwargs):
            nonlocal session
            headers = {"Authorization": "Bearer " + token} if token else {}
            with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
                response = client.request(method, path, headers=headers, **kwargs)
            print(method, path, "expected", expected, "actual", response.status_code)
            assert response.status_code == expected, (method, path, response.status_code)
            return response.json()

        def register():
            return call("POST", "/auth/register", 201, json={
                "name": "Synthetic Mother",
                "email": f"mother-{uuid4().hex}@example.com",
                "password": "Isolated fixture only!45",
            })["access_token"]

        try:
            owner, other = register(), register()
            call("GET", "/profile", 200, owner)
            with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
                for category in ("breakfast", "fruit", "snack", "lunch", "dinner"):
                    for index in range(5):
                        db.add(Food(name_en=f"E2E audit {category} {index}", category=category,
                                    calories=100, protein=10, iron=2, calcium=3, verified=True))
                db.commit()

            generate = "/nutrition/meal-plan/generate"
            call("POST", generate, 401)
            plan = call("POST", generate, 200, owner)
            assert len(plan["items"]) == 35
            first = plan["items"][0]
            first_path = f"/nutrition/meal-plan/items/{first['id']}"
            call("PATCH", first_path, 422, owner, json={"eaten": None})
            call("PATCH", first_path, 404, other, json={"eaten": True})
            call("POST", first_path + "/swap", 404, other)
            call("PATCH", first_path, 200, owner, json={"eaten": True})
            call("PATCH", first_path, 200, owner, json={"eaten": True})
            with Session(bind=connection) as db:
                log_id = db.get(MealPlanItem, first["id"]).food_log_id
                log = db.get(FoodLog, log_id)
                assert log.food_id == first["food_id"]
                logged_ids = db.scalars(select(FoodLog.id).where(FoodLog.user_id == log.user_id)).all()
                assert logged_ids == [log_id]
            call("POST", first_path + "/swap", 409, owner)
            updated = call("POST", generate, 200, owner)
            assert updated["id"] == plan["id"] and len(updated["items"]) == 35
            assert updated["items"][0] == {**first, "eaten": True}
            assert any(before["food_id"] != after["food_id"]
                       for before, after in zip(plan["items"][1:], updated["items"][1:]))
            second = updated["items"][1]
            call("POST", f"/nutrition/meal-plan/items/{second['id']}/swap", 200, owner)
            latest = call("GET", "/nutrition/meal-plan", 200, owner)
            assert latest["items"][1]["food_id"] != second["food_id"]
            call("GET", f"/nutrition/meal-plan/history/{plan['id']}", 404, other)
            call("GET", f"/nutrition/meal-plan/history/{plan['id']}", 200, owner)
            call("GET", "/nutrition/meal-plan/history", 200, owner)
            call("PATCH", first_path, 200, owner, json={"eaten": False})
            with Session(bind=connection) as db:
                assert db.get(FoodLog, log_id) is None
                assert db.get(MealPlanItem, first["id"]).food_log_id is None

            hb_path = "/nutrition/anaemia/hb"
            call("POST", hb_path, 401, json={"value": 12})
            call("POST", hb_path, 422, owner, json={"value": 0})
            hb = call("POST", hb_path, 201, owner, json={"value": 12.5})
            records = call("GET", "/nutrition/anaemia", 200, owner)["hb_records"]
            assert records[0]["id"] == hb["id"] and records[0]["value"] == 12.5
            assert call("GET", "/nutrition/anaemia", 200, other)["hb_records"] == []
            call("DELETE", f"{hb_path}/{hb['id']}", 404, other)
            call("DELETE", f"{hb_path}/{hb['id']}", 200, owner)

            today = local_today()
            monday = today - timedelta(days=today.weekday())
            call("POST", "/recovery/walks", 200, owner, json={"date": today.isoformat(), "minutes": 10})
            call("POST", "/recovery/walks", 200, owner, json={"date": today.isoformat(), "minutes": 15})
            call("PUT", "/dashboard/hydration", 200, owner, json={"glasses": 4})
            call("POST", "/recovery/walks", 200, other, json={"date": today.isoformat(), "minutes": 90})
            endpoint = "/reports/weekly"
            call("GET", endpoint, 401)
            call("GET", endpoint, 422, owner, params={"week_start": "invalid"})
            report = call("GET", endpoint, 200, owner, params={"week_start": monday.isoformat()})["data"]
            from app.routers import reports
            from app.services import ai_gateway

            def unexpected_provider(*args, **kwargs):
                raise AssertionError("Legacy report must never invoke Gemini")

            with monkeypatch.context() as mock:
                mock.setattr(reports.entitlements, "ready", lambda db: False)
                mock.setattr(ai_gateway, "generate_weekly_summary", unexpected_provider)
                # Keep catching a regression that reimports the function by name.
                if hasattr(reports, "generate_weekly_summary"):
                    mock.setattr(reports, "generate_weekly_summary", unexpected_provider)
                local_report = call("GET", endpoint, 200, owner, params={"week_start": monday.isoformat()})
                assert local_report["ai_summary"]["status"] == "unavailable"
                assert local_report["data"] == report

            assert report["walking"]["total_minutes"] == 25
            assert report["walking"]["days_walked"] == 1
            assert report["hydration"]["average_glasses"] == 4
            assert report["nutrition"]["planned_meals"] == 35
            assert report["nutrition"]["planned_meals_eaten"] == 0
        finally:
            for dependency in dependencies:
                app.dependency_overrides.pop(dependency, None)
            transaction.rollback()
