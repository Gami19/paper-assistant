"""chat_reply ユースケースの純粋経路（Fake ChatCompleter）。"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.ports.chat_completion import ChatTurn
from app.schemas.chat import ChatMessageIn, ChatRequest
from app.services.chat_reply import NoUserMessageError, chat_reply_use_case
from app.settings import Settings


class EchoCompleter:
    def converse(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
    ) -> str:
        for role, content in reversed(messages):
            if role == "user":
                return f"echo:{content}"
        return "echo:"


class EmptyCompleter:
    def converse(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
    ) -> str:
        return ""


def test_use_case_with_fake_completer_returns_response() -> None:
    settings = Settings(environment="development", chat_mock_mode=True)
    body = ChatRequest(
        messages=[ChatMessageIn(role="user", content="hello")],
    )
    result = chat_reply_use_case(settings, body, completer=EchoCompleter())
    assert result.role == "assistant"
    assert result.content == "echo:hello"


def test_use_case_multi_turn_uses_last_user() -> None:
    settings = Settings(environment="development", chat_mock_mode=True)
    body = ChatRequest(
        messages=[
            ChatMessageIn(role="user", content="first"),
            ChatMessageIn(role="assistant", content="ok"),
            ChatMessageIn(role="user", content="second"),
        ],
    )
    result = chat_reply_use_case(settings, body, completer=EchoCompleter())
    assert result.content == "echo:second"


def test_request_rejects_conversation_not_starting_with_user() -> None:
    with pytest.raises(ValidationError):
        ChatRequest(
            messages=[ChatMessageIn(role="assistant", content="x")],
        )


def test_use_case_raises_when_completer_returns_empty() -> None:
    settings = Settings(environment="development", chat_mock_mode=True)
    body = ChatRequest(
        messages=[ChatMessageIn(role="user", content="hello")],
    )
    with pytest.raises(NoUserMessageError):
        chat_reply_use_case(settings, body, completer=EmptyCompleter())
