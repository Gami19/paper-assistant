import { z } from "zod";

/**
 * GET /health の JSON 契約の正（二重定義禁止。変更時はバックエンドと pytest を同期すること）。
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("paper-assistant"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type HealthCheckResult =
  | { kind: "missing_base_url" }
  | { kind: "ok"; data: HealthResponse }
  | { kind: "http_error"; status: number; statusText: string }
  | { kind: "network_error"; message: string }
  | { kind: "invalid_json" }
  | { kind: "invalid_body"; detail: string };

export function normalizeApiBaseUrl(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  return t.replace(/\/+$/, "");
}

export async function fetchBackendHealth(
  baseUrl: string | undefined,
  init?: RequestInit,
): Promise<HealthCheckResult> {
  const base = normalizeApiBaseUrl(baseUrl);
  if (!base) {
    return { kind: "missing_base_url" };
  }

  const url = `${base}/health`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...init?.headers,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Network error";
    return { kind: "network_error", message };
  }

  if (!response.ok) {
    return {
      kind: "http_error",
      status: response.status,
      statusText: response.statusText || "Error",
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { kind: "invalid_json" };
  }

  const parsed = healthResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "invalid_body",
      detail: parsed.error.message,
    };
  }

  return { kind: "ok", data: parsed.data };
}
