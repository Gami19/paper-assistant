import { NextResponse } from "next/server";

import {
  bearerMatchesExpected,
  costApiPutBodySchema,
  getCostSummary,
  isBearerConfigured,
  writeCostEntries,
} from "@/lib/server/cost";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isBearerConfigured()) {
    return NextResponse.json(
      { error: "COST_ADMIN_BEARER is not configured" },
      { status: 503 },
    );
  }
  if (!bearerMatchesExpected(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const summary = await getCostSummary();
  return NextResponse.json({
    version: 1 as const,
    entries: summary.entries,
    totalUsd: summary.totalUsd,
    countingProviders: summary.countingProviders,
  });
}

export async function PUT(request: Request): Promise<NextResponse> {
  if (!isBearerConfigured()) {
    return NextResponse.json(
      { error: "COST_ADMIN_BEARER is not configured" },
      { status: 503 },
    );
  }
  if (!bearerMatchesExpected(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = costApiPutBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", detail: parsed.error.flatten() },
      { status: 422 },
    );
  }
  try {
    await writeCostEntries(parsed.data.entries);
  } catch {
    return NextResponse.json({ error: "Failed to persist" }, { status: 500 });
  }
  const summary = await getCostSummary();
  return NextResponse.json({
    version: 1 as const,
    entries: summary.entries,
    totalUsd: summary.totalUsd,
    countingProviders: summary.countingProviders,
  });
}
