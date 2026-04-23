# paper-assistant / backend

FastAPI バックエンド。Railway デプロイ想定。**Python 3.13** 専用（`pyproject.toml` / `.python-version`）。

## レイヤリング（拡張方針）

**HTTP 境界（ルータ・スキーマ）** → **ユースケース（`app/services/`）** → **ポート（`app/ports/` の Protocol）** → **インフラ（`app/infrastructure/`）** の依存方向を保つ。コスト用 Billing／集計の HTTP API は **ここに置かない**（[ADR-002](../docs/adr/ADR-002-cost-api-nextjs-route-handler.md)）。

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

ブラウザから `GET .../pages/{page}/image` を直接 `fetch` する場合、カスタムヘッダ **`X-Paper-*` は `Access-Control-Expose-Headers` で公開**しないとクライアントが読めない（`main.py` の `CORSMiddleware` で指定）。

### BE-2（M2 チャット最小）

| 変数 | 必須 | 説明 |
|------|------|------|
| `CHAT_MOCK_MODE` | いいえ | `true` のとき Bedrock を呼ばず `[mock] …` 形式で応答。**`ENVIRONMENT=production` では `true` 禁止**（起動失敗）。 |
| `AWS_REGION` | いいえ | Bedrock クライアント用リージョン（既定 `ap-northeast-1`）。 |
| `BEDROCK_MODEL_ID` | **production でモック OFF のとき必須** | 例: `anthropic.claude-3-5-haiku-20241022-v1:0`。空のまま本番・非モックだと起動失敗。 |
| `BEDROCK_CONNECT_TIMEOUT_SECONDS` | いいえ | boto3 の接続タイムアウト秒（既定 `10`、1〜300）。 |
| `BEDROCK_READ_TIMEOUT_SECONDS` | いいえ | boto3 の読み取りタイムアウト秒（既定 `120`、1〜600）。長文推論では増やす余地あり。 |
| `CHAT_VISION_MAX_FIGURES` | いいえ | `POST /v1/chat/vision` の **selections 最大件数**（既定 `3`、1〜10）。超過時 **422**（`Too many figure selections`）。 |

**エンドポイント**: `POST /v1/chat` — リクエスト JSON は `{ "messages": [ { "role": "user"|"assistant", "content": "…" }, … ], "paper_excerpt": "…"（任意） }`（先頭は `user`、交互などバリデーションあり）、レスポンスは `{ "role": "assistant", "content": "…" }`。プロンプト全文・抜粋本文はログに出さない。

**Vision（フェーズ C / D）**: `POST /v1/chat/vision` — `{ "messages": …, "paper_id": UUID, "selections": [ { "page": 1-based, "scale": 数値（GET …/pages/{page}/image と同一）, "rect": { "x","y","w","h", "unit":"image_px" }, "figure_label": 任意 }, … ] }`（`selections` は 1 件以上、スキーマ上は最大 10 件まで受け付け、**環境変数 `CHAT_VISION_MAX_FIGURES` 以下**でなければならない）。サーバーは **参照ページごとに ±1 本文**をマージし、**各 selection ごとの矩形クロップ PNG**（順序は `selections` 順）を Bedrock **Converse** に **複数画像の後に最終 user テキスト**で送る。**`BEDROCK_MODEL_ID` はマルチモーダル対応**（例: Claude 3 系）を前提とする（テキスト専用 ID では `ValidationException` になり得る）。依存に **`pillow`**（`requirements.txt`）。モック時は `[mock] vision:…`。

**ローカル E2E（モック）**:

1. `.env` に `CHAT_MOCK_MODE=true`、フロントからブラウザ直 `fetch` する場合は `CORS_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000`。
2. `uvicorn` 起動後:  
   `curl -sS -X POST http://127.0.0.1:8000/v1/chat -H 'Content-Type: application/json' -d '{"messages":[{"role":"user","content":"hello"}]}'`

**実 Bedrock**: `CHAT_MOCK_MODE=false`（または未設定）にし、**`AWS_REGION`**（またはアプリ既定）と **`BEDROCK_MODEL_ID`** を設定する。認証は **boto3 の IAM（SigV4）標準チェーン**を前提とする: 本番は **IAM ロール**（推奨）、ローカルは **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`**（必要なら `AWS_SESSION_TOKEN`）または **`AWS_PROFILE`**。補足として Bedrock の **API キー** `AWS_BEARER_TOKEN_BEDROCK` も SDK が解釈する場合がある（[公式](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html)）。**コンソール Quickstart の `OPENAI_API_KEY` + `OPENAI_BASE_URL`（OpenAI 互換 Mantle）は本アプリ未使用**（`bedrock-runtime` の `Converse` を直接呼ぶため）。詳細は `backend/.env.example`。**レート制限**（`ThrottlingException` / `TooManyRequestsException`）のときは **429** と日本語の再試行メッセージを返す。その他の Bedrock クライアントエラーは **502**（汎用メッセージ）。**サーバーログ**に `error_code`・`region`・`model_id`・AWS の短い `aws_message` を出す（プロンプト本文はログに出ない）。スロットリング時はログレベルは **warning**。タイムアウトは上記 `BEDROCK_*_TIMEOUT` で調整。

**POST /v1/chat が 502 のとき（ローカル）**: ログ行 `bedrock_converse_client_error` の **`error_code`** を見る。例: **`AccessDeniedException`** → IAM に `bedrock:Converse`（およびモデル・リージョンに応じたリソース）を付与する。[マネージドポリシー例](https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam-awsmanpol.html)。**`ValidationException`** → `BEDROCK_MODEL_ID` がそのリージョンで無効な ID になっていないか確認。**モデル利用申請**が未完了のリージョン／モデルでは利用できない場合がある（[モデルアクセス](https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html)）。**フロントの `NEXT_PUBLIC_API_BASE_URL`** は API のホスト（例: `http://127.0.0.1:8000`）。**`CORS_ALLOW_ORIGINS`** にはブラウザのオリジン（例: `http://localhost:3000`）を含める。`OPTIONS 200` で `POST 502` なら CORS は通っており、原因は Bedrock 側が多い。

