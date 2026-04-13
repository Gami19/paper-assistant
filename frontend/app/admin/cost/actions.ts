"use server";

import { revalidatePath } from "next/cache";

import { writeCostEntries } from "@/lib/server/cost/store";
import { seedCostEntries } from "@/lib/server/cost/seed";

export type SaveCostFormState = { ok?: true; error?: string };

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
