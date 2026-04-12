"""POST /v1/chat のリクエスト・レスポンス境界モデル。"""

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=100_000)


class ChatRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=50)


class ChatResponse(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str