**リトライ**: 現状は SDK 既定の挙動に任せる。指数バックオフ等を集約する場合は ADR に方針を残してから実装する。

### BE-3（M3 論文 PDF）

| 変数 | 必須 | 説明 |
|------|------|------|
| `PAPERS_STORAGE_DIR` | いいえ | PDF 保管ディレクトリ。未設定・空なら `backend/data/papers`。 |
| `PAPER_MAX_UPLOAD_BYTES` | いいえ | アップロード最大サイズ（既定約 20MB、1024〜128MB）。 |
| `PAPER_FETCH_ENABLED` | いいえ | `false` のとき `POST /v1/papers/fetch` は **403**。**本番では `false` 推奨**（公開 SSRF 面の低減）。 |
| `PAPER_FETCH_TIMEOUT_SECONDS` | いいえ | fetch のタイムアウト（既定 30、1〜120）。 |
| `PAPER_FETCH_MAX_BYTES` | いいえ | fetch 応答ボディ上限（既定約 20MB）。 |
| `PAPER_FETCH_HOST_ALLOWLIST` | いいえ | 空=HTTPS・IP 検査のみ。非空=カンマ区切りの許可ホスト（サフィックス一致）。 |
| `PAPER_GC_MAX_AGE_SECONDS` | いいえ | 保存成功後に **これより古い mtime の `*.pdf` を削除**（既定 86400 秒）。 |
| `PAPER_PAGE_IMAGE_SCALE_MIN` | いいえ | `GET .../pages/{page}/image` の `scale` クエリ下限（既定 `0.5`）。 |
| `PAPER_PAGE_IMAGE_SCALE_MAX` | いいえ | 同上・上限（既定 `4.0`）。 |
| `PAPER_PAGE_IMAGE_MAX_PIXELS` | いいえ | 1 ページ pixmap の `width*height` 上限。超過時 **413**（既定 25_000_000）。 |
| `PAPER_PAGE_NEIGHBOR_TEXT_MAX_CHARS` | いいえ | `GET .../text?context=pm1` の結合テキスト最大文字数（既定 120_000）。 |

### BE-5（M5 MVP：抽出・要約・マルチターン）

| 変数 | 必須 | 説明 |
|------|------|------|
| `PAPER_EXTRACT_MAX_PAGES` | いいえ | PDF から読む最大ページ数（サーバー要約・抽出の上限）。 |
| `PAPER_EXTRACT_MAX_CHARS` | いいえ | 抽出テキストの最大文字数（超過分は切り詰め、`truncated_source` で通知）。 |

**エンドポイント**:

- `POST /v1/papers/upload` — `multipart/form-data`、フィールド名 **`file`**。成功時 `{ "paper_id", "filename", "size_bytes" }`。
- `GET /v1/papers/{paper_id}/file` — `application/pdf`（`paper_id` は UUID）。**ブラウザの `react-pdf` から CORS 付き GET で読む**想定。
- `POST /v1/papers/{paper_id}/summarize` — 保存 PDF からテキスト抽出し、構造化要約（日本語フィールド）を JSON で返す。長大 PDF は切り詰め後に要約（`truncated_source: true`）。
- `POST /v1/papers/fetch` — JSON `{ "url": "https://..." }`。**リダイレクトは追従しない**（[ADR-007](../docs/adr/ADR-007-be3-paper-pdf-local-storage.md)）。
- `GET /v1/papers/{paper_id}/pages/{page}/image` — クエリ **`scale`**（既定 `2.0`、設定の min/max でクランプ）。**PNG**（`image/png`）。レスポンスヘッダに `X-Paper-Page`, `X-Paper-Scale`, `X-Paper-Width`, `X-Paper-Height`。**PyMuPDF** でレンダリング。
- `GET /v1/papers/{paper_id}/pages/{page}/text` — クエリ **`context`**: `page`（単ページ）または `pm1`（対象ページ ±1 を結合）。JSON: `text`, `page`, `total_pages`, `pages_included`, `truncated`。

**ローカル curl（アップロード→取得）**:

```bash
curl -sS -X POST http://127.0.0.1:8000/v1/papers/upload -F "file=@/path/to/paper.pdf"
# 返却 JSON の paper_id を使う
curl -sS -o out.pdf http://127.0.0.1:8000/v1/papers/<paper_id>/file
```

**Railway**: ローカルディスクは **エフェメラル**（再起動で PDF は消える）。S3 等への移行は別 ADR。

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
| `requirements.txt` | 本番（FastAPI / Uvicorn / Pydantic / httpx / python-multipart / boto3 / pypdf / pymupdf） |
| `requirements-dev.txt` | 開発（pytest / httpx / pyright） |

## 参照

- [実装計画.md](../docs/実装計画.md)
- [段階実装（backend）.md](../docs/段階実装（backend）.md)
- [docs/adr/README.md](../docs/adr/README.md)
