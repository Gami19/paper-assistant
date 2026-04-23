"""論文 PDF: アップロード・取得・URL 取り込み（BE-3）。"""

from __future__ import annotations

import logging
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Path, Query, Request, UploadFile
from fastapi.responses import FileResponse, Response

from app.domain.bedrock_errors import BedrockThrottledError
from app.domain.paper_errors import (
    PaperFetchDisabledError,
    PaperFetchHttpError,
    PaperFetchRejectedError,
    PaperNotFoundError,
    PaperPageImageTooLargeError,
    PaperPageOutOfRangeError,
    PaperTooLargeError,
    PaperValidationError,
)
from app.schemas.papers import (
    PaperFetchRequest,
    PaperPageTextResponse,
    PaperSummaryResponse,
    PaperUploadResponse,
)
from app.services.paper_store import resolve_paper_path, store_from_url, store_upload
from app.services.paper_summarize import summarize_paper_file
from app.services.pdf_page_image import render_page_png
from app.services.pdf_text import build_paper_page_text_bundle
from app.settings import Settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["papers"])


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


@router.post("/v1/papers/upload", response_model=PaperUploadResponse)
async def upload_paper(
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File(alias="file")],
) -> PaperUploadResponse:
    try:
        stored = await store_upload(settings, file)
    except PaperTooLargeError:
        raise HTTPException(status_code=413, detail="File too large") from None
    except PaperValidationError:
        raise HTTPException(status_code=400, detail="Invalid PDF file") from None
    return PaperUploadResponse(
        paper_id=stored.paper_id,
        filename=stored.filename,
        size_bytes=stored.size_bytes,
    )


@router.post("/v1/papers/{paper_id}/summarize", response_model=PaperSummaryResponse)
def summarize_paper(
    paper_id: UUID,
    settings: Annotated[Settings, Depends(get_settings)],
) -> PaperSummaryResponse:
    try:
        path = resolve_paper_path(settings, paper_id)
    except PaperNotFoundError:
        raise HTTPException(status_code=404, detail="Paper not found") from None
    try:
        return summarize_paper_file(settings, path)
    except PaperValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail="Could not extract text from PDF",
        ) from exc
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="Summary generation failed",
        ) from None
    except BedrockThrottledError:
        raise HTTPException(
            status_code=429,
            detail="モデルが混雑しています。しばらくしてから再度お試しください。",
        ) from None
    except RuntimeError:
        raise HTTPException(
            status_code=502,
            detail="Assistant temporarily unavailable",
        ) from None


@router.get("/v1/papers/{paper_id}/pages/{page}/image")
def get_paper_page_image(
    paper_id: UUID,
    page: Annotated[int, Path(ge=1)],
    settings: Annotated[Settings, Depends(get_settings)],
    scale: float = Query(default=2.0),
) -> Response:
    """PDF の 1 ページを PNG で返す（矩形座標 `image_px` の基準画像用）。"""
    try:
        pdf_path = resolve_paper_path(settings, paper_id)
    except PaperNotFoundError:
        raise HTTPException(status_code=404, detail="Paper not found") from None

    s = max(
        settings.paper_page_image_scale_min,
        min(scale, settings.paper_page_image_scale_max),
    )
    try:
        png_bytes, w, h = render_page_png(
            pdf_path,
            page,
            s,
            max_pixels=settings.paper_page_image_max_pixels,
        )
    except PaperPageOutOfRangeError:
        raise HTTPException(status_code=404, detail="Page not found") from None
    except PaperValidationError:
        raise HTTPException(
            status_code=422,
            detail="Could not read PDF",
        ) from None
    except PaperPageImageTooLargeError:
        raise HTTPException(
            status_code=413,
            detail="Rendered page exceeds pixel limit",
        ) from None

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "X-Paper-Page": str(page),
            "X-Paper-Scale": str(s),
            "X-Paper-Width": str(w),
            "X-Paper-Height": str(h),
        },
    )


@router.get("/v1/papers/{paper_id}/pages/{page}/text", response_model=PaperPageTextResponse)
def get_paper_page_text(
    paper_id: UUID,
    page: Annotated[int, Path(ge=1)],
    settings: Annotated[Settings, Depends(get_settings)],
    context: Literal["page", "pm1"] = Query(default="page"),
) -> PaperPageTextResponse:
    """単ページまたは対象ページ ±1 の本文テキストを返す。"""
    try:
        pdf_path = resolve_paper_path(settings, paper_id)
    except PaperNotFoundError:
        raise HTTPException(status_code=404, detail="Paper not found") from None

    try:
        bundle = build_paper_page_text_bundle(
            pdf_path,
            page,
            context,
            max_pm1_chars=settings.paper_page_neighbor_text_max_chars,
        )
    except PaperPageOutOfRangeError:
        raise HTTPException(status_code=404, detail="Page not found") from None
    except PaperValidationError:
        raise HTTPException(
            status_code=422,
            detail="Could not read PDF",
        ) from None

    return PaperPageTextResponse(
        text=bundle.text,
        page=page,
        total_pages=bundle.total_pages,
        pages_included=list(bundle.pages_included),
        truncated=bundle.truncated,
    )


@router.get("/v1/papers/{paper_id}/file")
def get_paper_file(
    paper_id: UUID,
    settings: Annotated[Settings, Depends(get_settings)],
) -> FileResponse:
    try:
        path = resolve_paper_path(settings, paper_id)
    except PaperNotFoundError:
        raise HTTPException(status_code=404, detail="Paper not found") from None
    return FileResponse(
        path,
        media_type="application/pdf",
        filename="paper.pdf",
        content_disposition_type="inline",
    )


@router.post("/v1/papers/fetch", response_model=PaperUploadResponse)
async def fetch_paper(
    body: PaperFetchRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> PaperUploadResponse:
    url_str = str(body.url)
    try:
        stored = await store_from_url(settings, url_str)
    except PaperFetchDisabledError:
        raise HTTPException(status_code=403, detail="Paper fetch is disabled") from None
    except PaperFetchRejectedError:
        raise HTTPException(status_code=400, detail="URL is not allowed") from None
    except PaperTooLargeError:
        raise HTTPException(status_code=413, detail="Downloaded file too large") from None
    except PaperValidationError:
        raise HTTPException(status_code=400, detail="Invalid PDF content") from None
    except PaperFetchHttpError:
        raise HTTPException(status_code=502, detail="Failed to fetch paper URL") from None
    logger.info("paper_fetched", extra={"size_bytes": stored.size_bytes})
    return PaperUploadResponse(
        paper_id=stored.paper_id,
        filename=stored.filename,
        size_bytes=stored.size_bytes,
    )
