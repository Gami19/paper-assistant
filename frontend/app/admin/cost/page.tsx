import { getCostSummary, isBearerConfigured } from "@/lib/server/cost";

import { CostAdminForm } from "./cost-admin-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "運用コスト管理",
};

export default async function AdminCostPage() {
  const summary = await getCostSummary();
  const bearerConfigured = isBearerConfigured();
  const formKey = summary.entries
    .map(
      (e) =>
        `${e.providerId}:${e.updatedAt}:${e.monthlyUsd ?? ""}:${e.memo}`,
    )
    .join("|");

  return (
    <div className="flex flex-col gap-paper-8">
      <header className="border-b border-border-subtle pb-paper-6">
        <p className="text-sm text-muted-foreground">
          paper-assistant / 管理（メイン UI とは別ルート）
        </p>
        <h1 className="mt-paper-2 text-2xl font-semibold tracking-tight text-foreground">
          運用コスト管理
        </h1>
        <p className="mt-paper-3 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
          Vercel / Railway / Supabase / AWS の月額（USD）とメモを手入力し、画面上で合計を確認します。データは Next.js
          サーバー側の JSON に保存されます（FastAPI には送信しません）。
        </p>
      </header>

      <CostAdminForm
        key={formKey}
        entries={summary.entries}
        totalUsd={summary.totalUsd}
        countingProviders={summary.countingProviders}
        bearerConfigured={bearerConfigured}
      />
    </div>
  );
}
