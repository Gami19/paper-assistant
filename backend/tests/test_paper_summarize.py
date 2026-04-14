"""POST /v1/papers/{id}/summarize（モック・抽出のスタブ）。"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.pdf_text import PdfTextExtraction
from app.settings import Settings

MINIMAL_PDF = b"""%PDF-1.1
1 0 obj<<>>endobj
trailer<<>>
%%EOF
"""


def test_summarize_mock_returns_placeholder(
    tmp_path,
) -> None:
    settings = Settings(
        environment="development",
        cors_allow_origins="",
        chat_mock_mode=True,
        papers_storage_dir=tmp_path / "papers",
    )
    client = TestClient(create_app(settings))

    up = client.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert up.status_code == 200
    paper_id = up.json()["paper_id"]

    fake = PdfTextExtraction(
        text="Title\n\nAbstract. We study X.",
        truncated=False,
        pages_used=1,
        total_pages_in_pdf=1,
    )
    with patch(
        "app.services.paper_summarize.extract_plain_text_from_pdf",
        return_value=fake,
    ):
        res = client.post(f"/v1/papers/{paper_id}/summarize")

    assert res.status_code == 200
    body = res.json()
    assert body["title_ja"] == "（モック要約）"
    assert "モック" in body["one_liner"] or "プレースホルダ" in body["one_liner"]
    assert body["truncated_source"] is False


def test_summarize_unknown_paper_404(tmp_path) -> None:
    settings = Settings(
        environment="development",
        cors_allow_origins="",
        chat_mock_mode=True,
        papers_storage_dir=tmp_path / "papers",
    )
    client = TestClient(create_app(settings))
    res = client.post(
        "/v1/papers/00000000-0000-4000-8000-000000000000/summarize",
    )
    assert res.status_code == 404


def test_summarize_invalid_model_json_returns_502(tmp_path) -> None:
    """非モックでモデルが JSON を返さないとき ValueError → 502。"""
    settings = Settings(
        environment="development",
        cors_allow_origins="",
        chat_mock_mode=False,
        bedrock_model_id="anthropic.claude-3-5-haiku-20241022-v1:0",
        papers_storage_dir=tmp_path / "papers",
    )
    client = TestClient(create_app(settings))
    up = client.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert up.status_code == 200
    paper_id = up.json()["paper_id"]

    fake_extract = PdfTextExtraction(
        text="Some paper text for summarization.",
        truncated=False,
        pages_used=1,
        total_pages_in_pdf=1,
    )
    bad_completer = MagicMock()
    bad_completer.converse.return_value = "this is not valid json"

    with (
        patch(
            "app.services.paper_summarize.extract_plain_text_from_pdf",
            return_value=fake_extract,
        ),
        patch(
            "app.services.paper_summarize.build_chat_completer",
            return_value=bad_completer,
        ),
    ):
        res = client.post(f"/v1/papers/{paper_id}/summarize")

    assert res.status_code == 502
    assert res.json()["detail"] == "Summary generation failed"
