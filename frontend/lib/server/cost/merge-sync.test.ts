import { describe, expect, it } from "vitest";

import {
  buildCostSyncRecord,
  computeAggregateStatus,
  mergeCostEntriesWithAdapterResults,
  type AdapterResult,
} from "./merge-sync";
import type { CostEntry } from "./schema";

function entry(
  id: CostEntry["providerId"],
  monthlyUsd: number | null,
  memo = "",
): CostEntry {
  return {
    providerId: id,
    label: id,
    billingUrl: "https://example.com",
    monthlyUsd,
    memo,
    updatedAt: "2025-01-01",
  };
}

describe("mergeCostEntriesWithAdapterResults", () => {
  it("上書きするのは success のプロバイダのみ", () => {
    const before = [
      entry("vercel", 10, "keep"),
      entry("railway", 20, "r"),
      entry("supabase", null, ""),
      entry("aws", 5, ""),
    ];
    const results: AdapterResult[] = [
      { status: "success", providerId: "vercel", amountUsd: 99 },
      {
        status: "failure",
        providerId: "railway",
        message: "API エラー",
      },
      { status: "skipped", providerId: "supabase", reason: "未設定" },
      { status: "success", providerId: "aws", amountUsd: 7, note: "CE" },
    ];
    const merged = mergeCostEntriesWithAdapterResults(
      before,
      results,
      "2026-04-11",
    );
    expect(merged.find((e) => e.providerId === "vercel")?.monthlyUsd).toBe(
      99,
    );
    expect(merged.find((e) => e.providerId === "railway")?.monthlyUsd).toBe(
      20,
    );
    expect(merged.find((e) => e.providerId === "supabase")?.monthlyUsd).toBe(
      null,
    );
    expect(merged.find((e) => e.providerId === "aws")?.monthlyUsd).toBe(7);
    expect(merged.find((e) => e.providerId === "vercel")?.updatedAt).toBe(
      "2026-04-11",
    );
    expect(merged.find((e) => e.providerId === "railway")?.updatedAt).toBe(
      "2025-01-01",
    );
  });
});

describe("computeAggregateStatus", () => {
  it("全 skipped は success", () => {
    const r: AdapterResult[] = [
      { status: "skipped", providerId: "vercel", reason: "a" },
      { status: "skipped", providerId: "railway", reason: "b" },
      { status: "skipped", providerId: "supabase", reason: "c" },
      { status: "skipped", providerId: "aws", reason: "d" },
    ];
    expect(computeAggregateStatus(r)).toBe("success");
  });

  it("success と failure が混在なら partial", () => {
    const r: AdapterResult[] = [
      { status: "success", providerId: "vercel", amountUsd: 1 },
      { status: "failure", providerId: "railway", message: "x" },
      { status: "skipped", providerId: "supabase", reason: "y" },
      { status: "skipped", providerId: "aws", reason: "z" },
    ];
    expect(computeAggregateStatus(r)).toBe("partial");
  });

  it("success が無く failure のみなら failure", () => {
    const r: AdapterResult[] = [
      { status: "failure", providerId: "vercel", message: "a" },
      { status: "failure", providerId: "railway", message: "b" },
      { status: "skipped", providerId: "supabase", reason: "c" },
      { status: "skipped", providerId: "aws", reason: "d" },
    ];
    expect(computeAggregateStatus(r)).toBe("failure");
  });
});

describe("buildCostSyncRecord", () => {
  it("結果行と aggregateStatus を組み立てる", () => {
    const r: AdapterResult[] = [
      { status: "success", providerId: "vercel", amountUsd: 12 },
      { status: "skipped", providerId: "railway", reason: "未設定" },
    ];
    const rec = buildCostSyncRecord(r, "2026-04-11T00:00:00.000Z");
    expect(rec.attemptedAt).toBe("2026-04-11T00:00:00.000Z");
    expect(rec.aggregateStatus).toBe("success");
    expect(rec.results).toHaveLength(2);
    expect(rec.results[0]?.kind).toBe("success");
    expect(rec.results[0]?.amountUsd).toBe(12);
  });
});
