"""論文 PDF の保存・取得・URL 取り込み（BE-3）。"""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID, uuid4

import httpx
from fastapi import UploadFile

from app.domain.paper_errors import (
    PaperFetchDisabledError,
    PaperFetchHttpError,
    PaperFetchRejectedError,
    PaperNotFoundError,
    PaperTooLargeError,
    PaperValidationError,
)
from app.infrastructure.paper_storage import ensure_storage_dir, gc_old_files, paper_file_path
from app.infrastructure.ssrf_guard import assert_safe_https_url
from app.settings import Settings

logger = logging.getLogger(__name__)

_PDF_MAGIC = b"%PDF-"
_CHUNK_SIZE = 64 * 1024


@dataclass(frozen=True)
class PaperStored:
    paper_id: UUID
    filename: str
    size_bytes: int


def _allowlist_entries(settings: Settings) -> list[str]:
    if not settings.paper_fetch_host_allowlist.strip():
        return []
    return [h.strip() for h in settings.paper_fetch_host_allowlist.split(",") if h.strip()]


def _safe_display_filename(name: str | None) -> str:
    if not name or not name.strip():
        return "upload.pdf"
    base = name.replace("\\", "/").split("/")[-1]
    if not base or base in {".", ".."}:
        return "upload.pdf"
    cleaned = re.sub(r"[\x00-\x1f]", "", base.strip())
    if not cleaned:
        return "upload.pdf"
    return cleaned[:200]


def _display_name_from_url(url: str) -> str:
    path = urlparse(url).path
    base = path.rsplit("/", 1)[-1] if path else ""
    if base.lower().endswith(".pdf"):
        return _safe_display_filename(base)
    return "fetched.pdf"


async def _store_pdf_from_async_iter(
    settings: Settings,
    chunks: AsyncIterator[bytes],
    max_bytes: int,
    display_name: str,
) -> PaperStored:
    ensure_storage_dir(settings.papers_storage_dir)
    paper_id = uuid4()
    path = paper_file_path(settings.papers_storage_dir, paper_id)
    total = 0
    header_checked = False
    pending = b""

    try:
        with path.open("wb") as f:
            async for chunk in chunks:
                if not chunk:
                    continue
                total += len(chunk)
                if total > max_bytes:
                    raise PaperTooLargeError
                if not header_checked:
                    pending += chunk
                    if len(pending) < len(_PDF_MAGIC):
                        continue
                    if not pending.startswith(_PDF_MAGIC):
                        raise PaperValidationError("Not a PDF")
                    header_checked = True
                    f.write(pending)
                    pending = b""
                    continue
                f.write(chunk)
    except (PaperTooLargeError, PaperValidationError):
        path.unlink(missing_ok=True)
        raise
    except Exception:
        path.unlink(missing_ok=True)
        raise

    if total == 0:
        path.unlink(missing_ok=True)
        raise PaperValidationError("Empty file")

    if not header_checked:
        path.unlink(missing_ok=True)
        raise PaperValidationError("Not a PDF")

    gc_old_files(settings.papers_storage_dir, settings.paper_gc_max_age_seconds)
    return PaperStored(paper_id=paper_id, filename=display_name, size_bytes=total)


async def _upload_chunks(upload: UploadFile) -> AsyncIterator[bytes]:
    while True:
        data = await upload.read(_CHUNK_SIZE)
        if not data:
            break
        yield data


async def store_upload(settings: Settings, upload: UploadFile) -> PaperStored:
    display = _safe_display_filename(upload.filename)
    return await _store_pdf_from_async_iter(
        settings,
        _upload_chunks(upload),
        settings.paper_max_upload_bytes,
        display,
    )


def resolve_paper_path(settings: Settings, paper_id: UUID) -> Path:
    root = settings.papers_storage_dir.resolve()
    path = paper_file_path(settings.papers_storage_dir, paper_id)
    try:
        resolved = path.resolve()
    except OSError as exc:
        logger.warning("paper_path_resolve_failed", extra={"error": str(exc)})
        raise PaperNotFoundError from None
    if resolved.parent != root:
        raise PaperNotFoundError
    if not path.is_file():
        raise PaperNotFoundError
    return path


async def store_from_url(settings: Settings, url: str) -> PaperStored:
    if not settings.paper_fetch_enabled:
        raise PaperFetchDisabledError

    allowlist = _allowlist_entries(settings)
    try:
        assert_safe_https_url(url, allowlist)
    except ValueError as exc:
        raise PaperFetchRejectedError(str(exc)) from None

    timeout = httpx.Timeout(settings.paper_fetch_timeout_seconds)
    display = _display_name_from_url(url)

    async def _http_chunks() -> AsyncIterator[bytes]:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            async with client.stream("GET", url) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    raise PaperFetchHttpError("Redirect response is not followed")
                if resp.status_code != 200:
                    raise PaperFetchHttpError("Unexpected response status")
                async for part in resp.aiter_bytes(_CHUNK_SIZE):
                    yield part

    try:
        return await _store_pdf_from_async_iter(
            settings,
            _http_chunks(),
            settings.paper_fetch_max_bytes,
            display,
        )
    except PaperFetchHttpError:
        raise
    except httpx.HTTPError:
        logger.info("paper_fetch_httpx_error", extra={"category": "httpx"})
        raise PaperFetchHttpError("Paper fetch failed") from None
