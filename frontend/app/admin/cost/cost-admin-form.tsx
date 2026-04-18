"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type {
  CostEntry,
  CostSyncRecord,
  CostSyncResultLine,
} from "@/lib/server/cost/schema";

import {
  saveCostAction,
  syncCostAction,
  type SaveCostFormState,
  type SyncCostFormState,
} from "./actions";

const initial: SaveCostFormState = {};

const syncInitial: SyncCostFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary-600 px-paper-4 py-paper-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:bg-primary-500 dark:hover:bg-primary-600"
    >
      {pending ? "保存中…" : "保存"}
    </button>
  );
}

function SyncSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md border border-border-subtle bg-background px-paper-4 py-paper-2 text-sm font-medium text-foreground hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none dark:hover:bg-neutral-800"
    >
      {pending ? "取得中…" : "最新を取得"}
    </button>
  );
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

function lastAggregateLabel(
  status: CostSyncRecord["aggregateStatus"],
): string {
  switch (status) {
    case "success":
      return "全体成功";
    case "partial":
      return "一部のみ";
    case "failure":
      return "金額は未反映";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function aggregateCopy(
  status: CostSyncRecord["aggregateStatus"],
): { tone: "success" | "warning" | "danger"; text: string } {
  switch (status) {
    case "success":
      return {
        tone: "success",
        text: "自動取得は完了しました（概算・遅延のある場合があります）。必要に応じて手入力で調整してください。",
      };
    case "partial":
      return {
        tone: "warning",
        text: "一部のプロバイダのみ反映されました。失敗した行は従来どおり手入力の値が維持されます。",
      };
    case "failure":
      return {
        tone: "danger",
        text: "自動取得で金額は更新されませんでした。設定・権限を確認するか、手入力をご利用ください。",
      };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function SyncAggregateBanner({
  aggregateStatus,
}: {
  aggregateStatus: CostSyncRecord["aggregateStatus"];
}) {
  const agg = aggregateCopy(aggregateStatus);
  let toneClass: string;
  switch (agg.tone) {
    case "success":
      toneClass =
        "border-semantic-success/40 bg-semantic-success/5 text-foreground";
      break;
    case "warning":
      toneClass =
        "border-semantic-warning/40 bg-semantic-warning/5 text-foreground";
      break;
    case "danger":
      toneClass =
        "border-semantic-danger/40 bg-semantic-danger/5 text-foreground";
      break;
    default: {
      const _n: never = agg.tone;
      toneClass = _n;
    }
  }
  return (
    <p
      role="status"
      className={`rounded-md border px-paper-3 py-paper-2 text-sm ${toneClass}`}
    >
      {agg.text}
    </p>
  );
}

type Props = {
  entries: CostEntry[];
  totalUsd: number;
  countingProviders: number;
  lastSync: CostSyncRecord | undefined;
  bearerConfigured: boolean;
};

export function CostAdminForm({
  entries,
  totalUsd,
  countingProviders,
  lastSync,
  bearerConfigured,
}: Props) {
  const [state, formAction] = useActionState(saveCostAction, initial);
  const [syncState, syncFormAction] = useActionState(
    syncCostAction,
    syncInitial,
  );
  const allEmpty = entries.every((e) => e.monthlyUsd === null);
  const labelByProvider = new Map(
    entries.map((e) => [e.providerId, e.label] as const),
  );

  if (!bearerConfigured) {
    return (
      <div
        className="rounded-lg border border-semantic-warning bg-background px-paper-4 py-paper-4 text-sm text-foreground"
        role="status"
      >
        <p className="font-medium text-semantic-warning">設定が必要です</p>
        <p className="mt-paper-2 text-muted-foreground">
          サーバーに{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-700">
            COST_ADMIN_BEARER
          </code>{" "}
          を設定し、開発サーバーを再起動してください。詳細は{" "}
          <code className="font-mono text-xs">frontend/README.md</code> を参照してください。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-paper-8">
      {allEmpty ? (
        <p className="rounded-lg border border-border-subtle bg-background px-paper-4 py-paper-4 text-sm text-muted-foreground">
          まだ月額が入力されていません。各サービスの公式 Billing
          で金額を確認し、下のフォームにメモしてください。未入力の行は合計に含まれません。
        </p>
      ) : null}

      <form action={formAction} className="flex flex-col gap-paper-8">
        <div className="flex max-w-md flex-col gap-paper-2">
          <label
            htmlFor="admin_token"
            className="text-sm font-medium text-foreground"
          >
            管理用トークン
          </label>
          <input
            id="admin_token"
            name="admin_token"
            type="password"
            autoComplete="off"
            required
            className="rounded-md border border-border-subtle bg-background px-paper-3 py-paper-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          />
          <p className="text-xs text-muted-foreground">
            環境変数{" "}
            <code className="font-mono">COST_ADMIN_BEARER</code>{" "}
            と同じ値を入力してください。
          </p>
        </div>

        <ul className="grid gap-paper-6 sm:grid-cols-2">
          {entries.map((e) => (
            <li key={e.providerId}>
              <article className="flex h-full flex-col gap-paper-4 rounded-xl border border-border-subtle bg-background p-paper-6 shadow-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-paper-2">
                  <h2 className="text-lg font-semibold text-foreground">
                    {e.label}
                  </h2>
                  <a
                    href={e.billingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600 underline-offset-2 hover:underline dark:text-primary-300"
                  >
                    公式 Billing を開く
                  </a>
                </div>
                {e.providerId === "aws" ? (
                  <p className="text-xs text-muted-foreground">
                    Bedrock・S3 等は AWS の請求・Cost Explorer でサービス別に確認できます。
                  </p>
                ) : null}
                <div className="flex flex-col gap-paper-2">
                  <label
                    htmlFor={`monthly_${e.providerId}`}
                    className="text-sm font-medium text-foreground"
                  >
                    月額（USD）
                  </label>
                  <input
                    id={`monthly_${e.providerId}`}
                    name={`monthly_${e.providerId}`}
                    type="text"
                    inputMode="decimal"
                    placeholder="未入力（合計に含めない）"
                    defaultValue={
                      e.monthlyUsd === null ? "" : String(e.monthlyUsd)
                    }
                    className="rounded-md border border-border-subtle bg-background px-paper-3 py-paper-2 font-mono text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  />
                </div>
                <div className="flex flex-col gap-paper-2">
                  <label
                    htmlFor={`memo_${e.providerId}`}
                    className="text-sm font-medium text-foreground"
                  >
                    メモ
                  </label>
                  <textarea
                    id={`memo_${e.providerId}`}
                    name={`memo_${e.providerId}`}
                    rows={3}
                    defaultValue={e.memo}
                    className="resize-y rounded-md border border-border-subtle bg-background px-paper-3 py-paper-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  最終更新: {e.updatedAt}
                </p>
              </article>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-paper-4 border-t border-border-subtle pt-paper-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              合計（入力済みの月額のみ）
            </p>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {fmtUsd(totalUsd)} USD
              <span className="ml-paper-2 text-sm font-normal text-muted-foreground">
                （{countingProviders} 件を合計）
              </span>
            </p>
            <p className="mt-paper-1 text-xs text-muted-foreground">
              為替換算は手動で行ってください。
            </p>
          </div>
          <SubmitButton />
        </div>

        {state?.ok ? (
          <p
            className="text-sm font-medium text-semantic-success"
            role="status"
          >
            保存しました。
          </p>
        ) : null}
        {state?.error ? (
          <p className="text-sm font-medium text-semantic-danger" role="alert">
            {state.error}
          </p>
        ) : null}
      </form>

      <details className="rounded-lg border border-border-subtle bg-background p-paper-4 motion-reduce:transition-none">
        <summary className="cursor-pointer text-sm font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
          自動取得（第 2 段階）
        </summary>
        <div className="mt-paper-4 flex flex-col gap-paper-4 text-sm text-muted-foreground">
          <p>
            各プロバイダの API から概算を取り込みます。環境変数が無いプロバイダはスキップされ、取得できた行だけ月額が上書きされます。公式ダッシュボードと数値がずれることがあります。
          </p>
          {lastSync ? (
            <p className="text-xs">
              前回試行: {lastSync.attemptedAt}（
              {lastAggregateLabel(lastSync.aggregateStatus)}）
            </p>
          ) : (
            <p className="text-xs">まだ同期履歴はありません。</p>
          )}

          <form action={syncFormAction} className="flex flex-col gap-paper-4">
            <div className="flex max-w-md flex-col gap-paper-2">
              <label
                htmlFor="admin_token_sync"
                className="text-sm font-medium text-foreground"
              >
                管理用トークン
              </label>
              <input
                id="admin_token_sync"
                name="admin_token_sync"
                type="password"
                autoComplete="off"
                required
                className="rounded-md border border-border-subtle bg-background px-paper-3 py-paper-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              />
              <p className="text-xs text-muted-foreground">
                <code className="font-mono">COST_ADMIN_BEARER</code>{" "}
                と同じ値です。ログに出力しないでください。
              </p>
            </div>
            <SyncSubmitButton />
            {syncState.error ? (
              <p
                className="text-sm font-medium text-semantic-danger"
                role="alert"
              >
                {syncState.error}
              </p>
            ) : null}
            {syncState.ok && syncState.lastSync ? (
              <div className="flex flex-col gap-paper-3" role="status">
                <SyncAggregateBanner
                  aggregateStatus={syncState.lastSync.aggregateStatus}
                />
                <ul className="grid gap-paper-2 sm:grid-cols-2">
                  {syncState.lastSync.results.map((line: CostSyncResultLine) => {
                    const label =
                      labelByProvider.get(line.providerId) ?? line.providerId;
                    if (line.kind === "success") {
                      return (
                        <li
                          key={line.providerId}
                          className="rounded-md border border-border-subtle px-paper-3 py-paper-2 text-xs text-foreground"
                        >
                          <span className="font-medium">{label}</span>
                          <span className="ml-paper-2 tabular-nums">
                            {line.amountUsd !== undefined
                              ? `${fmtUsd(line.amountUsd)} USD`
                              : "—"}
                          </span>
                          <p className="mt-paper-1 text-muted-foreground">
                            {line.message}
                          </p>
                        </li>
                      );
                    }
                    if (line.kind === "skipped") {
                      return (
                        <li
                          key={line.providerId}
                          className="rounded-md border border-dashed border-border-subtle px-paper-3 py-paper-2 text-xs text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">
                            {label}
                          </span>
                          <p className="mt-paper-1">スキップ: {line.message}</p>
                        </li>
                      );
                    }
                    if (line.kind === "failure") {
                      return (
                        <li
                          key={line.providerId}
                          className="rounded-md border border-semantic-danger/30 px-paper-3 py-paper-2 text-xs text-foreground"
                        >
                          <span className="font-medium">{label}</span>
                          <p className="mt-paper-1 text-muted-foreground">
                            {line.message}
                          </p>
                        </li>
                      );
                    }
                    {
                      const _exhaustive: never = line.kind;
                      void _exhaustive;
                    }
                    return null;
                  })}
                </ul>
              </div>
            ) : null}
          </form>
        </div>
      </details>
    </div>
  );
}
