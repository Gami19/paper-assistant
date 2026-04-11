"""ルート GET / の HTTP 契約（振る舞いベース）。"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_root_returns_service_contract() -> None:
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "paper-assistant"
    assert data["phase"] == "BE-0"
