import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  costStateFileSchema,
  countingProviders,
  sumMonthlyUsd,
  type CostEntry,
} from "./schema";
import { mergeWithSeedPreservingInput, seedCostEntries } from "./seed";

const FILE_VERSION = 1 as const;

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

function normalizeState(entries: CostEntry[]): CostEntry[] {
  const seed = seedCostEntries();
  const merged = mergeWithSeedPreservingInput(entries, seed);
  const parsed = costStateFileSchema.safeParse({
    version: FILE_VERSION,
    entries: merged,
  });
  if (!parsed.success) {
    return seed;
  }
  return parsed.data.entries;
}

export async function readCostEntries(): Promise<CostEntry[]> {
  const fp = dataFilePath();
  try {
    const raw = await readFile(fp, "utf-8");
    const json: unknown = JSON.parse(raw);
    const parsed = costStateFileSchema.safeParse(json);
    if (!parsed.success) {
      return seedCostEntries();
    }
    return normalizeState(parsed.data.entries);
  } catch {
    return seedCostEntries();
  }
}

export async function writeCostEntries(entries: CostEntry[]): Promise<void> {
  const normalized = normalizeState(entries);
  const body = costStateFileSchema.parse({
    version: FILE_VERSION,
    entries: normalized,
  });
  const fp = dataFilePath();
  await ensureDir(fp);
  await writeFile(fp, `${JSON.stringify(body, null, 2)}\n`, "utf-8");
}

export async function getCostSummary(): Promise<{
  entries: CostEntry[];
  totalUsd: number;
  countingProviders: number;
}> {
  const entries = await readCostEntries();
  return {
    entries,
    totalUsd: sumMonthlyUsd(entries),
    countingProviders: countingProviders(entries),
  };
}
