"""HTTP 契約と CORS の振る舞い（実装詳細ではなく観察可能な結果）。"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.settings import Settings


@pytest.fixture
def client_no_cors() -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="development", cors_allow_origins=""),
        ),
    )


@pytest.fixture
def client_cors_localhost() -> TestClient:
    return TestClient(
        create_app(
            Settings(
                environment="development",
                cors_allow_origins="http://localhost:3000,http://127.0.0.1:3000",
            ),
        ),
    )


def test_get_root_returns_service_contract(client_no_cors: TestClient) -> None:
    response = client_no_cors.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "paper-assistant"
    assert data["phase"] == "BE-0"


def test_get_health_returns_stable_contract(client_no_cors: TestClient) -> None:
    response = client_no_cors.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "paper-assistant"


def test_cors_reflects_allowed_origin(client_cors_localhost: TestClient) -> None:
    response = client_cors_localhost.get(
        "/health",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_cors_omits_header_for_disallowed_origin(
    client_cors_localhost: TestClient,
) -> None:
    response = client_cors_localhost.get(
        "/health",
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") is None


def test_no_cors_middleware_when_origins_empty(client_no_cors: TestClient) -> None:
    response = client_no_cors.get(
        "/health",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") is None


def test_production_requires_non_empty_cors_allow_origins() -> None:
    with pytest.raises(ValidationError):
        Settings(environment="production", cors_allow_origins="")


def test_production_accepts_non_empty_cors_allow_origins() -> None:
    s = Settings(
        environment="production",
        cors_allow_origins="https://app.example.com",
        bedrock_model_id="anthropic.claude-3-5-haiku-20241022-v1:0",
        chat_mock_mode=False,
    )
    assert s.cors_origin_list() == ["https://app.example.com"]


def test_options_preflight_allowed_origin(client_cors_localhost: TestClient) -> None:
    response = client_cors_localhost.options(
        "/health",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"


def test_options_preflight_post_chat_allowed(client_cors_localhost: TestClient) -> None:
    response = client_cors_localhost.options(
        "/v1/chat",
        headers={
            "Origin": "http://127.0.0.1:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://127.0.0.1:3000"
