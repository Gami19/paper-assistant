import type { CostEntry, CostProviderId, CostSyncRecord } from "./schema";

/** プロバイダ 1 件の取得結果（判別可能ユニオン） */
export type AdapterResult =
  | { status: "skipped"; providerId: CostProviderId; reason: string }
  | {
      status: "success";
      providerId: CostProviderId;
      amountUsd: number;
      note?: string;
    }
  | {
      status: "failure";
      providerId: CostProviderId;
      message: string;
      code?: string;
    };

function applySuccessMerge(
  entry: CostEntry,
  amountUsd: number,
  today: string,
  note?: string,
): CostEntry {
  const tag = `[自動取得 ${today}]`;
  const line = note ? `${tag} ${amountUsd} USD — ${note}` : `${tag} ${amountUsd} USD`;
  const memo =
    entry.memo.trim() === ""
      ? line
      : entry.memo.includes(tag)
        ? entry.memo
        : `${entry.memo}\n${line}`;
  return {
    ...entry,
    monthlyUsd: amountUsd,
    updatedAt: today,
    memo,
  };
}

/** 取得成功の行のみ月額を上書き。それ以外は既存行を維持。 */
export function mergeCostEntriesWithAdapterResults(
  entries: readonly CostEntry[],
  adapterResults: readonly AdapterResult[],
  today: string,
): CostEntry[] {
  const byId = new Map<CostProviderId, AdapterResult>();
  for (const r of adapterResults) {
    byId.set(r.providerId, r);
  }
  return entries.map((e) => {
    const r = byId.get(e.providerId);
    if (!r || r.status !== "success") return e;
    return applySuccessMerge(e, r.amountUsd, today, r.note);
  });
}

/** 全体ステータス: 全 skipped → success。1 件でも success かつ 1 件でも failure → partial。success が 0 で failure が 1 件以上 → failure。 */
export function computeAggregateStatus(
  results: readonly AdapterResult[],
): "success" | "partial" | "failure" {
  const successN = results.filter((r) => r.status === "success").length;
  const failureN = results.filter((r) => r.status === "failure").length;
  if (failureN === 0) return "success";
  if (successN > 0) return "partial";
  return "failure";
}

export function adapterResultsToSyncLines(
  results: readonly AdapterResult[],
): CostSyncRecord["results"] {
  return results.map((r) => {
    switch (r.status) {
      case "skipped":
        return {
          providerId: r.providerId,
          kind: "skipped" as const,
          message: r.reason,
        };
      case "success":
        return {
          providerId: r.providerId,
          kind: "success" as const,
          message: r.note ?? "取得済み",
          amountUsd: r.amountUsd,
        };
      case "failure":
        return {
          providerId: r.providerId,
          kind: "failure" as const,
          message: r.message,
        };
    }
  });
}

export function buildCostSyncRecord(
  results: readonly AdapterResult[],
  attemptedAt: string,
): CostSyncRecord {
  return {
    attemptedAt,
    aggregateStatus: computeAggregateStatus(results),
    results: adapterResultsToSyncLines(results),
  };
}
