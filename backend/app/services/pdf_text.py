"""保存済み PDF からプレーンテキストを抽出する（BE-5 / 要約・文脈用）。"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.domain.paper_errors import PaperValidationError

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PdfTextExtraction:
    """抽出結果。要約 API がトークン制御と UI 表示に使う。"""

    text: str
    truncated: bool
    pages_used: int
    total_pages_in_pdf: int | None


def extract_plain_text_from_pdf(
    path: Path,
    *,
    max_pages: int,
    max_chars: int,
) -> PdfTextExtraction:
    """PDF からテキストを抽出し、ページ数・文字数で切り詰める。

    空または空白のみの場合は PaperValidationError。
    """
    if max_pages < 1 or max_chars < 1:
        msg = "max_pages and max_chars must be positive"
        raise ValueError(msg)

    try:
        reader = PdfReader(path)
    except PdfReadError as exc:
        logger.info("pdf_read_error", extra={"error_type": type(exc).__name__})
        raise PaperValidationError("Could not read PDF") from None

    total_pages = len(reader.pages)
    page_chunks: list[str] = []
    last_non_empty_page_index = -1

    for i in range(min(total_pages, max_pages)):
        page = reader.pages[i]
        try:
            raw = page.extract_text() or ""
        except Exception:
            logger.info("pdf_page_extract_failed", extra={"page_index": i})
            raw = ""
        chunk = raw.strip()
        if chunk:
            page_chunks.append(chunk)
            last_non_empty_page_index = i

    if not page_chunks:
        raise PaperValidationError("No extractable text in PDF")

    full = "\n\n".join(page_chunks)
    truncated = False
    if len(full) > max_chars:
        full = full[:max_chars]
        truncated = True

    pages_used = last_non_empty_page_index + 1 if last_non_empty_page_index >= 0 else 0
    if total_pages > max_pages:
        truncated = True

    return PdfTextExtraction(
        text=full.strip(),
        truncated=truncated,
        pages_used=pages_used,
        total_pages_in_pdf=total_pages,
    )
