import type { CostEntry } from "./schema";

/** 初回およびファイル欠損時の既定行（運用コスト.md §1.1 の公式導線） */
export function seedCostEntries(): CostEntry[] {
  const now = new Date().toISOString().slice(0, 10);
  return [
    {
      providerId: "vercel",
      label: "Vercel",
      billingUrl: "https://vercel.com/docs/limits",
      monthlyUsd: null,
      memo: "",
      updatedAt: now,
    },
    {
      providerId: "railway",
      label: "Railway",
      billingUrl: "https://railway.com/pricing",
      monthlyUsd: null,
      memo: "",
      updatedAt: now,
    },
    {
      providerId: "supabase",
      label: "Supabase",
      billingUrl:
        "https://supabase.com/docs/guides/platform/billing-on-supabase",
      monthlyUsd: null,
      memo: "",
      updatedAt: now,
    },
    {
      providerId: "aws",
      label: "AWS（Bedrock・S3 等）",
      billingUrl: "https://console.aws.amazon.com/billing/",
      monthlyUsd: null,
      memo: "",
      updatedAt: now,
    },
  ];
}

/** 保存済みエントリに seed のメタ（label, url）をマージ（ID 一致のみ） */
export function mergeWithSeedPreservingInput(
  stored: CostEntry[],
  seed: CostEntry[],
): CostEntry[] {
  const byId = new Map(stored.map((e) => [e.providerId, e]));
  return seed.map((s) => {
    const cur = byId.get(s.providerId);
    if (!cur) return s;
    return {
      ...cur,
      label: s.label,
      billingUrl: s.billingUrl,
    };
  });
}
