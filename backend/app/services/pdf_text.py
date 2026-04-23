"""保存済み PDF からプレーンテキストを抽出する（BE-5 / 要約・文脈用）。"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from app.domain.paper_errors import PaperPageOutOfRangeError, PaperValidationError

logger = logging.getLogger(__name__)

_PAGE_DELIM_PREFIX = "\n\n--- page "
_PAGE_DELIM_SUFFIX = " ---\n\n"


@dataclass(frozen=True)
class PdfTextExtraction:
    """抽出結果。要約 API がトークン制御と UI 表示に使う。"""

    text: str
    truncated: bool
    pages_used: int
    total_pages_in_pdf: int | None


@dataclass(frozen=True)
class PdfTextPm1Extraction:
    """対象ページ ±1 の結合テキスト（GET .../text?context=pm1）。"""

    text: str
    pages_included: tuple[int, ...]
    truncated: bool


@dataclass(frozen=True)
class PaperPageTextBundle:
    """GET /pages/{page}/text 用に 1 回の PdfReader で組み立てた結果。"""

    text: str
    total_pages: int
    pages_included: tuple[int, ...]
    truncated: bool


def get_pdf_total_pages(path: Path) -> int:
    """PDF の総ページ数。読めない場合は PaperValidationError。"""
    try:
        reader = PdfReader(path)
    except PdfReadError as exc:
        logger.info("pdf_read_error", extra={"error_type": type(exc).__name__})
        raise PaperValidationError("Could not read PDF") from None
    return len(reader.pages)


def extract_text_single_page(path: Path, page_1based: int) -> str:
    """1-based ページのテキスト。範囲外は PaperPageOutOfRangeError。"""
    bundle = build_paper_page_text_bundle(
        path,
        page_1based,
        "page",
        max_pm1_chars=1,
    )
    return bundle.text


def extract_text_pm1(
    path: Path,
    center_page_1based: int,
    *,
    max_total_chars: int,
) -> PdfTextPm1Extraction:
    """center ±1 ページのテキストを結合（存在する範囲のみ）。上限で切り詰め。"""
    bundle = build_paper_page_text_bundle(
        path,
        center_page_1based,
        "pm1",
        max_pm1_chars=max_total_chars,
    )
    return PdfTextPm1Extraction(
        text=bundle.text,
        pages_included=bundle.pages_included,
        truncated=bundle.truncated,
    )


def build_paper_page_text_bundle(
    path: Path,
    page_1based: int,
    context: Literal["page", "pm1"],
    *,
    max_pm1_chars: int,
) -> PaperPageTextBundle:
    """ページ本文 API 用。PdfReader は 1 回だけ開く。"""
    try:
        reader = PdfReader(path)
    except PdfReadError as exc:
        logger.info("pdf_read_error", extra={"error_type": type(exc).__name__})
        raise PaperValidationError("Could not read PDF") from None

    total = len(reader.pages)
    if page_1based < 1 or page_1based > total:
        raise PaperPageOutOfRangeError("Page out of range")

    if context == "page":
        pg = reader.pages[page_1based - 1]
        try:
            raw = pg.extract_text() or ""
        except Exception:
            logger.info("pdf_page_extract_failed", extra={"page_index": page_1based - 1})
            raw = ""
        return PaperPageTextBundle(
            text=raw.strip(),
            total_pages=total,
            pages_included=(page_1based,),
            truncated=False,
        )

    if max_pm1_chars < 1:
        msg = "max_pm1_chars must be positive"
        raise ValueError(msg)

    candidates = [page_1based - 1, page_1based, page_1based + 1]
    pages_included = [p for p in candidates if 1 <= p <= total]

    chunks: list[str] = []
    for p in pages_included:
        pg = reader.pages[p - 1]
        try:
            raw = pg.extract_text() or ""
        except Exception:
            logger.info("pdf_page_extract_failed", extra={"page_index": p - 1})
            raw = ""
        body = raw.strip()
        chunk = f"{_PAGE_DELIM_PREFIX}{p}{_PAGE_DELIM_SUFFIX}{body}" if body else ""
        if chunk:
            chunks.append(chunk)

    full = "\n".join(chunks).strip()
    truncated = False
    if len(full) > max_pm1_chars:
        full = full[:max_pm1_chars]
        truncated = True

    return PaperPageTextBundle(
        text=full,
        total_pages=total,
        pages_included=tuple(pages_included),
        truncated=truncated,
    )


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
