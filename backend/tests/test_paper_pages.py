"""GET /v1/papers/{id}/pages/{page}/image と /text（Phase A）。"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.main import create_app
from app.settings import Settings


@pytest.fixture
def papers_settings(tmp_path: Path) -> Settings:
    return Settings(
        environment="development",
        cors_allow_origins="",
        chat_mock_mode=True,
        papers_storage_dir=tmp_path / "papers",
        paper_max_upload_bytes=1024 * 1024,
        paper_fetch_enabled=True,
        paper_fetch_max_bytes=1024 * 1024,
        paper_fetch_timeout_seconds=5.0,
        paper_fetch_host_allowlist="",
        paper_gc_max_age_seconds=3600,
    )


@pytest.fixture
def client_papers(papers_settings: Settings) -> TestClient:
    return TestClient(create_app(papers_settings))


def _three_blank_pages_pdf(tmp_path: Path) -> bytes:
    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(width=200, height=200)
    path = tmp_path / "three.pdf"
    with path.open("wb") as f:
        writer.write(f)
    return path.read_bytes()


def test_page_image_png_and_headers(client_papers: TestClient, tmp_path: Path) -> None:
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client_papers.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    assert up.status_code == 200
    paper_id = up.json()["paper_id"]

    r = client_papers.get(
        f"/v1/papers/{paper_id}/pages/1/image",
        params={"scale": 1.0},
    )
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/png")
    assert r.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert r.headers["X-Paper-Page"] == "1"
    assert r.headers["X-Paper-Scale"] == "1.0"
    assert int(r.headers["X-Paper-Width"]) > 0
    assert int(r.headers["X-Paper-Height"]) > 0


def test_page_text_single_and_pm1(client_papers: TestClient, tmp_path: Path) -> None:
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client_papers.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    paper_id = up.json()["paper_id"]

    r1 = client_papers.get(
        f"/v1/papers/{paper_id}/pages/2/text",
        params={"context": "page"},
    )
    assert r1.status_code == 200
    j1 = r1.json()
    assert j1["page"] == 2
    assert j1["total_pages"] == 3
    assert j1["pages_included"] == [2]
    assert j1["truncated"] is False

    r2 = client_papers.get(
        f"/v1/papers/{paper_id}/pages/2/text",
        params={"context": "pm1"},
    )
    assert r2.status_code == 200
    j2 = r2.json()
    assert j2["pages_included"] == [1, 2, 3]


def test_page_out_of_range_404(client_papers: TestClient, tmp_path: Path) -> None:
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client_papers.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    paper_id = up.json()["paper_id"]

    r = client_papers.get(f"/v1/papers/{paper_id}/pages/99/image")
    assert r.status_code == 404
    assert r.json()["detail"] == "Page not found"

    rt = client_papers.get(f"/v1/papers/{paper_id}/pages/99/text")
    assert rt.status_code == 404


def test_pm1_first_page_includes_one_and_two(client_papers: TestClient, tmp_path: Path) -> None:
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client_papers.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    paper_id = up.json()["paper_id"]

    r = client_papers.get(
        f"/v1/papers/{paper_id}/pages/1/text",
        params={"context": "pm1"},
    )
    assert r.status_code == 200
    assert r.json()["pages_included"] == [1, 2]
