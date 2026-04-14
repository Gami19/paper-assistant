import { z } from "zod";

import { normalizeApiBaseUrl } from "@/lib/api/health";

/**
 * POST /v1/chat の JSON 契約の正（二重定義禁止。変更時は FastAPI・pytest を同期すること）。
 */
export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatResponseSchema = z.object({
  role: z.literal("assistant"),
  content: z.string(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;

export type ChatReplyResult =
  | { kind: "missing_base_url" }
  | { kind: "ok"; data: ChatResponse }
  | { kind: "http_error"; status: number; statusText: string }
  | { kind: "network_error"; message: string }
  | { kind: "invalid_json" }
  | { kind: "invalid_body"; detail: string };

/** POST /v1/chat のリクエスト JSON（FastAPI `ChatRequest` と同期）。 */
export type ChatRequestPayload = {
  messages: ChatMessage[];
  paper_excerpt?: string;
};

export async function fetchChatReply(
  baseUrl: string | undefined,
  messages: ChatMessage[],
  init?: RequestInit,
  options?: { paperExcerpt?: string | null },
): Promise<ChatReplyResult> {
  const base = normalizeApiBaseUrl(baseUrl);
  if (!base) {
    return { kind: "missing_base_url" };
  }

  const url = `${base}/v1/chat`;
  const payload: ChatRequestPayload = { messages };
  const excerpt = options?.paperExcerpt?.trim();
  if (excerpt) {
    payload.paper_excerpt = excerpt;
  }
  const body = JSON.stringify(payload);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...init?.headers,
      },
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

  const parsed = chatResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      kind: "invalid_body",
      detail: parsed.error.message,
    };
  }

  return { kind: "ok", data: parsed.data };
}
