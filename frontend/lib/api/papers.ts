import { z } from "zod";

import { normalizeApiBaseUrl } from "@/lib/api/health";

/**
 * POST /v1/papers/upload のレスポンス契約の正（二重定義禁止）。
 */
export const paperUploadResponseSchema = z.object({
  paper_id: z.uuid(),
  filename: z.string(),
  size_bytes: z.number(),
});

export type PaperUploadResponse = z.infer<typeof paperUploadResponseSchema>;

/**
 * POST /v1/papers/{paper_id}/summarize のレスポンス契約の正。
 */
export const paperSummaryResponseSchema = z.object({
  title_ja: z.string(),
  one_liner: z.string(),
  purpose: z.string(),
  method: z.string(),
  results: z.string(),
  takeaways: z.string(),
  keywords: z.string(),
  truncated_source: z.boolean(),
});

export type PaperSummaryResponse = z.infer<typeof paperSummaryResponseSchema>;

export type PaperUploadResult =
  | { kind: "missing_base_url" }
  | { kind: "ok"; data: PaperUploadResponse }
  | { kind: "http_error"; status: number; statusText: string }
  | { kind: "network_error"; message: string }
  | { kind: "invalid_json" }
  | { kind: "invalid_body"; detail: string };

export type PaperSummarizeResult =
  | { kind: "missing_base_url" }
  | { kind: "ok"; data: PaperSummaryResponse }
  | { kind: "http_error"; status: number; statusText: string }
  | { kind: "network_error"; message: string }
  | { kind: "invalid_json" }
  | { kind: "invalid_body"; detail: string };

export async function uploadPaper(
  baseUrl: string | undefined,
  file: File,
  init?: RequestInit,
): Promise<PaperUploadResult> {
  const base = normalizeApiBaseUrl(baseUrl);
  if (!base) {
    return { kind: "missing_base_url" };
  }

  const body = new FormData();
  body.append("file", file);

  let response: Response;
  try {
    response = await fetch(`${base}/v1/papers/upload`, {
      ...init,
      method: "POST",
      cache: "no-store",
      body,
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

  const parsed = paperUploadResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "invalid_body",
      detail: parsed.error.message,
    };
  }

  return { kind: "ok", data: parsed.data };
}

export async function summarizePaper(
  baseUrl: string | undefined,
  paperId: string,
  init?: RequestInit,
): Promise<PaperSummarizeResult> {
  const base = normalizeApiBaseUrl(baseUrl);
  if (!base) {
    return { kind: "missing_base_url" };
  }

  let response: Response;
  try {
    response = await fetch(`${base}/v1/papers/${paperId}/summarize`, {
      ...init,
      method: "POST",
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

  const parsed = paperSummaryResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "invalid_body",
      detail: parsed.error.message,
    };
  }

  return { kind: "ok", data: parsed.data };
}
