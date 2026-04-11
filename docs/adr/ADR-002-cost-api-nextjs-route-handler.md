# ADR-002: コスト API を Next.js Route Handler のみに置く

## Status

Accepted

## Context

- F4-3（運用コスト管理）は **管理 UI と永続化・集計 API** を要する（[実装計画.md](../実装計画.md) §6）。
- **秘密（管理用トークン・将来の Billing API キー）をブラウザに載せない**必要があるため、**サーバ側**でのみ扱うのが前提。
- 代替案として、**FastAPI（Railway）がコスト API をプロキシ**する構成も考えられる。

## Decision

**コスト関連の HTTP API（第 1 段階・第 2 段階とも）は FastAPI に実装せず、Next.js の Route Handler（`frontend` 上、Vercel のサーバ実行環境）にのみ置く。**

- 永続化（Supabase 等）・手入力 CRUD・合計・将来の **プロバイダ別自動取得**も、**Route Handler から呼ぶ server-only の TypeScript モジュール**で実装する。
- **Billing 用の資格情報**は **Vercel Environment Variables**（`NEXT_PUBLIC_*` にはしない）に置く。

## Consequences

### ポジティブ

- デプロイと変数が **コスト機能については Vercel に一元化**し、**Railway バックエンドを増やさず**に済む。
- 管理 UI と API が **同一 Next アプリ**内にあり、型共有がしやすい。

### ネガティブ

- **論文用バックエンド（Python）**と **コスト取得ロジック（TS）**が **言語が分断**する。第 2 段階の複雑な集計は **TS 側のテスト・設計責務**が増える。
- Vercel の **実行時間・タイムアウト**の制約を受ける（長時間バッチには向かない）。必要になったら **別ジョブ基盤**を新 ADR で検討する。

## Alternatives

| 案 | 却下理由（本プロジェクト） |
|----|---------------------------|
| **FastAPI がコスト API をプロキシ** | シークレット隠蔽は達成できるが、**個人検証の実装・デプロイ経路が二重**になり、**当面の速度**を優先して集約したい。 |
| **クライアントのみで外部 Billing を直叩き** | **API キー露出**のリスクが高く却下。 |

## Compliance

- `backend/` に ** `/admin/cost` 相当のルート**やコスト専用ルータを **新設しない**（論文・Bedrock・PDF 等の責務に集中）。
- レビューで **コスト用シークレットが `NEXT_PUBLIC_*` になっていないか**を確認する。

## Notes

- 記録日: 2026-04-14  
- 関連: [ADR-004](./ADR-004-f4-3-phased-delivery.md)
