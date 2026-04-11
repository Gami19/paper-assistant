"""HTTP 境界。アプリ生成は create_app に集約（テストで Settings を注入可能）。

コスト用 HTTP API は FastAPI に置かない（docs/adr/ADR-002-cost-api-nextjs-route-handler.md）。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    openapi_disabled = settings.environment == "production"
    app = FastAPI(
        title="paper-assistant",
        version="0.1.0",
        docs_url=None if openapi_disabled else "/docs",
        redoc_url=None if openapi_disabled else "/redoc",
    )

    origins = settings.cors_origin_list()
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["GET", "OPTIONS"],
            allow_headers=["Accept", "Content-Type", "Authorization"],
        )

    @app.get("/")
    def read_root() -> dict[str, str]:
        """BE-0 プレースホルダ。BE-2 以降で整理する。"""
        return {"service": "paper-assistant", "phase": "BE-0"}

    @app.get("/health")
    def health() -> dict[str, str]:
        """M1 疎通・監視・Railway Healthcheck。フロント契約は frontend/lib/api/health.ts と整合。"""
        return {"status": "ok", "service": "paper-assistant"}

    return app


app = create_app()
