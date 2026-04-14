"""POST /v1/chat のユースケース（ポート越しに補完を実行）。"""

from __future__ import annotations

from app.ports.chat_completion import ChatCompleter, ChatTurn
from app.schemas.chat import ChatRequest, ChatResponse
from app.settings import Settings

DEFAULT_CHAT_SYSTEM = (
    "あなたは学術論文の読解を手伝うアシスタントです。"
    "ユーザーは日本語で質問することが多いです。分かりやすい日本語で答えてください。"
)


class NoUserMessageError(Exception):
    """会話が空、またはモデルが空文字を返した。"""


def _build_chat_system(paper_excerpt: str | None) -> str:
    if paper_excerpt and paper_excerpt.strip():
        return (
            f"{DEFAULT_CHAT_SYSTEM}\n\n"
            "以下は論文からの抜粋です。質問に答えるときに参照してください。\n"
            "---\n"
            f"{paper_excerpt.strip()}\n"
            "---"
        )
    return DEFAULT_CHAT_SYSTEM


def chat_reply_use_case(
    settings: Settings,
    body: ChatRequest,
    completer: ChatCompleter | None = None,
) -> ChatResponse:
    """HTTP 層は例外をステータスにマップする。"""
    from app.infrastructure.bedrock import build_chat_completer

    effective = completer or build_chat_completer(settings)
    pairs: list[ChatTurn] = [(m.role, m.content) for m in body.messages]

    system = _build_chat_system(body.paper_excerpt)
    text = effective.converse(system=system, messages=pairs)
    if not text.strip():
        raise NoUserMessageError

    return ChatResponse(content=text)
