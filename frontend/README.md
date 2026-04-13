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
| `COST_ADMIN_BEARER` | **サーバのみ** | 運用コスト API（`GET`/`PUT`）と `/admin/cost` の保存で共用。`NEXT_PUBLIC_` **禁止**（[ADR-002](../docs/adr/ADR-002-cost-api-nextjs-route-handler.md)） |
| `COST_DATA_FILE` | **サーバのみ** | 任意。コスト JSON の保存パス。未設定時は `frontend/.data/cost-state.json`（`.gitignore` 対象） |

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

`PUT` の JSON は `{"version":1,"entries":[...]}` 形式（4 件固定）。`GET` の応答をそのまま編集して流し込むとよいです。

**Vercel**: 本番・プレビューそれぞれに `COST_ADMIN_BEARER` を設定してください。プレビュー環境に本番と同じトークンを入れると URL が推測されやすい場合にリスクになるため、プレビューは別トークンにするかアクセス制限（Vercel の保護機能等）を検討してください。

## API 型・契約の正（FE-1 / FE-2 / effective-typescript）

- **`GET /health` の JSON 契約**は **`lib/api/health.ts` の Zod スキーマ**を唯一の正とする（別ファイルで同じ形を手書きしない）。
- **`POST /v1/chat` の JSON 契約**は **`lib/api/chat.ts` の Zod スキーマ**を唯一の正とする。
- バックエンドの応答形を変える場合は、**FastAPI・pytest・上記 Zod**を同じ PR で更新する。

## バックエンド疎通（M1）

1. FastAPI を起動（例: `http://127.0.0.1:8000`）。ルートの `backend/README.md` を参照。
2. `frontend/.env.local` に `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` を設定。
3. `npm run dev` でトップページを開き、「バックエンド接続」が成功することを確認。

本番相当では、Vercel の `NEXT_PUBLIC_API_BASE_URL` に Railway（等）の API 公開 URL を設定する。

## 論文読解 UI（M3 / FE-3）

1. **`npm install`** 時に **postinstall** で `pdfjs-dist` から **`pdf.worker.min.mjs`** と **`standard_fonts/`**・**`wasm/`**・**`cmaps/`** を `public/` にコピーする（[ADR-006](../docs/adr/ADR-006-pdf-viewer-react-pdf.md)）。`react-pdf` の `<Document options={…}>` でこれらの URL を参照する。**生成物は `.gitignore` 対象**のため、クローン後は必ず `npm install` を実行すること。
2. 既定の **`public/sample.pdf`** は最小限の 1 ページ PDF。差し替え可。
3. 開発サーバーで **[http://localhost:3000/read](http://localhost:3000/read)** を開き、**PDF を主表示・チャットを右（狭い画面では下）** に確認する。

## チャット試用（M2 / FE-2）

1. バックエンドで `CHAT_MOCK_MODE=true`（または実 Bedrock 設定）と、ブラウザ経由なら `CORS_ALLOW_ORIGINS` に `http://localhost:3000` 等を含める。
2. `NEXT_PUBLIC_API_BASE_URL` を設定したうえでトップページの「試しに 1 往復」、または **`/read`** の補助チャットから送信し、アシスタント文が表示されることを確認する。

### CORS について

トップページの **ヘルス（FE-1）** は **Next.js サーバー（RSC）から `fetch` する**ため、ブラウザの CORS は発生しない。**チャット試用（FE-2）** は **クライアントから API を直接 `POST` する**ため、バックエンドの `CORS_ALLOW_ORIGINS` にフロントのオリジン（例: `http://localhost:3000`）を含め、`allow_methods` に `POST` が含まれる必要がある（[backend/README.md](../backend/README.md)・[ADR-005](../docs/adr/ADR-005-cors-allowlist.md)）。

## 品質ゲート

```bash
npm run lint
npm run build
```

`build` に型チェックが含まれる。TypeScript は `strict`（[段階実装（frontend）](../docs/段階実装（frontend）.md) FE-0）。

## デザイントークン

グローバルなスペーシング・カラー（Primary / Neutral / Semantic）は `app/globals.css` の CSS Variables と `@theme` を正とする。

## 参照ドキュメント

- [実装計画.md](../docs/実装計画.md)
- [段階実装（frontend）.md](../docs/段階実装（frontend）.md)
- [docs/adr/README.md](../docs/adr/README.md)
