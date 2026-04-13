"""BE-3 論文 PDF: アップロード・取得・fetch・リダイレクト拒否。"""

from __future__ import annotations

import socket
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import Settings

# テスト専用の最小 PDF（フロント sample.pdf に依存しない）
MINIMAL_PDF = b"""%PDF-1.1
1 0 obj<<>>endobj
trailer<<>>
%%EOF
"""


@pytest.fixture
def patch_public_dns_for_example_com() -> object:
    """example.com の名前解決を公開 IP に固定（CI オフラインでも fetch テスト可能）。"""
    fake = (
        socket.AF_INET,
        socket.SOCK_STREAM,
        socket.IPPROTO_TCP,
        "",
        ("8.8.8.8", 443),
    )
    with patch(
        "app.infrastructure.ssrf_guard.socket.getaddrinfo",
        return_value=[fake],
    ):
        yield


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


def test_upload_then_get_returns_same_pdf_bytes(
    client_papers: TestClient,
) -> None:
    response = client_papers.post(
        "/v1/papers/upload",
        files={"file": ("thesis.pdf", MINIMAL_PDF, "application/pdf")},
    )
    assert response.status_code == 200
    data = response.json()
    assert "paper_id" in data
    assert data["filename"] == "thesis.pdf"
    assert data["size_bytes"] == len(MINIMAL_PDF)
    paper_id = data["paper_id"]

    get_resp = client_papers.get(f"/v1/papers/{paper_id}/file")
    assert get_resp.status_code == 200
    assert get_resp.headers["content-type"].startswith("application/pdf")
    assert get_resp.content == MINIMAL_PDF


def test_empty_upload_rejected(client_papers: TestClient) -> None:
    response = client_papers.post(
        "/v1/papers/upload",
        files={"file": ("empty.pdf", b"", "application/pdf")},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid PDF file"


def test_non_pdf_magic_rejected(client_papers: TestClient) -> None:
    response = client_papers.post(
        "/v1/papers/upload",
        files={"file": ("fake.pdf", b"not a pdf at all", "application/pdf")},
    )
    assert response.status_code == 400


def test_oversized_upload_rejected(
    tmp_path: Path,
) -> None:
    settings = Settings(
        environment="development",
        cors_allow_origins="",
        chat_mock_mode=True,
        papers_storage_dir=tmp_path / "papers",
        paper_max_upload_bytes=1024,
        paper_fetch_enabled=False,
    )
    client = TestClient(create_app(settings))
    big = MINIMAL_PDF + b"x" * 2000
    response = client.post(
        "/v1/papers/upload",
        files={"file": ("big.pdf", big, "application/pdf")},
    )
    assert response.status_code == 413


def test_unknown_paper_returns_404(client_papers: TestClient) -> None:
    rid = uuid4()
    response = client_papers.get(f"/v1/papers/{rid}/file")
    assert response.status_code == 404


def test_fetch_disabled_returns_403(tmp_path: Path) -> None:
    settings = Settings(
        environment="development",
        cors_allow_origins="",
        chat_mock_mode=True,
        papers_storage_dir=tmp_path / "papers",
        paper_fetch_enabled=False,
    )
    client = TestClient(create_app(settings))
    response = client.post(
        "/v1/papers/fetch",
        json={"url": "https://example.com/a.pdf"},
    )
    assert response.status_code == 403


def test_fetch_saves_pdf_and_is_retrievable(
    client_papers: TestClient,
    patch_public_dns_for_example_com: object,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "example.com"
        return httpx.Response(200, content=MINIMAL_PDF)

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    with patch(
        "app.services.paper_store.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        response = client_papers.post(
            "/v1/papers/fetch",
            json={"url": "https://example.com/paper.pdf"},
        )
    assert response.status_code == 200
    data = response.json()
    paper_id = data["paper_id"]
    get_resp = client_papers.get(f"/v1/papers/{paper_id}/file")
    assert get_resp.status_code == 200
    assert get_resp.content == MINIMAL_PDF


def test_fetch_redirect_response_is_rejected(
    client_papers: TestClient,
    patch_public_dns_for_example_com: object,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            302,
            headers={"Location": "https://127.0.0.1/nope"},
        )

    transport = httpx.MockTransport(handler)
    real_async_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    with patch(
        "app.services.paper_store.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        response = client_papers.post(
            "/v1/papers/fetch",
            json={"url": "https://example.com/redirect.pdf"},
        )
    assert response.status_code == 502


def test_fetch_non_200_rejected(
    client_papers: TestClient,
    patch_public_dns_for_example_com: object,
) -> None:
    transport = httpx.MockTransport(
        lambda r: httpx.Response(500, content=b"no"),
    )
    real_async_client = httpx.AsyncClient

    def client_factory(*args: object, **kwargs: object) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    with patch(
        "app.services.paper_store.httpx.AsyncClient",
        side_effect=client_factory,
    ):
        response = client_papers.post(
            "/v1/papers/fetch",
            json={"url": "https://example.com/broken.pdf"},
        )
    assert response.status_code == 502


def test_fetch_https_only_in_schema(client_papers: TestClient) -> None:
    response = client_papers.post(
        "/v1/papers/fetch",
        json={"url": "http://example.com/a.pdf"},
    )
    assert response.status_code == 422


def test_localhost_fetch_rejected_by_ssrf_guard(
    client_papers: TestClient,
) -> None:
    response = client_papers.post(
        "/v1/papers/fetch",
        json={"url": "https://localhost/evil.pdf"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "URL is not allowed"
