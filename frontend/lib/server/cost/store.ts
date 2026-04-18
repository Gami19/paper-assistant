import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  costStateFileSchema,
  costStateFileV2Schema,
  countingProviders,
  sumMonthlyUsd,
  toCostStateV2,
  type CostEntry,
  type CostStateFile,
  type CostStateFileV2,
  type CostSyncRecord,
} from "./schema";
import { mergeWithSeedPreservingInput, seedCostEntries } from "./seed";

function dataFilePath(): string {
  const override = process.env.COST_DATA_FILE;
  if (override && override.trim()) {
    return path.resolve(override.trim());
  }
  return path.join(process.cwd(), ".data", "cost-state.json");
}

async function ensureDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}

function normalizeEntries(entries: CostEntry[]): CostEntry[] {
  const seed = seedCostEntries();
  const merged = mergeWithSeedPreservingInput(entries, seed);
  const parsed = costStateFileV2Schema.safeParse({
    version: 2 as const,
    entries: merged,
  });
  if (!parsed.success) {
    return seed;
  }
  return parsed.data.entries;
}

function parseStoredJson(json: unknown): CostStateFileV2 {
  const parsed = costStateFileSchema.safeParse(json);
  if (!parsed.success) {
    return {
      version: 2,
      entries: seedCostEntries(),
    };
  }
  return toCostStateV2(parsed.data);
}

async function readStoredState(): Promise<CostStateFileV2> {
  const fp = dataFilePath();
  try {
    const raw = await readFile(fp, "utf-8");
    const json: unknown = JSON.parse(raw);
    const state = parseStoredJson(json);
    return {
      ...state,
      entries: normalizeEntries(state.entries),
    };
  } catch {
    return {
      version: 2,
      entries: seedCostEntries(),
    };
  }
}

async function writeStoredState(state: CostStateFileV2): Promise<void> {
  const normalized = normalizeEntries(state.entries);
  const body = costStateFileV2Schema.parse({
    version: 2 as const,
    entries: normalized,
    lastSync: state.lastSync,
  });
  const fp = dataFilePath();
  await ensureDir(fp);
  await writeFile(fp, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
}

export async function readCostEntries(): Promise<CostEntry[]> {
  const s = await readStoredState();
  return s.entries;
}

export async function readCostState(): Promise<{
  entries: CostEntry[];
  lastSync: CostSyncRecord | undefined;
}> {
  const s = await readStoredState();
  return { entries: s.entries, lastSync: s.lastSync };
}

export async function writeCostEntries(entries: CostEntry[]): Promise<void> {
  const current = await readStoredState();
  await writeStoredState({
    version: 2,
    entries,
    lastSync: current.lastSync,
  });
}

/** PUT 本文をマージ: v1 本文ならディスク上の lastSync を維持 */
export async function writeCostFromPutBody(
  body: CostStateFile,
): Promise<void> {
  const current = await readStoredState();
  const nextLastSync =
    body.version === 2 ? (body.lastSync ?? current.lastSync) : current.lastSync;
  await writeStoredState({
    version: 2,
    entries: body.entries,
    lastSync: nextLastSync,
  });
}

export async function writeCostAfterSync(
  entries: CostEntry[],
  lastSync: CostSyncRecord,
): Promise<void> {
  await writeStoredState({
    version: 2,
    entries,
    lastSync,
  });
}

export async function getCostSummary(): Promise<{
  entries: CostEntry[];
  totalUsd: number;
  countingProviders: number;
  lastSync: CostSyncRecord | undefined;
}> {
  const { entries, lastSync } = await readCostState();
  return {
    entries,
    totalUsd: sumMonthlyUsd(entries),
    countingProviders: countingProviders(entries),
    lastSync,
  };
}
