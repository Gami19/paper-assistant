import "server-only";

import { z } from "zod";

import type { AdapterResult } from "../merge-sync";
import { combineAbortSignals } from "./common";

const lineSchema = z
  .object({
    BilledCost: z.number(),
    BillingCurrency: z.string().optional(),
  })
  .passthrough();

/** `to` は Vercel API 仕様どおり exclusive（翌日 00:00 UTC 未満まで含める） */
function monthRangeUtc(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const toExclusive = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return {
    from: start.toISOString(),
    to: toExclusive.toISOString(),
  };
}

/** FOCUS 行を JSONL から集計（Vercel /v1/billing/charges） */
export async function fetchVercelMonthlyUsd(
  parentSignal: AbortSignal,
): Promise<AdapterResult> {
  const providerId = "vercel" as const;
  const token = process.env.COST_SYNC_VERCEL_TOKEN?.trim();
  const teamId = process.env.COST_SYNC_VERCEL_TEAM_ID?.trim();
  if (!token) {
    return {
      status: "skipped",
      providerId,
      reason:
        "COST_SYNC_VERCEL_TOKEN が未設定です。設定後も Team の Billing 権限が必要です。",
    };
  }
  if (!teamId) {
    return {
      status: "skipped",
      providerId,
      reason:
        "COST_SYNC_VERCEL_TEAM_ID が未設定です（api.vercel.com の teamId）。",
    };
  }

  const { from, to } = monthRangeUtc();
  const url = new URL("https://api.vercel.com/v1/billing/charges");
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);
  url.searchParams.set("teamId", teamId);

  const signal = combineAbortSignals(parentSignal);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/jsonl, application/x-ndjson, */*",
      },
      signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "通信に失敗しました";
    return {
      status: "failure",
      providerId,
      message: `Vercel API に接続できませんでした（${msg}）。`,
      code: "VERCEL_NETWORK",
    };
  }

  if (!res.ok) {
    return {
      status: "failure",
      providerId,
      message: `Vercel billing API が ${String(res.status)} を返しました。トークン権限・Team ID を確認してください。`,
      code: "VERCEL_HTTP",
    };
  }

  const text = await res.text();
  let total = 0;
  let lines = 0;
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      continue;
    }
    const parsed = lineSchema.safeParse(json);
    if (!parsed.success) continue;
    const cur = parsed.data;
    if (cur.BillingCurrency && cur.BillingCurrency !== "USD") continue;
    total += cur.BilledCost;
    lines += 1;
  }

  if (lines === 0) {
    return {
      status: "failure",
      providerId,
      message:
        "指定期間に課金行がありませんでした。プラン・日付範囲・権限を確認するか、手入力してください。",
      code: "VERCEL_EMPTY",
    };
  }

  return {
    status: "success",
    providerId,
    amountUsd: Math.round(total * 100) / 100,
    note: `FOCUS 行 ${lines} 件の BilledCost 合計（期間: 当月〜現在 UTC）`,
  };
}
