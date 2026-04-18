import "server-only";

import { z } from "zod";

import type { AdapterResult } from "../merge-sync";
import { combineAbortSignals } from "./common";

const orgResponseSchema = z.object({ id: z.string().optional() }).passthrough();

/**
 * Supabase Management API で組織メタは取得しうるが、請求 USD 合計の安定した
 * 公開フィールドはない。トークンと org id の検証に留め、金額は手入力へ誘導する。
 */
export async function fetchSupabaseMonthlyUsd(
  parentSignal: AbortSignal,
): Promise<AdapterResult> {
  const providerId = "supabase" as const;
  const token = process.env.COST_SYNC_SUPABASE_ACCESS_TOKEN?.trim();
  const orgId = process.env.COST_SYNC_SUPABASE_ORG_ID?.trim();
  if (!token) {
    return {
      status: "skipped",
      providerId,
      reason:
        "COST_SYNC_SUPABASE_ACCESS_TOKEN が未設定です（Management API 用）。",
    };
  }
  if (!orgId) {
    return {
      status: "skipped",
      providerId,
      reason:
        "COST_SYNC_SUPABASE_ORG_ID が未設定です（ダッシュボードの Organization ID）。",
    };
  }

  const signal = combineAbortSignals(parentSignal);
  const url = `https://api.supabase.com/v1/organizations/${encodeURIComponent(orgId)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "通信に失敗しました";
    return {
      status: "failure",
      providerId,
      message: `Supabase Management API に接続できませんでした（${msg}）。`,
      code: "SUPABASE_NETWORK",
    };
  }

  if (!res.ok) {
    return {
      status: "failure",
      providerId,
      message: `Supabase Management API が ${String(res.status)} を返しました。トークンと Organization ID を確認してください。`,
      code: "SUPABASE_HTTP",
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      status: "failure",
      providerId,
      message: "Supabase の応答が JSON として解釈できませんでした。",
      code: "SUPABASE_JSON",
    };
  }

  if (!orgResponseSchema.safeParse(json).success) {
    return {
      status: "failure",
      providerId,
      message: "Supabase Organization の応答形式が想定と異なります。",
      code: "SUPABASE_SHAPE",
    };
  }

  return {
    status: "failure",
    providerId,
    message:
      "組織情報の取得はできましたが、Management API から請求 USD 合計は取得していません。Billing ページで確認し、手入力してください。",
    code: "SUPABASE_NO_AMOUNT",
  };
}
