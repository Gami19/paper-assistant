"""POST /v1/chat の契約とモック経路。"""

from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.settings import Settings


@pytest.fixture
def client_chat_mock() -> TestClient:
    return TestClient(
        create_app(
            Settings(
                environment="development",
                cors_allow_origins="",
                chat_mock_mode=True,
            ),
        ),
    )


def test_post_chat_mock_returns_assistant_content(
    client_chat_mock: TestClient,
) -> None:
    response = client_chat_mock.post(
        "/v1/chat",
        json={
            "messages": [
                {"role": "user", "content": "hello"},
            ],
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == "assistant"
    assert "[mock]" in data["content"]
    assert "hello" in data["content"]


def test_post_chat_validation_empty_messages(client_chat_mock: TestClient) -> None:
    response = client_chat_mock.post("/v1/chat", json={"messages": []})
    assert response.status_code == 422


def test_post_chat_validation_invalid_role(client_chat_mock: TestClient) -> None:
    response = client_chat_mock.post(
        "/v1/chat",
        json={"messages": [{"role": "system", "content": "x"}]},
    )
    assert response.status_code == 422


def test_post_chat_no_user_message_returns_400(
    client_chat_mock: TestClient,
) -> None:
    response = client_chat_mock.post(
        "/v1/chat",
        json={"messages": [{"role": "assistant", "content": "only assistant"}]},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "No user message to reply to"


@pytest.fixture
def client_bedrock_mode() -> TestClient:
    return TestClient(
        create_app(
            Settings(
                environment="development",
                cors_allow_origins="",
                chat_mock_mode=False,
                bedrock_model_id="anthropic.claude-3-5-haiku-20241022-v1:0",
            ),
        ),
    )


def test_post_chat_bedrock_client_error_returns_502(
    client_bedrock_mode: TestClient,
) -> None:
    mock_client = MagicMock()
    mock_client.converse.side_effect = ClientError(
        {"Error": {"Code": "ThrottlingException", "Message": "Slow down"}},
        "Converse",
    )
    with patch("app.infrastructure.bedrock.boto3.client", return_value=mock_client):
        response = client_bedrock_mode.post(
            "/v1/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )
    assert response.status_code == 502
    assert response.json()["detail"] == "Assistant temporarily unavailable"


def test_production_forbids_chat_mock() -> None:
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            cors_allow_origins="https://app.example.com",
            chat_mock_mode=True,
            bedrock_model_id="x",
        )


def test_production_requires_bedrock_model_when_not_mock() -> None:
    with pytest.raises(ValidationError):
        Settings(
            environment="production",
            cors_allow_origins="https://app.example.com",
            chat_mock_mode=False,
            bedrock_model_id="",
        )
