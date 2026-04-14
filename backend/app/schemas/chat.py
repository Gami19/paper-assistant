"""POST /v1/chat のリクエスト・レスポンス境界モデル。"""

from __future__ import annotations

from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=100_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=50)
    paper_excerpt: str | None = Field(
        default=None,
        max_length=50_000,
        description="Optional excerpt from the paper for Q&A context",
    )

    @model_validator(mode="after")
    def alternating_user_assistant(self) -> Self:
        msgs = self.messages
        if msgs[0].role != "user":
            msg = "messages must start with a user turn"
            raise ValueError(msg)
        if msgs[-1].role != "user":
            msg = "messages must end with a user turn"
            raise ValueError(msg)
        for i in range(1, len(msgs)):
            if msgs[i].role == msgs[i - 1].role:
                msg = "messages must alternate user and assistant"
                raise ValueError(msg)
        return self


class ChatResponse(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str
