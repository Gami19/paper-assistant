import { z } from "zod";

/** F4-3 第 1 段階で扱うプロバイダ（運用コスト.md §1.1 と整合） */
export const costProviderIdSchema = z.enum([
  "vercel",
  "railway",
  "supabase",
  "aws",
]);

export type CostProviderId = z.infer<typeof costProviderIdSchema>;

export const costEntrySchema = z.object({
  providerId: costProviderIdSchema,
  label: z.string().min(1),
  billingUrl: z.string().url(),
  monthlyUsd: z.number().finite().nonnegative().nullable(),
  memo: z.string(),
  updatedAt: z.string().min(1),
});

export type CostEntry = z.infer<typeof costEntrySchema>;

export const costStateFileSchema = z.object({
  version: z.literal(1),
  entries: z.array(costEntrySchema).length(4),
});

export type CostStateFile = z.infer<typeof costStateFileSchema>;

export const costApiPutBodySchema = costStateFileSchema;

/** 合計に含めるのは有限の非 null のみ */
export function sumMonthlyUsd(entries: readonly CostEntry[]): number {
  return entries.reduce((acc, e) => {
    if (e.monthlyUsd === null || !Number.isFinite(e.monthlyUsd)) return acc;
    return acc + e.monthlyUsd;
  }, 0);
}

export function countingProviders(entries: readonly CostEntry[]): number {
  return entries.filter(
    (e) => e.monthlyUsd !== null && Number.isFinite(e.monthlyUsd),
  ).length;
}
