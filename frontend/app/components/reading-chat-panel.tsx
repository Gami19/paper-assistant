"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchChatReply,
  type ChatMessage,
  type ChatReplyResult,
} from "@/lib/api/chat";

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

type Props = {
  apiBaseUrl: string | undefined;
  /** アップロード済み論文があるときのみチャット推奨（null でも送信は可能） */
  paperId: string | null;
  /** 選択テキスト等。リクエストの paper_excerpt に載せる */
  paperExcerpt: string;
  currentPage: number;
  onClearExcerpt: () => void;
};

export function ReadingChatPanel({
  apiBaseUrl,
  paperId,
  paperExcerpt,
  currentPage,
  onClearExcerpt,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [ui, setUi] = useState<UiState>({ phase: "idle" });
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

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

    const result = await fetchChatReply(apiBaseUrl, nextMessages, undefined, {
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
      <p className="mt-paper-2 text-sm text-muted-foreground">
        会話履歴ごと <code className="font-mono text-foreground">POST /v1/chat</code> に送信します。
        現在の表示ページは <span className="font-medium text-foreground">{currentPage}</span> です。
        {paperId ? null : (
          <span className="mt-1 block text-semantic-warning">
            ローカル／URL のみの PDF ではサーバー側の全文はありません。必要ならファイルをアップロードしてください。
          </span>
        )}
      </p>

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
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
                {m.content}
              </p>
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
