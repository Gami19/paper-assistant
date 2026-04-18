import "server-only";

import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";

import type { AdapterResult } from "../merge-sync";
import { combineAbortSignals } from "./common";

function awsCredentials():
  | { accessKeyId: string; secretAccessKey: string }
  | undefined {
  const accessKeyId =
    process.env.COST_SYNC_AWS_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.COST_SYNC_AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();
  if (!accessKeyId || !secretAccessKey) return undefined;
  return { accessKeyId, secretAccessKey };
}

/** Cost Explorer で当月（月初〜昨日）の UnblendedCost を USD 合計 */
export async function fetchAwsMonthlyUsd(
  parentSignal: AbortSignal,
): Promise<AdapterResult> {
  const providerId = "aws" as const;
  const cred = awsCredentials();
  if (!cred) {
    return {
      status: "skipped",
      providerId,
      reason:
        "COST_SYNC_AWS_*（または AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）が未設定です。IAM に ce:GetCostAndUsage が必要です。",
    };
  }

  const signal = combineAbortSignals(parentSignal);
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startStr = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(Date.UTC(y, m + 1, 1));
  const endStr = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-01`;

  /** Cost Explorer のエンドポイントは us-east-1 が一般的（リージョンと請求データは別） */
  const client = new CostExplorerClient({
    region: "us-east-1",
    credentials: {
      accessKeyId: cred.accessKeyId,
      secretAccessKey: cred.secretAccessKey,
    },
  });

  try {
    const out = await client.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: startStr,
          End: endStr,
        },
        Granularity: "MONTHLY",
        Metrics: ["UnblendedCost"],
      }),
      { abortSignal: signal },
    );

    const amountStr =
      out.ResultsByTime?.[0]?.Total?.UnblendedCost?.Amount ?? undefined;
    const unit = out.ResultsByTime?.[0]?.Total?.UnblendedCost?.Unit;
    if (amountStr === undefined || unit !== "USD") {
      return {
        status: "failure",
        providerId,
        message:
          "Cost Explorer の応答に USD 合計がありませんでした。権限・リージョンを確認してください。",
        code: "AWS_CE_PARSE",
      };
    }
    const n = Number(amountStr);
    if (!Number.isFinite(n) || n < 0) {
      return {
        status: "failure",
        providerId,
        message: "Cost Explorer の金額が数値として解釈できませんでした。",
        code: "AWS_CE_AMOUNT",
      };
    }
    return {
      status: "success",
      providerId,
      amountUsd: Math.round(n * 100) / 100,
      note: `UnblendedCost（当月・Cost Explorer の反映遅延あり）`,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const msg = e instanceof Error ? e.message : "取得に失敗しました";
    if (name === "AbortError" || signal.aborted) {
      return {
        status: "failure",
        providerId,
        message: "AWS Cost Explorer の呼び出しがタイムアウトしました。",
        code: "AWS_TIMEOUT",
      };
    }
    return {
      status: "failure",
      providerId,
      message: `AWS Cost Explorer エラー: ${msg}`,
      code: "AWS_CE",
    };
  }
}
