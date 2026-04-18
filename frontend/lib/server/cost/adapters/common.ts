/** 外部 Billing 呼び出しのタイムアウト（Vercel 関数制限を意識して保守的に） */
export const COST_ADAPTER_TIMEOUT_MS = 15_000;

export function combineAbortSignals(
  parent: AbortSignal,
  ms: number = COST_ADAPTER_TIMEOUT_MS,
): AbortSignal {
  return AbortSignal.any([parent, AbortSignal.timeout(ms)]);
}
