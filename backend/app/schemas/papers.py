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


class PaperPageTextResponse(BaseModel):
    """GET /v1/papers/.../pages/{page}/text の JSON。"""

    text: str = Field(default="")
    page: int = Field(ge=1, description="リクエストの中心ページ（1-based）")
    total_pages: int = Field(ge=0)
    pages_included: list[int] = Field(default_factory=list)
    truncated: bool = False


class PaperSummaryResponse(BaseModel):
    """仕様書 F1-1 に近い構造化要約（BE-5）。"""

    title_ja: str = Field(default="", max_length=20_000)
    one_liner: str = Field(default="", max_length=20_000)
    purpose: str = Field(default="", max_length=50_000)
    method: str = Field(default="", max_length=50_000)
    results: str = Field(default="", max_length=50_000)
    takeaways: str = Field(default="", max_length=50_000)
    keywords: str = Field(default="", max_length=10_000)
    truncated_source: bool = Field(
        description="True if PDF text was truncated before summarization",
    )
