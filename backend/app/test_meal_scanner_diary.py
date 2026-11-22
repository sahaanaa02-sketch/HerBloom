from io import BytesIO
from unittest.mock import AsyncMock
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.config import E2E_MODE
from app.database import engine, get_db
from app.e2e_guard import authorize_e2e_launcher, preflight
from app.models.nutrition import Food, FoodLog, FoodLogSave
from app.models.user import User
from app.routers.nutrition import create_meal, search_foods
from app.schemas.nutrition import FoodLogCreate


def test_meal_save_receipt_survives_lost_response_and_deletion():
    engine = create_engine("sqlite://")
    for model in (User, Food, FoodLog, FoodLogSave):
        model.__table__.create(engine)

    owner, other = SimpleNamespace(id=1), SimpleNamespace(id=2)
    key = uuid4()
    payload = FoodLogCreate(food_id=1, grams=150, meal_type="lunch")
    with Session(engine) as db:
        db.add(Food(id=1, name_en="Synthetic meal"))
        db.commit()
        original = create_meal(payload, key, db, owner)

    # Simulate a response lost after the commit, followed by a new request.
    with Session(engine) as db:
        assert create_meal(payload, key, db, owner) == original
        assert db.scalar(select(func.count()).select_from(FoodLog)) == 1
        with pytest.raises(HTTPException) as conflict:
            create_meal(payload.model_copy(update={"grams": 200}), key, db, owner)
        assert conflict.value.status_code == 409
        assert create_meal(payload, key, db, other)["id"] != original["id"]
        assert create_meal(payload, uuid4(), db, owner)["id"] != original["id"]
        db.delete(db.get(FoodLog, original["id"]))
        db.commit()
        assert create_meal(payload, key, db, owner) == original
        assert db.scalar(select(func.count()).select_from(FoodLog)) == 2


def test_scanner_catalog_returns_only_available_verified_nutrients():
    engine = create_engine("sqlite://")
    Food.__table__.create(engine)

    with Session(engine) as db:
        db.add_all([
            Food(name_en="Verified", verified=True, calories=120, protein=4,
                 carbs_g=12, fat_g=0, fibre_g=None, iron=0, missing_nutrients=["iron"]),
            Food(name_en="Unverified", verified=False, calories=120, carbs_g=12),
        ])
        db.commit()
        foods = {row["name_en"]: row for row in search_foods("", db, None)}

    verified = foods["Verified"]
    assert (verified["calories"], verified["protein"], verified["carbs_g"], verified["fat_g"]) == (120, 4, 12, 0)
    assert verified["fibre_g"] is verified["iron"] is None
    assert foods["Unverified"]["calories"] is foods["Unverified"]["carbs_g"] is None



@pytest.mark.skipif(not E2E_MODE, reason="requires guarded MySQL E2E")
def test_authenticated_scanner_workflow(monkeypatch):
    authorize_e2e_launcher()
    preflight()
    from app.main import app
    from app.routers import nutrition

    image = BytesIO()
    Image.new("RGB", (4, 4), "orange").save(image, "PNG")
    provider = AsyncMock(return_value={
        "items": [{"name": "Synthetic scanner meal", "estimated_grams": 100, "confidence": "high"}],
    })
    monkeypatch.setattr(nutrition, "scan_food", provider)

    with engine.connect() as connection:
        transaction = connection.begin()
        session = None
        monkeypatch.setitem(app.dependency_overrides, get_db, lambda: session)
        client = TestClient(app)

        def call(method, path, status, token=None, key=None, **kwargs):
            nonlocal session
            headers = {"Authorization": "Bearer " + token} if token else {}
            if key is not None:
                headers["Idempotency-Key"] = str(key)
            with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
                response = client.request(method, path, headers=headers, **kwargs)
            assert response.status_code == status, (path, response.status_code)
            return response.json()

        def register():
            return call("POST", "/auth/register", 201, json={
                "name": "Synthetic Scanner Mother",
                "email": f"scanner-{uuid4().hex}@example.com",
                "password": "Synthetic fixture only!45",
            })["access_token"]

        try:
            owner, other = register(), register()
            with Session(bind=connection, join_transaction_mode="create_savepoint") as db:
                food = Food(name_en="Synthetic scanner meal", verified=True,
                            calories=120, protein=5, iron=2, carbs_g=22, fat_g=2, fibre_g=3)
                db.add(food)
                db.flush()
                food_id = food.id
                db.commit()

            scan_key = uuid4()
            files = {"file": ("synthetic.png", image.getvalue(), "image/png")}
            call("POST", "/nutrition/scan", 422, owner, scan_key, files=files)
            call("POST", "/nutrition/scan", 422, owner, scan_key, data={"consent": "false"}, files=files)
            call("POST", "/nutrition/scan", 401, key=scan_key, data={"consent": "true"}, files=files)
            call("POST", "/nutrition/scan", 415, owner, scan_key, data={"consent": "true"},
                 files={"file": ("synthetic.gif", b"GIF", "image/gif")})
            call("POST", "/nutrition/scan", 413, owner, scan_key, data={"consent": "true"},
                 files={"file": ("large.png", b"x" * (5 * 1024 * 1024 + 1), "image/png")})
            provider.assert_not_awaited()
            scan = call("POST", "/nutrition/scan", 200, owner, scan_key, data={"consent": "true"}, files=files)
            assert scan["recognized"] is True
            assert scan["items"][0]["estimated_grams"] == 100
            call("POST", "/nutrition/scan", 409, owner, scan_key, data={"consent": "true"}, files=files)
            assert provider.await_count == 1
            retry_key = uuid4()
            provider.side_effect = HTTPException(502, "Synthetic provider failure")
            call("POST", "/nutrition/scan", 502, owner, retry_key, data={"consent": "true"}, files=files)
            provider.side_effect = None
            provider.return_value = {"items": []}
            empty = call("POST", "/nutrition/scan", 200, owner, retry_key, data={"consent": "true"}, files=files)
            assert empty["recognized"] is False and empty["items"] == []
            call("POST", "/nutrition/scan", 200, owner, uuid4(), data={"consent": "true"}, files=files)
            call("POST", "/nutrition/scan", 429, owner, uuid4(), data={"consent": "true"}, files=files)
            assert provider.await_count == 4
            meals, logs = "/nutrition/meals", "/nutrition/logs"
            payload = {"food_id": food_id, "grams": 125, "meal_type": "lunch"}
            key = uuid4()
            call("POST", meals, 401, key=key, json=payload)
            call("POST", meals, 422, owner, key, json={**payload, "grams": 0})
            saved = call("POST", meals, 201, owner, key, json=payload)
            assert call("POST", meals, 201, owner, key, json=payload) == saved
            call("POST", meals, 409, owner, key, json={**payload, "grams": 150})
            assert call("GET", logs, 200, other)["meals"] == []
            records = call("GET", logs, 200, owner)["meals"]
            assert len(records) == 1 and records[0]["id"] == saved["id"] and records[0]["grams"] == 125
            assert call("POST", meals, 201, other, key, json=payload)["id"] != saved["id"]
            assert call("POST", meals, 201, owner, uuid4(), json=payload)["id"] != saved["id"]
        finally:
            transaction.rollback()


