"""pdf_text 抽出の境界。"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from pypdf import PdfWriter

from app.domain.paper_errors import PaperValidationError
from app.services.pdf_text import extract_plain_text_from_pdf


def test_extract_truncates_by_max_chars() -> None:
    long_text = "word " * 20_000
    mock_page = MagicMock()
    mock_page.extract_text.return_value = long_text
    mock_reader = MagicMock()
    mock_reader.pages = [mock_page]

    with patch("app.services.pdf_text.PdfReader", return_value=mock_reader):
        out = extract_plain_text_from_pdf(
            Path("/fake.pdf"),
            max_pages=1,
            max_chars=100,
        )
    assert len(out.text) <= 100
    assert out.truncated is True


def test_extract_raises_when_no_text(tmp_path: Path) -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    path = tmp_path / "blank.pdf"
    with path.open("wb") as f:
        writer.write(f)

    with pytest.raises(PaperValidationError, match="No extractable"):
        extract_plain_text_from_pdf(path, max_pages=5, max_chars=10_000)
