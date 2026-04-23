"""PDF ページを画像（PNG）としてレンダリングする（Phase A）。"""

from __future__ import annotations

import io
import logging
from pathlib import Path

import fitz
from PIL import Image

from app.domain.paper_errors import (
    PaperPageImageTooLargeError,
    PaperPageOutOfRangeError,
    PaperValidationError,
    PaperVisionRectError,
)

logger = logging.getLogger(__name__)


def render_page_png(
    path: Path,
    page_1based: int,
    scale: float,
    *,
    max_pixels: int,
) -> tuple[bytes, int, int]:
    """1-based ページを PNG バイト列にレンダリングする。戻り値は (png_bytes, width, height)。"""
    if max_pixels < 1:
        msg = "max_pixels must be positive"
        raise ValueError(msg)

    try:
        doc = fitz.open(path)
    except Exception as exc:
        logger.info("pdf_page_image_open_failed", extra={"error_type": type(exc).__name__})
        raise PaperValidationError("Could not read PDF") from None

    try:
        if page_1based < 1 or page_1based > doc.page_count:
            raise PaperPageOutOfRangeError("Page out of range")

        page = doc.load_page(page_1based - 1)
        mat = fitz.Matrix(scale, scale)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        w, h = pix.width, pix.height
        if w * h > max_pixels:
            raise PaperPageImageTooLargeError("Rendered page exceeds pixel limit")
        png_bytes = pix.tobytes("png")
    finally:
        doc.close()

    return png_bytes, w, h


def crop_page_region_png(
    path: Path,
    page_1based: int,
    scale: float,
    x: int,
    y: int,
    w: int,
    h: int,
    *,
    max_pixels: int,
) -> bytes:
    """フルページをレンダリングし、image_px 矩形で PNG を切り抜く（フロントの GET image と同一 scale）。"""
    if w < 1 or h < 1:
        raise PaperVisionRectError("Crop width and height must be positive")
    if x < 0 or y < 0:
        raise PaperVisionRectError("Crop origin must be non-negative")

    full_png, pw, ph = render_page_png(
        path,
        page_1based,
        scale,
        max_pixels=max_pixels,
    )

    if x + w > pw or y + h > ph:
        raise PaperVisionRectError("Crop rectangle exceeds page image bounds")

    if w * h > max_pixels:
        raise PaperPageImageTooLargeError("Cropped region exceeds pixel limit")

    im = Image.open(io.BytesIO(full_png))
    cropped = im.crop((x, y, x + w, y + h))
    buf = io.BytesIO()
    cropped.save(buf, format="PNG")
    return buf.getvalue()
