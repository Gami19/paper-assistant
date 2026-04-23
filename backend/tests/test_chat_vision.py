"""POST /v1/chat/vision（Phase C / D）。"""

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
def client_vision(papers_settings: Settings) -> TestClient:
    return TestClient(create_app(papers_settings))


def _three_blank_pages_pdf(tmp_path: Path) -> bytes:
    writer = PdfWriter()
    for _ in range(3):
        writer.add_blank_page(width=200, height=200)
    path = tmp_path / "three.pdf"
    with path.open("wb") as f:
        writer.write(f)
    return path.read_bytes()


def _small_rect_from_image_headers(client: TestClient, paper_id: str) -> dict[str, int | str]:
    img = client.get(
        f"/v1/papers/{paper_id}/pages/1/image",
        params={"scale": 1.0},
    )
    assert img.status_code == 200
    w = int(img.headers["X-Paper-Width"])
    h = int(img.headers["X-Paper-Height"])
    cw, ch = min(40, w - 2), min(40, h - 2)
    return {"x": 1, "y": 1, "w": cw, "h": ch, "unit": "image_px"}


def test_post_chat_vision_mock_ok(client_vision: TestClient, tmp_path: Path) -> None:
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client_vision.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    assert up.status_code == 200
    paper_id = up.json()["paper_id"]

    rect = _small_rect_from_image_headers(client_vision, paper_id)
    body = {
        "messages": [{"role": "user", "content": "この図の説明は？"}],
        "paper_id": paper_id,
        "selections": [
            {
                "page": 1,
                "scale": 1.0,
                "rect": rect,
                "figure_label": "Fig.1",
            },
        ],
    }
    r = client_vision.post("/v1/chat/vision", json=body)
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "assistant"
    assert "[mock] vision:" in data["content"]
    assert "この図の説明" in data["content"]


def test_post_chat_vision_two_selections_mock(client_vision: TestClient, tmp_path: Path) -> None:
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client_vision.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    paper_id = up.json()["paper_id"]
    r1 = _small_rect_from_image_headers(client_vision, paper_id)
    r2 = _small_rect_from_image_headers(client_vision, paper_id)
    body = {
        "messages": [{"role": "user", "content": "比較して"}],
        "paper_id": paper_id,
        "selections": [
            {"page": 1, "scale": 1.0, "rect": r1},
            {"page": 2, "scale": 1.0, "rect": r2, "figure_label": "Fig.2"},
        ],
    }
    r = client_vision.post("/v1/chat/vision", json=body)
    assert r.status_code == 200
    assert "[mock] vision:" in r.json()["content"]


def test_post_chat_vision_crop_out_of_bounds_400(
    client_vision: TestClient,
    tmp_path: Path,
) -> None:
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client_vision.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    paper_id = up.json()["paper_id"]

    body = {
        "messages": [{"role": "user", "content": "test"}],
        "paper_id": paper_id,
        "selections": [
            {
                "page": 1,
                "scale": 1.0,
                "rect": {
                    "x": 0,
                    "y": 0,
                    "w": 50_000,
                    "h": 50_000,
                    "unit": "image_px",
                },
            },
        ],
    }
    r = client_vision.post("/v1/chat/vision", json=body)
    assert r.status_code == 400


def test_post_chat_vision_paper_missing_404(client_vision: TestClient) -> None:
    body = {
        "messages": [{"role": "user", "content": "x"}],
        "paper_id": "00000000-0000-4000-8000-000000000001",
        "selections": [
            {
                "page": 1,
                "scale": 1.0,
                "rect": {"x": 0, "y": 0, "w": 10, "h": 10, "unit": "image_px"},
            },
        ],
    }
    r = client_vision.post("/v1/chat/vision", json=body)
    assert r.status_code == 404


def test_post_chat_vision_too_many_selections_422(tmp_path: Path) -> None:
    settings = Settings(
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
        chat_vision_max_figures=2,
    )
    client = TestClient(create_app(settings))
    pdf_bytes = _three_blank_pages_pdf(tmp_path)
    up = client.post(
        "/v1/papers/upload",
        files={"file": ("t.pdf", pdf_bytes, "application/pdf")},
    )
    paper_id = up.json()["paper_id"]
    rect = {"x": 0, "y": 0, "w": 10, "h": 10, "unit": "image_px"}
    body = {
        "messages": [{"role": "user", "content": "x"}],
        "paper_id": paper_id,
        "selections": [
            {"page": 1, "scale": 1.0, "rect": rect},
            {"page": 2, "scale": 1.0, "rect": rect},
            {"page": 3, "scale": 1.0, "rect": rect},
        ],
    }
    r = client.post("/v1/chat/vision", json=body)
    assert r.status_code == 422
    assert r.json()["detail"] == "Too many figure selections"
