import "server-only";

import type { AdapterResult } from "../merge-sync";
import { fetchAwsMonthlyUsd } from "./aws";
import { fetchRailwayMonthlyUsd } from "./railway";
import { fetchSupabaseMonthlyUsd } from "./supabase";
import { fetchVercelMonthlyUsd } from "./vercel";

/** 4 プロバイダを並列取得（各アダプタ内でタイムアウト） */
export async function runAllCostAdapters(
  parentSignal?: AbortSignal,
): Promise<AdapterResult[]> {
  const signal = parentSignal ?? new AbortController().signal;
  const [vercel, railway, supabase, aws] = await Promise.all([
    fetchVercelMonthlyUsd(signal),
    fetchRailwayMonthlyUsd(signal),
    fetchSupabaseMonthlyUsd(signal),
    fetchAwsMonthlyUsd(signal),
  ]);
  return [vercel, railway, supabase, aws];
}
