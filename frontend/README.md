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
| `NEXT_PUBLIC_API_BASE_URL` | ブラウザ可 | バックエンド API の基底 URL |
| `ADMIN_COST_DASHBOARD_SECRET` 等 | **サーバのみ** | `NEXT_PUBLIC_` **禁止**。Route Handler からのみ参照（[ADR-002](../docs/adr/ADR-002-cost-api-nextjs-route-handler.md)） |

本番では [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables) に同じキー名で登録する。

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
