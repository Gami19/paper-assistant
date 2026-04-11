# paper-assistant / backend

FastAPI バックエンド。Railway デプロイ想定。**Python 3.13** 専用（`pyproject.toml` / `.python-version`）。

## レイヤリング（拡張方針）

**HTTP 境界（ルータ・スキーマ）** → **ユースケース／ドメイン** → **外部クライアント（Bedrock・S3 等）** の依存方向を保つ。コスト用 Billing／集計の HTTP API は **ここに置かない**（[ADR-002](../docs/adr/ADR-002-cost-api-nextjs-route-handler.md)）。

## セットアップ（ローカル）

```bash
cd backend
python3.13 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
```

## 検証コマンド（手元で実行）

エージェント実装後の確認は **開発者が** 次を実行する。

```bash
cd backend
source .venv/bin/activate   # または conda activate py313
./scripts/run-pyright.sh      # または: pyright --pythonpath "$(which python)"
pytest
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Pyright**: `pyproject.toml` ではシェル変数を展開できないため、**どの Python（site-packages）を見るか**は `./scripts/run-pyright.sh` か `pyright --pythonpath <python実行ファイル>` で指定する。conda 固定なら `.env` に `PYRIGHT_PYTHON=.../envs/py313/bin/python` を書き、シェルで `export` してから同スクリプトを実行するか、`conda activate` 済みなら PATH の `python` で足りる。**本番（Railway 等）では Pyright は動かさないので `PYRIGHT_PYTHON` は不要。**
- 本番相当: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`（Railway が `PORT` を渡す）

## 環境変数

`cp .env.example .env` して編集。README や `.env.example` に **実値・秘密を書かない**。

### BE-1（疎通・CORS）

| 変数 | 必須 | 説明 |
|------|------|------|
| `ENVIRONMENT` | いいえ | `development`（既定）または `production`。`production` のとき `/docs`・`/redoc` を無効化。 |
| `CORS_ALLOW_ORIGINS` | **production では必須** | 許可するブラウザのオリジンを **カンマ区切り**（例: `https://xxx.vercel.app,http://localhost:3000`）。空のときは **CORS ミドルウェアを付けない**（Next.js サーバーからの `fetch` のみで足りる場合）。 |

`ENVIRONMENT=production` かつ `CORS_ALLOW_ORIGINS` が空だと **起動時に失敗**する（設定ミス検出）。詳細は [ADR-005](../docs/adr/ADR-005-cors-allowlist.md)。

## Railway（use-railway）

| 項目 | 推奨 |
|------|------|
| **Root Directory** | `backend` |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT`（環境に合わせて調整） |
| **Build** | `pip install -r requirements.txt`（本番は dev 不要） |
| **Healthcheck Path** | `/health`（Railway サービス設定の HTTP healthcheck と整合） |

**Variables（本番例）**: `ENVIRONMENT=production`、`CORS_ALLOW_ORIGINS=https://<your-vercel-app>.vercel.app`（プレビュー URL を使う場合はカンマで追加）。変更後は `railway variable list --json` 等で読み戻し確認（[実装計画.md](../docs/実装計画.md) §5.4）。

**デプロイ後の確認**: `curl -sS https://<railway-public-url>/health` で `{"status":"ok",...}` を確認。失敗時は **`railway logs`** でビルド失敗とランタイム失敗を切り分ける。

**命名**: プロジェクト名はリポジトリ名 `paper-assistant` に揃え、サービス名は `backend` または `api` など **1 環境 1 役割**で短く保つ。複数サービス時は `railway logs --service <name>` で取り違えないよう、ダッシュボード URL の **Project / Service ID を正**とする（[use-railway スキル](../.cursor/skills/use-railway/SKILL.md)）。

## 依存関係

| ファイル | 用途 |
|----------|------|
| `requirements.txt` | 本番（FastAPI / Uvicorn / Pydantic） |
| `requirements-dev.txt` | 開発（pytest / httpx / pyright） |

## 参照

- [実装計画.md](../docs/実装計画.md)
- [段階実装（backend）.md](../docs/段階実装（backend）.md)
- [docs/adr/README.md](../docs/adr/README.md)
