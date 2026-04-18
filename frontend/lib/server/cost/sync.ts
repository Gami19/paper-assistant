import "server-only";

import { readCostState, writeCostAfterSync } from "./store";
import {
  buildCostSyncRecord,
  mergeCostEntriesWithAdapterResults,
  type AdapterResult,
} from "./merge-sync";
import { runAllCostAdapters } from "./adapters/run-all";
import type { CostEntry, CostSyncRecord } from "./schema";
import { countingProviders, sumMonthlyUsd } from "./schema";

export type CostSyncRunSummary = {
  adapterResults: AdapterResult[];
  lastSync: CostSyncRecord;
  entries: CostEntry[];
  totalUsd: number;
  countingProviders: number;
};

export async function runCostSync(
  parentSignal?: AbortSignal,
): Promise<CostSyncRunSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const { entries: before } = await readCostState();
  const adapterResults = await runAllCostAdapters(parentSignal);
  const lastSync = buildCostSyncRecord(
    adapterResults,
    new Date().toISOString(),
  );
  const merged = mergeCostEntriesWithAdapterResults(
    before,
    adapterResults,
    today,
  );
  await writeCostAfterSync(merged, lastSync);
  return {
    adapterResults,
    lastSync,
    entries: merged,
    totalUsd: sumMonthlyUsd(merged),
    countingProviders: countingProviders(merged),
  };
}
