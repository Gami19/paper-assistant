"""POST /v1/chat のユースケース（ポート越しに補完を実行）。"""

from __future__ import annotations

from app.infrastructure.bedrock import build_chat_completer
from app.ports.chat_completion import ChatCompleter
from app.schemas.chat import ChatRequest, ChatResponse
from app.settings import Settings


class NoUserMessageError(Exception):
    """最後の user ターンが無い、または補完結果が空。"""


def last_user_text_from_messages(messages: list[tuple[str, str]]) -> str:
    for role, content in reversed(messages):
        if role == "user":
            return content
    return ""


def chat_reply_use_case(
    settings: Settings,
    body: ChatRequest,
    completer: ChatCompleter | None = None,
) -> ChatResponse:
    """HTTP 層は例外をステータスにマップする。"""
    effective = completer or build_chat_completer(settings)
    pairs = [(m.role, m.content) for m in body.messages]
    user_text = last_user_text_from_messages(pairs)
    if not user_text.strip():
        raise NoUserMessageError

    text = effective.complete(user_text.strip())
    if not text.strip():
        raise NoUserMessageError

    return ChatResponse(content=text)
