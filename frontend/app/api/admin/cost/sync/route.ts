import { NextResponse } from "next/server";

import {
  bearerMatchesExpected,
  isBearerConfigured,
} from "@/lib/server/cost";
import { runCostSync } from "@/lib/server/cost/sync";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isBearerConfigured()) {
    return NextResponse.json(
      { error: "COST_ADMIN_BEARER is not configured" },
      { status: 503 },
    );
  }
  if (!bearerMatchesExpected(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runCostSync(request.signal);
    return NextResponse.json({
      version: 2 as const,
      lastSync: summary.lastSync,
      entries: summary.entries,
      totalUsd: summary.totalUsd,
      countingProviders: summary.countingProviders,
    });
  } catch {
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
