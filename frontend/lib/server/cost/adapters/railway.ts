import "server-only";

import { z } from "zod";

import type { AdapterResult } from "../merge-sync";
import { combineAbortSignals } from "./common";

const gqlResponseSchema = z.object({
  data: z
    .object({
      me: z.object({ email: z.string().optional() }).optional(),
    })
    .optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
      }),
    )
    .optional(),
});

/**
 * Railway 公開 GraphQL はダッシュボードと同一だが、請求 USD の集計フィールドは
 * ドキュメント化されておらず仕様変更リスクが高い。トークン検証のみ行い、
 * 金額は取得しない（手入力フォールバック）。
 */
export async function fetchRailwayMonthlyUsd(
  parentSignal: AbortSignal,
): Promise<AdapterResult> {
  const providerId = "railway" as const;
  const token = process.env.COST_SYNC_RAILWAY_TOKEN?.trim();
  if (!token) {
    return {
      status: "skipped",
      providerId,
      reason:
        "COST_SYNC_RAILWAY_TOKEN が未設定です（Railway Account / Workspace トークン）。",
    };
  }

  const signal = combineAbortSignals(parentSignal);
  let res: Response;
  try {
    res = await fetch("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "query { me { email } }" }),
      signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "通信に失敗しました";
    return {
      status: "failure",
      providerId,
      message: `Railway API に接続できませんでした（${msg}）。`,
      code: "RAILWAY_NETWORK",
    };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return {
      status: "failure",
      providerId,
      message: "Railway API の応答が JSON として解釈できませんでした。",
      code: "RAILWAY_JSON",
    };
  }

  const parsed = gqlResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      status: "failure",
      providerId,
      message: "Railway GraphQL の応答形式が想定と異なります。",
      code: "RAILWAY_SHAPE",
    };
  }

  const errs = parsed.data.errors;
  if (errs && errs.length > 0) {
    return {
      status: "failure",
      providerId,
      message: `Railway: ${errs.map((e) => e.message).join("; ")}`,
      code: "RAILWAY_GQL",
    };
  }

  return {
    status: "failure",
    providerId,
    message:
      "トークンは有効ですが、公開 GraphQL から USD 請求額は取得していません（仕様・権限の都合）。Billing 画面で確認し、手入力してください。",
    code: "RAILWAY_NO_AMOUNT",
  };
}
