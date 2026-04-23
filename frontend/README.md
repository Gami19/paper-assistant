# paper-assistant / frontend

Next.js（App Router）フロントエンド。Vercel デプロイ想定。

## レイヤリング方針（software-architecture）

**表示**（ページ・コンポーネント）、**データ取得**（Route Handler またはクライアントの薄いフック）、**ドメインに近い型・検証**の責務を混ぜない。外部 JSON は**境界で検証**し（例: Zod）、コンポーネント深部に `unknown` を垂れ流さない。

## セットアップ

```bash
npm install
cp .env.example .env.local
# .env.local を編集（NEXT_PUBLIC_* はブラウザに露出する）
npm run dev
```

開発サーバー: [http://localhost:3000](http://localhost:3000)

## 環境変数

| 変数 | 公開範囲 | 説明 |
|------|----------|------|
| `NEXT_PUBLIC_API_BASE_URL` | ブラウザ可 | バックエンド API の基底 URL（末尾スラッシュの有無は正規化される） |
| `NEXT_PUBLIC_DEBUG_FIG_RECT` | ブラウザ可 | `true` のとき、`/read` の図・表矩形選択で API 画像と `naturalWidth/Height` の一致（OK/NG）などを表示（開発用） |
| `NEXT_PUBLIC_PAPER_PAGE_IMAGE_SCALE` | ブラウザ可 | 任意。`GET /v1/papers/{id}/pages/{page}/image?scale=` に送る値。未設定時は **2**（バックエンド既定と一致させること） |
| `COST_ADMIN_BEARER` | **サーバのみ** | 運用コスト API（`GET`/`PUT`）と `/admin/cost` の保存で共用。`NEXT_PUBLIC_` **禁止**（[ADR-002](../docs/adr/ADR-002-cost-api-nextjs-route-handler.md)） |
| `COST_DATA_FILE` | **サーバのみ** | 任意。コスト JSON の保存パス。未設定時は `frontend/.data/cost-state.json`（`.gitignore` 対象） |

### 第 2 段階（自動取得・任意）

| 変数 | 説明 |
|------|------|
| `COST_SYNC_VERCEL_TOKEN` / `COST_SYNC_VERCEL_TEAM_ID` | Vercel REST（Billing charges）。未設定なら当該行はスキップ。 |
| `COST_SYNC_RAILWAY_TOKEN` | Railway GraphQL 疎通。請求 USD は公開 API で取らない実装のため、金額は更新されません。 |
| `COST_SYNC_SUPABASE_ACCESS_TOKEN` / `COST_SYNC_SUPABASE_ORG_ID` | Management API。同上で金額は更新されない場合があります。 |
| `COST_SYNC_AWS_ACCESS_KEY_ID` / `COST_SYNC_AWS_SECRET_ACCESS_KEY` | Cost Explorer（`ce:GetCostAndUsage`）。未設定時は `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` にフォールバック。**バックエンド用キーと分離したい場合は COST_SYNC_AWS_* を推奨。** |

本番では [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) に同じキー名で登録する。

## 運用コスト管理（FE-4 / F4-3 第 1 段階）

1. `.env.local` に `COST_ADMIN_BEARER` を**推測困難な値**で設定し、開発サーバーを再起動する。
2. ブラウザで **[http://localhost:3000/admin/cost](http://localhost:3000/admin/cost)** を開く（メインナビからはリンクしていません。URL の推測を難しくするため、ブックマークまたは README のみで共有してください）。
3. 画面上部のトークン欄に、`.env.local` と同じ値を入力し、各カードの月額（USD）・メモを編集して「保存」する。

**curl 例**（ベース URL とトークンは置き換え）:

```bash
curl -sS -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/admin/cost
curl -sS -X PUT -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d @cost-state.json \
  http://localhost:3000/api/admin/cost
```

`PUT` の JSON は `{"version":1,"entries":[...]}` または `version: 2`（任意 `lastSync`）で 4 件固定。`GET` の応答をそのまま編集して流し込むとよいです。

**第 2 段階・同期 API**（Bearer 必須。トークンを URL やログに残さないこと）:

```bash
curl -sS -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/admin/cost/sync
```

応答には `lastSync`（プロバイダ別の成功／スキップ／失敗）と更新後の `entries` が含まれます。管理画面 `/admin/cost` の「自動取得」からも同じ処理を Server Action で実行できます。

**Vercel**: 本番・プレビューそれぞれに `COST_ADMIN_BEARER` を設定してください。プレビュー環境に本番と同じトークンを入れると URL が推測されやすい場合にリスクになるため、プレビューは別トークンにするかアクセス制限（Vercel の保護機能等）を検討してください。

## API 型・契約の正（FE-1 / FE-2 / effective-typescript）

- **`GET /health` の JSON 契約**は **`lib/api/health.ts` の Zod スキーマ**を唯一の正とする（別ファイルで同じ形を手書きしない）。
- **`POST /v1/chat` の JSON 契約**は **`lib/api/chat.ts` の Zod スキーマ**を唯一の正とする（`messages` 複数ターン・任意 `paper_excerpt` を含む）。
- **`POST /v1/papers/upload`** および **`POST /v1/papers/{paper_id}/summarize`** の JSON 契約は **`lib/api/papers.ts` の Zod スキーマ**を唯一の正とする。
- **ページ画像 `GET /v1/papers/{paper_id}/pages/{page}/image`** の呼び出し・`X-Paper-*` ヘッダの解釈は **`lib/api/paper-pages.ts`** を正とする（PNG Blob・ヘッダ検証）。
- **`POST /v1/chat/vision`** のリクエスト形・応答形は **`lib/api/chat.ts`** の `fetchChatVisionReply` / `ChatVisionRequestPayload`（**`selections` 配列**）を正とする（応答 JSON は `POST /v1/chat` と同一）。
- **ページ本文プレビュー**（±1）用の **`GET /v1/papers/.../pages/{page}/text?context=pm1`** は **`lib/api/paper-pages.ts`** の `fetchPaperPageText` を正とする。
- バックエンドの応答形を変える場合は、**FastAPI・pytest・上記 Zod**を同じ PR で更新する。

## バックエンド疎通（M1）

1. FastAPI を起動（例: `http://127.0.0.1:8000`）。ルートの `backend/README.md` を参照。
2. `frontend/.env.local` に `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` を設定。
3. `npm run dev` でトップページを開き、「バックエンド接続」が成功することを確認。

本番相当では、Vercel の `NEXT_PUBLIC_API_BASE_URL` に Railway（等）の API 公開 URL を設定する。

## 論文読解 UI（M5 / FE-5）

1. **`npm install`** 時に **postinstall** で `pdfjs-dist` から **`pdf.worker.min.mjs`** と **`standard_fonts/`**・**`wasm/`**・**`cmaps/`** を `public/` にコピーする（[ADR-006](../docs/adr/ADR-006-pdf-viewer-react-pdf.md)）。`react-pdf` の `<Document options={…}>` でこれらの URL を参照する。**生成物は `.gitignore` 対象**のため、クローン後は必ず `npm install` を実行すること。
2. 既定の **`public/sample.pdf`** は最小限の 1 ページ PDF。差し替え可。
3. 開発サーバーで **[http://localhost:3000/read](http://localhost:3000/read)** を開き、**PDF を主表示・要約＋ Q&A を右（狭い画面では下）** を確認する。
4. **`PDF を開く（アップロード）`** で選んだファイルは **`POST /v1/papers/upload`** へ送られ、返却 `paper_id` で **`GET …/v1/papers/{id}/file`** を `react-pdf` に読ませる。**要約**は **`POST /v1/papers/{id}/summarize`**、**Q&A** は会話履歴つき **`POST /v1/chat`**（任意で **`paper_excerpt`** に PDF 上の選択テキスト）。サンプル／URL から開いただけの場合は `paper_id` が無いため要約は無効・チャットは警告付きで利用可能。

### 図・表の矩形選択（フェーズ B / Step 3）

1. バックエンドが **ページ画像 API**（`GET …/pages/{page}/image`）を提供していること（[backend/README.md](../backend/README.md)）。
2. **`図・表を選択`** を押すと、メイン表示が **API が返すページ PNG**（`NEXT_PUBLIC_PAPER_PAGE_IMAGE_SCALE`、既定 **2**）に切り替わり、ドラッグで **image_px** の矩形と **切り抜きプレビュー**が得られます。`react-pdf` の表示ズームとは独立した座標系です。
3. 任意で **`NEXT_PUBLIC_DEBUG_FIG_RECT=true`** とし、`X-Paper-Width` / `Height` とブラウザの `naturalWidth` / `Height` が一致するか確認します（設計メモ §9）。
4. ブラウザから API を直接叩くため、**`CORS_ALLOW_ORIGINS`** にフロントのオリジンを含めてください。

### 図・表 Vision Q&A（フェーズ C / Step 4）

1. アップロード済み `paper_id` で **図・表の矩形が参照スタックに 1 件以上**あると、論文 Q&A は **`POST /v1/chat/vision`** に送信されます（本文 ±1 とクロップ画像はサーバー側で合成）。
2. **`scale`** はページ画像 API と同じ値（`NEXT_PUBLIC_PAPER_PAGE_IMAGE_SCALE`）にしてください。
3. バックエンドの **`BEDROCK_MODEL_ID`** は **画像入力に対応したモデル**が必要です。

### 参照スタック・Fig 上限・本文プレビュー（フェーズ D / Step 5）

1. 図選択モードで矩形を確定したら **「参照に追加」** でスタックに載せます（任意の **図ラベル**、例: Fig.1）。**複数ページ・複数矩形**を同一会話から送れます。
2. 参照数の上限は **`CHAT_VISION_MAX_FIGURES`（バックエンド、既定 3）** と、フロント表示用の **`NEXT_PUBLIC_CHAT_VISION_MAX_FIGURES`（任意、1〜10 にクランプ）** を揃えてください。超過時は UI でブロックし、API は **422** を返します。
3. チャット欄の **チップ**から参照を削除でき、**「本文プレビュー（±1 ページ）」** は `GET .../text?context=pm1` を読み取り表示します（折りたたみ）。
4. **ページ移動・論文切替・会話クリア**で参照スタックはリセットされます。

## チャット試用（M2 / FE-2）

1. バックエンドで `CHAT_MOCK_MODE=true`（または実 Bedrock 設定）と、ブラウザ経由なら `CORS_ALLOW_ORIGINS` に `http://localhost:3000` 等を含める。
2. `NEXT_PUBLIC_API_BASE_URL` を設定したうえでトップページの「試しに 1 往復」から送信するか、**`/read`** の **論文 Q&A** で複数ターン＋抜粋を試し、アシスタント文が表示されることを確認する。

### CORS について

トップページの **ヘルス（FE-1）** は **Next.js サーバー（RSC）から `fetch` する**ため、ブラウザの CORS は発生しない。**チャット試用（FE-2）** は **クライアントから API を直接 `POST` する**ため、バックエンドの `CORS_ALLOW_ORIGINS` にフロントのオリジン（例: `http://localhost:3000`）を含め、`allow_methods` に `POST` が含まれる必要がある（[backend/README.md](../backend/README.md)・[ADR-005](../docs/adr/ADR-005-cors-allowlist.md)）。

## 品質ゲート

```bash
npm run lint
npm run test
npm run build
```

`build` に型チェックが含まれる。TypeScript は `strict`（[段階実装（frontend）](../docs/段階実装（frontend）.md) FE-0）。

## デザイントークン

グローバルなスペーシング・カラー（Primary / Neutral / Semantic）は `app/globals.css` の CSS Variables と `@theme` を正とする。

## 参照ドキュメント

- [実装計画.md](../docs/実装計画.md)
- [段階実装（frontend）.md](../docs/段階実装（frontend）.md)
- [docs/adr/README.md](../docs/adr/README.md)
