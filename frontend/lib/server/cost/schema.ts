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

/** 第 1 段階のみのファイル形式 */
export const costStateFileV1Schema = z.object({
  version: z.literal(1),
  entries: z.array(costEntrySchema).length(4),
});

export type CostStateFileV1 = z.infer<typeof costStateFileV1Schema>;

/** 第 2 段階: 直近の自動同期サマリ（永続化） */
export const costSyncResultLineSchema = z.object({
  providerId: costProviderIdSchema,
  kind: z.enum(["success", "skipped", "failure"]),
  message: z.string().max(500),
  amountUsd: z.number().finite().nonnegative().optional(),
});

export type CostSyncResultLine = z.infer<typeof costSyncResultLineSchema>;

export const costSyncRecordSchema = z.object({
  attemptedAt: z.string().min(1),
  /** 全体判定: 全 skipped → success。1 件でも success かつ 1 件でも failure → partial。全 failure（skipped 以外）→ failure は使わず partial 寄せ */
  aggregateStatus: z.enum(["success", "partial", "failure"]),
  results: z.array(costSyncResultLineSchema),
});

export type CostSyncRecord = z.infer<typeof costSyncRecordSchema>;

/** 第 2 段階のファイル形式 */
export const costStateFileV2Schema = z.object({
  version: z.literal(2),
  entries: z.array(costEntrySchema).length(4),
  lastSync: costSyncRecordSchema.optional(),
});

export type CostStateFileV2 = z.infer<typeof costStateFileV2Schema>;

export const costStateFileSchema = z.discriminatedUnion("version", [
  costStateFileV1Schema,
  costStateFileV2Schema,
]);

export type CostStateFile = z.infer<typeof costStateFileSchema>;

/** PUT 互換: v1 / v2 どちらも受理（README・curl 既存利用者向け） */
export const costApiPutBodySchema = z.discriminatedUnion("version", [
  costStateFileV1Schema,
  costStateFileV2Schema,
]);

export type CostApiPutBody = z.infer<typeof costApiPutBodySchema>;

export function toCostStateV2(
  file: CostStateFile,
  lastSync?: CostSyncRecord,
): CostStateFileV2 {
  if (file.version === 2) {
    return {
      version: 2,
      entries: file.entries,
      lastSync: lastSync ?? file.lastSync,
    };
  }
  return { version: 2, entries: file.entries, lastSync };
}

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
