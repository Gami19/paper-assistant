"""チャット補完（Bedrock Converse 相当の会話）のポート。"""

from __future__ import annotations

from typing import Literal, Protocol, runtime_checkable

ChatTurn = tuple[Literal["user", "assistant"], str]


@runtime_checkable
class ChatCompleter(Protocol):
    """Bedrock 実装・モック・テスト Fake が満たす契約。"""

    def converse(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
    ) -> str:
        """system は任意。messages は user で始まり user で終わる交互ターンを想定。"""
        ...

    def converse_with_vision(
        self,
        *,
        system: str | None,
        messages: list[ChatTurn],
        image_pngs: list[bytes],
    ) -> str:
        """最終ターンは user。画像はその user ターンに順に付与し、最後にテキスト（Bedrock Converse）。"""
        ...
