"""chat_reply ユースケースの純粋経路（Fake ChatCompleter）。"""

import pytest

from app.schemas.chat import ChatMessageIn, ChatRequest
from app.services.chat_reply import NoUserMessageError, chat_reply_use_case
from app.settings import Settings


class EchoCompleter:
    def complete(self, user_text: str) -> str:
        return f"echo:{user_text}"


class EmptyCompleter:
    def complete(self, user_text: str) -> str:
        return ""


def test_use_case_with_fake_completer_returns_response() -> None:
    settings = Settings(environment="development", chat_mock_mode=True)
    body = ChatRequest(
        messages=[ChatMessageIn(role="user", content="hello")],
    )
    result = chat_reply_use_case(settings, body, completer=EchoCompleter())
    assert result.role == "assistant"
    assert result.content == "echo:hello"


def test_use_case_raises_when_no_user_turn() -> None:
    settings = Settings(environment="development", chat_mock_mode=True)
    body = ChatRequest(
        messages=[ChatMessageIn(role="assistant", content="x")],
    )
    with pytest.raises(NoUserMessageError):
        chat_reply_use_case(settings, body, completer=EchoCompleter())


def test_use_case_raises_when_completer_returns_empty() -> None:
    settings = Settings(environment="development", chat_mock_mode=True)
    body = ChatRequest(
        messages=[ChatMessageIn(role="user", content="hello")],
    )
    with pytest.raises(NoUserMessageError):
        chat_reply_use_case(settings, body, completer=EmptyCompleter())
