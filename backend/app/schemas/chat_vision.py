"""POST /v1/chat/vision — 図・表矩形＋サーバー生成本文（Phase C / D 複数参照）。"""

from __future__ import annotations

from typing import Literal, Self
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.schemas.chat import ChatMessageIn, validate_alternating_chat_messages


class ImagePxRectIn(BaseModel):
    """フロントの `image_px` 矩形（GET .../pages/{page}/image と同一 scale の PNG 上）。"""

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    w: int = Field(ge=1)
    h: int = Field(ge=1)
    unit: Literal["image_px"] = "image_px"


class VisionSelectionIn(BaseModel):
    """1 つの図・表参照（矩形は当該 page・scale のページ画像上）。"""

    page: int = Field(ge=1)
    scale: float = Field(default=2.0, gt=0, le=16.0)
    rect: ImagePxRectIn
    figure_label: str | None = Field(default=None, max_length=200)


class ChatVisionRequest(BaseModel):
    messages: list[ChatMessageIn] = Field(min_length=1, max_length=50)
    paper_id: UUID
    selections: list[VisionSelectionIn] = Field(min_length=1, max_length=10)

    @model_validator(mode="after")
    def alternating_user_assistant(self) -> Self:
        validate_alternating_chat_messages(self.messages)
        return self
