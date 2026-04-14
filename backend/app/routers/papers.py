"""論文 PDF: アップロード・取得・URL 取り込み（BE-3）。"""

from __future__ import annotations

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from app.domain.bedrock_errors import BedrockThrottledError
from app.domain.paper_errors import (
    PaperFetchDisabledError,
    PaperFetchHttpError,
    PaperFetchRejectedError,
    PaperNotFoundError,
    PaperTooLargeError,
    PaperValidationError,
)
from app.schemas.papers import PaperFetchRequest, PaperSummaryResponse, PaperUploadResponse
from app.services.paper_store import resolve_paper_path, store_from_url, store_upload
from app.services.paper_summarize import summarize_paper_file
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
