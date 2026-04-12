"""チャット補完（1 ターンのユーザー文 → アシスタント本文）のポート。"""

from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class ChatCompleter(Protocol):
    """Bedrock 実装・モック・テスト Fake が満たす契約。"""

    def complete(self, user_text: str) -> str:
        """非空のユーザー本文を受け取り、アシスタント本文を返す。"""
        ...
