"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { CostEntry } from "@/lib/server/cost/schema";

import { saveCostAction, type SaveCostFormState } from "./actions";

const initial: SaveCostFormState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-primary-600 px-paper-4 py-paper-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-primary-500 dark:hover:bg-primary-600"
    >
      {pending ? "保存中…" : "保存"}
    </button>
  );
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

type Props = {
  entries: CostEntry[];
  totalUsd: number;
  countingProviders: number;
  bearerConfigured: boolean;
};

export function CostAdminForm({
  entries,
  totalUsd,
  countingProviders,
  bearerConfigured,
}: Props) {
  const [state, formAction] = useActionState(saveCostAction, initial);
  const allEmpty = entries.every((e) => e.monthlyUsd === null);

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
    </div>
  );
}
