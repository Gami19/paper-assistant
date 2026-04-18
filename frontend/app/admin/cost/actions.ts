"use server";

import { revalidatePath } from "next/cache";

import { seedCostEntries } from "@/lib/server/cost/seed";
import type { CostSyncRecord } from "@/lib/server/cost/schema";
import { runCostSync } from "@/lib/server/cost/sync";
import { writeCostEntries } from "@/lib/server/cost/store";

export type SaveCostFormState = { ok?: true; error?: string };

/** `useActionState` の初期値は `{}`（idle）。成功時は `ok` + `lastSync` */
export type SyncCostFormState = {
  ok?: true;
  error?: string;
  lastSync?: CostSyncRecord;
};

export async function saveCostAction(
  _prev: SaveCostFormState | undefined,
  formData: FormData,
): Promise<SaveCostFormState> {
  const expected = process.env.COST_ADMIN_BEARER?.trim();
  if (!expected) {
    return { error: "サーバーに COST_ADMIN_BEARER が設定されていません。" };
  }
  const token = String(formData.get("admin_token") ?? "").trim();
  if (token !== expected) {
    return { error: "トークンが一致しません。" };
  }

  const today = new Date().toISOString().slice(0, 10);
  const seed = seedCostEntries();
  const next = [];

  for (const s of seed) {
    const monthlyRaw = formData.get(`monthly_${s.providerId}`);
    const memo = String(formData.get(`memo_${s.providerId}`) ?? "");
    let monthlyUsd: number | null = null;
    const str = monthlyRaw !== null ? String(monthlyRaw).trim() : "";
    if (str !== "") {
      const n = Number(str.replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) {
        return { error: `${s.label} の月額（USD）が不正です。数値のみ入力してください。` };
      }
      monthlyUsd = n;
    }
    next.push({
      ...s,
      monthlyUsd,
      memo,
      updatedAt: today,
    });
  }

  try {
    await writeCostEntries(next);
  } catch {
    return { error: "保存に失敗しました。" };
  }

  revalidatePath("/admin/cost");
  return { ok: true };
}

export async function syncCostAction(
  _prev: SyncCostFormState,
  formData: FormData,
): Promise<SyncCostFormState> {
  const expected = process.env.COST_ADMIN_BEARER?.trim();
  if (!expected) {
    return { error: "サーバーに COST_ADMIN_BEARER が設定されていません。" };
  }
  const token = String(formData.get("admin_token_sync") ?? "").trim();
  if (token !== expected) {
    return { error: "トークンが一致しません。" };
  }

  try {
    const summary = await runCostSync();
    revalidatePath("/admin/cost");
    return { ok: true as const, lastSync: summary.lastSync };
  } catch {
    return { error: "同期に失敗しました。" };
  }
}
