# Architecture Decision Records（ADR）

本ディレクトリは **アーキテクチャ上の重要な決定**を短く記録する。形式は [実装計画.md](../実装計画.md) §5.1 に沿い、**Context / Decision / Consequences / Alternatives** を基本とする。

| ID | タイトル | ステータス |
|----|----------|------------|
| [ADR-001](./ADR-001-single-repository.md) | 単一リポジトリ（`frontend/` / `backend/`） | Accepted |
| [ADR-002](./ADR-002-cost-api-nextjs-route-handler.md) | コスト API を Next.js Route Handler のみに置く | Accepted |
| [ADR-003](./ADR-003-auth-deferred-phase1.md) | Phase 1 で認証・本格認可を保留する | Accepted |
| [ADR-004](./ADR-004-f4-3-phased-delivery.md) | F4-3 を第 1 段階と第 2 段階に分ける | Accepted |

新規 ADR は連番で追加し、過去の決定を置き換える場合は **Status: Superseded by ADR-NNN** を明記する。
