from contextlib import contextmanager
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.config import E2E_MODE


@pytest.mark.parametrize("available", [True, False])
def test_database_health_reports_availability(monkeypatch, caplog, available):
    if E2E_MODE:
        from app.e2e_guard import authorize_e2e_launcher

        authorize_e2e_launcher()

    from app import main

    connection = Mock()

    @contextmanager
    def connect():
        if not available:
            raise SQLAlchemyError("private connection details")
        yield connection

    monkeypatch.setattr(main, "engine", Mock(connect=connect))
    client = TestClient(main.app)
    response = client.get("/health/database")
    assert response.status_code == (200 if available else 503)
    assert response.json() == {
        "status": "connected" if available else "disconnected",
        "database": "MySQL",
    }
    assert client.get("/health").status_code == 200
    if available:
        assert str(connection.execute.call_args.args[0]) == "SELECT 1"
    else:
        assert "Database health check failed (SQLAlchemyError)." in caplog.text
        assert "private connection details" not in response.text + caplog.text
