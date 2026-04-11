"""HTTP 境界。BE-1 以降でルータ・設定を分離し、ユースケースと外部クライアント（Bedrock 等）へ依存を向ける。

コスト用 HTTP API は FastAPI に置かない（docs/adr/ADR-002-cost-api-nextjs-route-handler.md）。
"""

from fastapi import FastAPI

app = FastAPI(title="paper-assistant", version="0.1.0")


@app.get("/")
def read_root() -> dict[str, str]:
    """BE-0 プレースホルダ。BE-1 で /health 等と整理する。"""
    return {"service": "paper-assistant", "phase": "BE-0"}


@app.get("/health")
def health() -> dict[str, str]:
    """M1 疎通・監視用。フロント契約は frontend/lib/api/health.ts の Zod と整合させる。"""
    return {"status": "ok", "service": "paper-assistant"}