def test_live_gemini_key_requires_scanner_opt_in_and_isolated_request(monkeypatch):
    from pydantic import SecretStr
    from app import config, e2e_guard
    from app.services import food_scanner

    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-inherited-key")
    monkeypatch.setattr(config, "E2E_MODE", True)
    monkeypatch.setattr(food_scanner, "E2E_MODE", True)
    settings = SimpleNamespace(
        E2E_LIVE_MEAL_SCANNER_ENABLED=False,
        E2E_MEAL_SCANNER_GEMINI_API_KEY=SecretStr("synthetic-scanner-key"),
    )
    monkeypatch.setattr(food_scanner, "settings", settings)

    assert food_scanner.scanner_api_key(None, None) is None
    settings.E2E_LIVE_MEAL_SCANNER_ENABLED = True
    assert config.external_setting("GEMINI_API_KEY") is None
    with pytest.raises(HTTPException) as denied:
        food_scanner.scanner_api_key(None, None)
    assert denied.value.status_code == 503

    db = SimpleNamespace(connection=lambda: object())
    monkeypatch.setattr(e2e_guard, "require_e2e_launcher", lambda: None)

    def reject_connection(connection):
        raise RuntimeError("Unexpected database")

    monkeypatch.setattr(e2e_guard, "verify_database_identity", reject_connection)
    with pytest.raises(HTTPException) as denied:
        food_scanner.scanner_api_key(db, 42)
    assert denied.value.status_code == 503

    monkeypatch.setattr(e2e_guard, "verify_database_identity", lambda connection: None)
    assert food_scanner.scanner_api_key(db, 42) == "synthetic-scanner-key"



@pytest.mark.parametrize("answer, expected", [
    ('{"items":[{"name":"dhal","estimated_grams":100,"confidence":"high"}]}', 1),
    ('{"items":[]}', 0),
    ('not valid JSON', None),
])
def test_gemini_scan_excludes_thought_parts(monkeypatch, answer, expected):
    import asyncio
    import json
    import httpx
    from app.services import food_scanner

    def response(request):
        payload = json.loads(request.content)
        assert payload["generationConfig"]["responseJsonSchema"]["required"] == ["items"]
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [
            {"thought": True, "text": "Internal reasoning"},
            {"text": answer},
        ]}}]})

    client = httpx.AsyncClient(transport=httpx.MockTransport(response))
    monkeypatch.setattr(food_scanner.httpx, "AsyncClient", lambda **kwargs: client)
    monkeypatch.setattr(food_scanner, "scanner_api_key", lambda *_: "synthetic-test-key")
    runtime = SimpleNamespace(model_name="synthetic", temperature=0, max_output_tokens=None, prompt="")
    monkeypatch.setattr(food_scanner.monitor, "provider_runtime", lambda *args, **kwargs: runtime)
    monkeypatch.setattr(food_scanner.monitor, "Attempt", lambda _: SimpleNamespace(
        capture=lambda _: None, finish=lambda _: None,
    ))
    if expected is None:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(food_scanner.scan_food(b"synthetic", "image/png"))
        assert exc.value.status_code == 502
    else:
        result = asyncio.run(food_scanner.scan_food(b"synthetic", "image/png"))
        assert len(result["items"]) == expected
