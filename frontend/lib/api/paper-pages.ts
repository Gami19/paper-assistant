import { z } from "zod";

import { normalizeApiBaseUrl } from "@/lib/api/health";

/** バックエンド `GET .../pages/{page}/image` の既定 scale と一致させる */
export const DEFAULT_PAPER_PAGE_IMAGE_SCALE = 2;

/** ブラウザ: `NEXT_PUBLIC_PAPER_PAGE_IMAGE_SCALE` があれば数値化（無効時は既定）。API の `scale` と同一にすること。 */
export function getConfiguredPaperPageImageScale(): number {
  if (typeof process === "undefined") return DEFAULT_PAPER_PAGE_IMAGE_SCALE;
  const raw = process.env.NEXT_PUBLIC_PAPER_PAGE_IMAGE_SCALE;
  if (raw === undefined || raw.trim() === "") return DEFAULT_PAPER_PAGE_IMAGE_SCALE;
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAPER_PAGE_IMAGE_SCALE;
  return n;
}

const DEFAULT_CHAT_VISION_MAX_FIGURES = 3;

/** `POST /v1/chat/vision` の参照数上限表示用（バックエンド既定 3 と揃える。1〜10 にクランプ）。 */
export function getConfiguredChatVisionMaxFigures(): number {
  if (typeof process === "undefined") return DEFAULT_CHAT_VISION_MAX_FIGURES;
  const raw = process.env.NEXT_PUBLIC_CHAT_VISION_MAX_FIGURES;
  if (raw === undefined || raw.trim() === "") return DEFAULT_CHAT_VISION_MAX_FIGURES;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_CHAT_VISION_MAX_FIGURES;
  return Math.min(10, Math.max(1, n));
}

export type PaperPageImageHeaders = {
  page: number;
  scale: number;
  width: number;
  height: number;
};

function parsePaperImageHeaders(response: Response): PaperPageImageHeaders | null {
  const page = Number.parseInt(response.headers.get("X-Paper-Page") ?? "", 10);
  const scale = Number.parseFloat(response.headers.get("X-Paper-Scale") ?? "");
  const width = Number.parseInt(response.headers.get("X-Paper-Width") ?? "", 10);
  const height = Number.parseInt(response.headers.get("X-Paper-Height") ?? "", 10);
  if (
    !Number.isFinite(page) ||
    !Number.isFinite(scale) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    page < 1 ||
    width < 1 ||
    height < 1
  ) {
    return null;
  }
  return { page, scale, width, height };
}

export type PaperPageImageResult =
  | { kind: "missing_base_url" }
  | { kind: "ok"; blob: Blob; headers: PaperPageImageHeaders }
  | { kind: "http_error"; status: number; statusText: string }
  | { kind: "network_error"; message: string }
  | { kind: "invalid_body"; detail: string };

/**
 * GET /v1/papers/{paper_id}/pages/{page}/image — PNG（矩形座標 image_px の基準画像）。
 */
export async function fetchPaperPageImage(
  baseUrl: string | undefined,
  paperId: string,
  page: number,
  scale: number = DEFAULT_PAPER_PAGE_IMAGE_SCALE,
  init?: RequestInit,
): Promise<PaperPageImageResult> {
  const base = normalizeApiBaseUrl(baseUrl);
  if (!base) {
    return { kind: "missing_base_url" };
  }
  if (page < 1 || !Number.isFinite(scale) || scale <= 0) {
    return { kind: "invalid_body", detail: "page または scale が不正です。" };
  }

  const url = `${base}/v1/papers/${encodeURIComponent(paperId)}/pages/${page}/image?scale=${encodeURIComponent(String(scale))}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "image/png",
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

  const ct = response.headers.get("Content-Type") ?? "";
  if (!ct.includes("image/png")) {
    return {
      kind: "invalid_body",
      detail: `Content-Type が image/png ではありません: ${ct || "(なし)"}`,
    };
  }

  const headerMeta = parsePaperImageHeaders(response);
  if (!headerMeta) {
    return {
      kind: "invalid_body",
      detail: "X-Paper-* ヘッダを解釈できませんでした。",
    };
  }

  const blob = await response.blob();
  return { kind: "ok", blob, headers: headerMeta };
}

const paperPageTextResponseSchema = z.object({
  text: z.string(),
  page: z.number(),
  total_pages: z.number(),
  pages_included: z.array(z.number()),
  truncated: z.boolean(),
});

export type PaperPageTextData = z.infer<typeof paperPageTextResponseSchema>;

export type PaperPageTextResult =
  | { kind: "missing_base_url" }
  | { kind: "ok"; data: PaperPageTextData }
  | { kind: "http_error"; status: number; statusText: string }
  | { kind: "network_error"; message: string }
  | { kind: "invalid_body"; detail: string };

/**
 * GET /v1/papers/{paper_id}/pages/{page}/text — 本文プレビュー用（`context=pm1` で ±1 ページ結合）。
 */
export async function fetchPaperPageText(
  baseUrl: string | undefined,
  paperId: string,
  page: number,
  context: "page" | "pm1" = "pm1",
  init?: RequestInit,
): Promise<PaperPageTextResult> {
  const base = normalizeApiBaseUrl(baseUrl);
  if (!base) {
    return { kind: "missing_base_url" };
  }
  if (page < 1) {
    return { kind: "invalid_body", detail: "page が不正です。" };
  }

  const url = `${base}/v1/papers/${encodeURIComponent(paperId)}/pages/${page}/text?context=${encodeURIComponent(context)}`;

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
    return { kind: "invalid_body", detail: "JSON として解釈できませんでした。" };
  }

  const parsed = paperPageTextResponseSchema.safeParse(json);
  if (!parsed.success) {
    return { kind: "invalid_body", detail: parsed.error.message };
  }

  return { kind: "ok", data: parsed.data };
}
