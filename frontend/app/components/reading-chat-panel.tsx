"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MarkdownBody } from "@/app/components/markdown-body";
import { DevNote } from "@/app/components/dev-note";
import type { FigureImagePxRect } from "@/app/components/paper-page-figure-selection";
import {
  fetchChatReply,
  fetchChatVisionReply,
  type ChatMessage,
  type ChatReplyResult,
} from "@/lib/api/chat";
import { fetchPaperPageText } from "@/lib/api/paper-pages";

const DOHERTY_MS = 400;

type UiState =
  | { phase: "idle" }
  | { phase: "sending"; showDelayedUi: boolean }
  | {
      phase: "error";
      kind: "network" | "http" | "parse" | "config";
      detail: string;
      status?: number;
    };

function mapResultToError(result: ChatReplyResult): UiState | null {
  switch (result.kind) {
    case "ok":
      return null;
    case "missing_base_url":
      return {
        phase: "error",
        kind: "config",
        detail:
          "NEXT_PUBLIC_API_BASE_URL が未設定です。.env.local にバックエンドの基底 URL を設定してください。",
      };
    case "network_error":
      return {
        phase: "error",
        kind: "network",
        detail: result.message,
      };
    case "http_error":
      return {
        phase: "error",
        kind: "http",
        status: result.status,
        detail: result.statusText,
      };
    case "invalid_json":
      return {
        phase: "error",
        kind: "parse",
        detail: "JSON として解釈できませんでした。URL が API を指しているか確認してください。",
      };
    case "invalid_body":
      return {
        phase: "error",
        kind: "parse",
        detail: `応答が lib/api/chat.ts の契約と一致しません: ${result.detail}`,
      };
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

function errorHelpText(state: Extract<UiState, { phase: "error" }>): string {
  switch (state.kind) {
    case "config":
      return state.detail;
    case "network":
      return `ネットワーク: ${state.detail}。API が起動しているか確認してください。CORS_ALLOW_ORIGINS にこのオリジンが含まれているかも確認してください。`;
    case "http":
      return `HTTP ${state.status ?? "?"}（${state.detail}）。CHAT_MOCK_MODE や Bedrock 設定を確認してください。`;
    case "parse":
      return state.detail;
    default: {
      const _kind: never = state.kind;
      return _kind;
    }
  }
}

/** フェーズ D: 参照スタックの 1 要素（`id` は UI 用） */
export type VisionFigureRef = {
  id: string;
  page: number;
  scale: number;
  rect: FigureImagePxRect;
  figureLabel?: string;
};

type PagePreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; text: string; truncated: boolean }
  | { status: "error"; message: string };

type Props = {
  apiBaseUrl: string | undefined;
  /** アップロード済み論文があるときのみチャット推奨（null でも送信は可能） */
  paperId: string | null;
  /** 選択テキスト等。リクエストの paper_excerpt に載せる（Vision 送信時は使わない） */
  paperExcerpt: string;
  currentPage: number;
  onClearExcerpt: () => void;
  /** 1 件以上で `POST /v1/chat/vision`（selections 配列） */
  visionSelections: VisionFigureRef[];
  onRemoveVisionSelection: (id: string) => void;
  /** 会話クリア時に参照スタックも捨てる */
  onClearVisionStack?: () => void;
};

export function ReadingChatPanel({
  apiBaseUrl,
  paperId,
  paperExcerpt,
  currentPage,
  onClearExcerpt,
  visionSelections,
  onRemoveVisionSelection,
  onClearVisionStack,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [ui, setUi] = useState<UiState>({ phase: "idle" });
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const [pageTextPreview, setPageTextPreview] = useState<Record<number, PagePreviewState>>({});

  const useVision = Boolean(paperId && visionSelections.length > 0);
  const previewPagesKey = [...new Set(visionSelections.map((s) => s.page))]
    .sort((a, b) => a - b)
    .join(",");

  const clearDelayTimer = useCallback(() => {
    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearDelayTimer(), [clearDelayTimer]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, ui]);

  useEffect(() => {
    if (!paperId || visionSelections.length === 0) {
      setPageTextPreview({});
      return;
    }
    const pages = [...new Set(visionSelections.map((s) => s.page))].sort((a, b) => a - b);
    let cancelled = false;
    void (async () => {
      const loading: Record<number, PagePreviewState> = {};
      for (const p of pages) loading[p] = { status: "loading" };
      setPageTextPreview(loading);
      for (const p of pages) {
        const res = await fetchPaperPageText(apiBaseUrl, paperId, p, "pm1");
        if (cancelled) return;
        if (res.kind === "ok") {
          setPageTextPreview((prev) => ({
            ...prev,
            [p]: {
              status: "ok",
              text: res.data.text,
              truncated: res.data.truncated,
            },
          }));
        } else {
          const msg =
            res.kind === "missing_base_url"
              ? "API の基底 URL が未設定です。"
              : res.kind === "network_error"
                ? res.message
                : res.kind === "http_error"
                  ? `HTTP ${res.status}`
                  : res.detail;
          setPageTextPreview((prev) => ({
            ...prev,
            [p]: { status: "error", message: msg },
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, paperId, previewPagesKey]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || ui.phase === "sending") return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];

    setUi({ phase: "sending", showDelayedUi: false });
    clearDelayTimer();
    delayTimerRef.current = setTimeout(() => {
      setUi((prev) =>
        prev.phase === "sending" ? { ...prev, showDelayedUi: true } : prev,
      );
    }, DOHERTY_MS);

    const result: ChatReplyResult = useVision
      ? await fetchChatVisionReply(apiBaseUrl, nextMessages, {
          paper_id: paperId!,
          selections: visionSelections.map((s) => ({
            page: s.page,
            scale: s.scale,
            rect: s.rect,
            figure_label: s.figureLabel ?? null,
          })),
        })
      : await fetchChatReply(apiBaseUrl, nextMessages, undefined, {
          paperExcerpt: paperExcerpt.trim() || null,
        });

    clearDelayTimer();

    const err = mapResultToError(result);
    if (err) {
      setUi(err);
      return;
    }

    if (result.kind !== "ok") return;

    setMessages([
      ...nextMessages,
      { role: "assistant", content: result.data.content },
    ]);
    setInput("");
    setUi({ phase: "idle" });
  };

  const isSending = ui.phase === "sending";

  const clearConversation = () => {
    setMessages([]);
    setInput("");
    if (ui.phase !== "sending") {
      setUi({ phase: "idle" });
    }
    onClearExcerpt();
    onClearVisionStack?.();
  };

  return (
    <section
      className="flex h-full min-h-[min(40vh,24rem)] flex-col border-0 bg-neutral-50 p-paper-4 dark:bg-neutral-900/40 lg:min-h-0"
      aria-labelledby="reading-chat-heading"
    >
      <h2
        id="reading-chat-heading"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        論文 Q&A
      </h2>
      <DevNote>
        <p className="mt-paper-2 text-sm text-muted-foreground">
          {useVision ? (
            <>
              会話履歴ごと{" "}
              <code className="font-mono text-foreground">POST /v1/chat/vision</code>{" "}
              に送信します（参照スタック順に複数 PNG と ±1 本文をサーバーが合成）。
            </>
          ) : (
            <>
              会話履歴ごと{" "}
              <code className="font-mono text-foreground">POST /v1/chat</code> に送信します。
            </>
          )}{" "}
          現在の表示ページは <span className="font-medium text-foreground">{currentPage}</span> です。
          {paperId ? null : (
            <span className="mt-1 block text-semantic-warning">
              ローカル／URL のみの PDF ではサーバー側の全文はありません。必要ならファイルをアップロードしてください。
            </span>
          )}
        </p>
      </DevNote>

      {paperId && !useVision ? (
        <p className="mt-paper-2 max-w-[65ch] text-xs text-muted-foreground" role="note">
          図・表について質問するには、ツールバーの「図・表を選択」で範囲を確定し、「参照に追加」でスタックに載せてください（
          <code className="font-mono text-foreground">image_px</code> と同一{" "}
          <code className="font-mono text-foreground">scale</code>）。
        </p>
      ) : null}

      {useVision && visionSelections.length > 0 ? (
        <div className="mt-paper-3 flex flex-wrap items-center gap-paper-2" aria-label="図参照スタック">
          <span className="text-xs font-medium text-muted-foreground">参照:</span>
          {visionSelections.map((s, i) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-background px-paper-2 py-1 text-xs text-foreground"
            >
              <span>
                （ページ {s.page}）#{i + 1}
                {s.figureLabel ? (
                  <span className="text-muted-foreground"> · {s.figureLabel}</span>
                ) : null}
              </span>
              <button
                type="button"
                className="rounded px-1 text-muted-foreground hover:bg-neutral-200 hover:text-foreground dark:hover:bg-neutral-700"
                onClick={() => onRemoveVisionSelection(s.id)}
                aria-label={`参照 ${i + 1} を削除`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {useVision && paperId && visionSelections.length > 0 ? (
        <details className="mt-paper-2 rounded-md border border-border-subtle bg-background p-paper-3">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            本文プレビュー（±1 ページ）
          </summary>
          <div className="mt-paper-3 space-y-paper-3 text-xs text-muted-foreground">
            {[...new Set(visionSelections.map((s) => s.page))]
              .sort((a, b) => a - b)
              .map((p) => {
                const st = pageTextPreview[p] ?? { status: "idle" as const };
                return (
                  <div key={p}>
                    <p className="font-medium text-foreground">中心ページ {p}</p>
                    {st.status === "loading" || st.status === "idle" ? (
                      <p className="mt-1 text-muted-foreground">読み込み中…</p>
                    ) : null}
                    {st.status === "error" ? (
                      <p className="mt-1 text-semantic-danger" role="alert">
                        {st.message}
                      </p>
                    ) : null}
                    {st.status === "ok" ? (
                      <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded border border-border-subtle bg-neutral-50 p-paper-2 text-[0.8rem] leading-snug text-foreground dark:bg-neutral-900/50">
                        {st.text || "（本文なし）"}
                        {st.truncated ? (
                          <span className="block pt-1 text-semantic-warning">（サーバー側で切り詰め済み）</span>
                        ) : null}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </details>
      ) : null}

      {useVision && paperExcerpt.trim() ? (
        <p className="mt-paper-2 max-w-[65ch] text-xs text-amber-900 dark:text-amber-100/90" role="status">
          図参照モードではテキスト抜粋（<code className="font-mono">paper_excerpt</code>
          ）は送信されません。本文はサーバーが付与します。
        </p>
      ) : null}

      {paperExcerpt.trim() ? (
        <div className="mt-paper-3 flex flex-wrap items-start gap-paper-2 rounded-md border border-primary-200 bg-primary-50/80 p-paper-3 dark:border-primary-900 dark:bg-primary-950/40">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">選択抜粋</span> を文脈（
            <code className="font-mono">paper_excerpt</code>）に含めて送信します。
          </p>
          <button
            type="button"
            className="min-h-9 shrink-0 rounded-md border border-border-subtle bg-background px-paper-3 text-xs font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={onClearExcerpt}
          >
            抜粋をクリア
          </button>
        </div>
      ) : null}

      <div className="mt-paper-4 flex min-h-0 flex-1 flex-col gap-paper-3 overflow-y-auto">
        <ul className="space-y-paper-3" aria-label="会話">
          {messages.map((m, i) => (
            <li
              key={`${i}-${m.role}`}
              className={`rounded-md border border-border-subtle p-paper-3 text-sm ${
                m.role === "user"
                  ? "bg-background"
                  : "bg-neutral-100/90 dark:bg-neutral-800/50"
              }`}
            >
              <p className="text-xs font-medium text-muted-foreground">
                {m.role === "user" ? "あなた" : "アシスタント"}
              </p>
              <div className="mt-1 leading-relaxed text-foreground">
                <MarkdownBody>{m.content}</MarkdownBody>
              </div>
            </li>
          ))}
          <div ref={listEndRef} />
        </ul>

        <label className="flex min-h-0 flex-col gap-paper-2">
          <span className="text-sm font-medium text-foreground">メッセージ</span>
          <textarea
            className="min-h-[5rem] flex-1 rounded-md border border-border-subtle bg-background px-paper-3 py-paper-2 text-sm text-foreground outline-none ring-primary-500 focus-visible:ring-2 lg:min-h-[6rem]"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder="論文について質問…"
            aria-busy={isSending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
        </label>

        <div className="flex flex-wrap gap-paper-3">
          <button
            type="button"
            className="min-h-11 rounded-md bg-primary-600 px-paper-4 py-paper-2 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50"
            onClick={() => void send()}
            disabled={isSending || !input.trim()}
          >
            送信
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-border-subtle bg-background px-paper-4 py-paper-2 text-sm font-medium text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
            onClick={clearConversation}
            disabled={isSending}
          >
            会話をクリア
          </button>
        </div>

        {ui.phase === "sending" && ui.showDelayedUi ? (
          <div
            className="max-w-[65ch] space-y-paper-2 rounded-md border border-border-subtle bg-background p-paper-4"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm text-muted-foreground">応答を待っています…</p>
            <div className="space-y-2 motion-reduce:animate-none">
              <div className="h-3 w-full rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
              <div className="h-3 w-4/5 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
            </div>
          </div>
        ) : null}

        {ui.phase === "error" ? (
          <div className="max-w-[65ch] space-y-paper-2" role="alert">
            <p className="text-sm font-medium text-semantic-danger">送信に失敗しました</p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {errorHelpText(ui)}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
