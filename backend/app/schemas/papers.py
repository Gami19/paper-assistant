"""論文 PDF API のリクエスト／レスポンススキーマ（BE-3）。"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator


class PaperUploadResponse(BaseModel):
    paper_id: UUID
    filename: str
    size_bytes: int = Field(ge=0)


class PaperFetchRequest(BaseModel):
    url: HttpUrl

    @field_validator("url")
    @classmethod
    def https_only(cls, v: HttpUrl) -> HttpUrl:
        if v.scheme != "https":
            msg = "Only https URLs are allowed"
            raise ValueError(msg)
        return v
