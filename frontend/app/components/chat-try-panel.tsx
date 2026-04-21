"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MarkdownBody } from "@/app/components/markdown-body";
import { DevNote } from "@/app/components/dev-note";
import { fetchChatReply, type ChatReplyResult } from "@/lib/api/chat";

const DOHERTY_MS = 400;

type UiState =
  | { phase: "idle" }
  | { phase: "sending"; showDelayedUi: boolean }
  | { phase: "success"; content: string }
  | {
      phase: "error";
      kind: "network" | "http" | "parse" | "config";
      detail: string;
      status?: number;
    };

function mapResultToError(result: ChatReplyResult): UiState | null {
  switch (result.kind) {
    case "ok":
      return { phase: "success", content: result.data.content };
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
      return `ネットワーク: ${state.detail}。API が起動しているか、オフラインでないかを確認してください。ブラウザから直接 API を叩く場合は、バックエンドの CORS_ALLOW_ORIGINS にこのサイトのオリジン（例: http://localhost:3000）が含まれているかも確認してください。`;
    case "http":
      return `HTTP ${state.status ?? "?"}（${state.detail}）。ローカルでは CHAT_MOCK_MODE=true でモック応答に切り替えられるか、Bedrock 利用時は認証・モデル ID を確認してください。`;
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
  /** 論文読解レイアウトの右パネル用（高さ・見出しを調整） */
  variant?: "full" | "sidebar";
};

export function ChatTryPanel({ apiBaseUrl, variant = "full" }: Props) {
  const [input, setInput] = useState("");
  const [ui, setUi] = useState<UiState>({ phase: "idle" });
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDelayTimer = useCallback(() => {
    if (delayTimerRef.current !== null) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearDelayTimer(), [clearDelayTimer]);

  const send = async () => {
    const trimmed = input.trim();
    if (!trimmed || ui.phase === "sending") return;

    setUi({ phase: "sending", showDelayedUi: false });
    clearDelayTimer();
    delayTimerRef.current = setTimeout(() => {
      setUi((prev) =>
        prev.phase === "sending" ? { ...prev, showDelayedUi: true } : prev,
      );
    }, DOHERTY_MS);

    const result = await fetchChatReply(apiBaseUrl, [
      { role: "user", content: trimmed },
    ]);

    clearDelayTimer();
    const next = mapResultToError(result);
    if (next) {
      setUi(next);
    }
  };

  const clearInput = () => {
    setInput("");
    if (ui.phase !== "sending") {
      setUi({ phase: "idle" });
    }
  };

  const isSending = ui.phase === "sending";

  const isSidebar = variant === "sidebar";

  return (
    <section
      className={
        isSidebar
          ? "flex h-full min-h-[min(40vh,24rem)] flex-col border-0 bg-neutral-50 p-paper-4 dark:bg-neutral-900/40 lg:min-h-0"
          : "rounded-lg border border-border-subtle bg-neutral-50 p-paper-6 dark:bg-neutral-900/40"
      }
      aria-labelledby="chat-try-heading"
    >
      <h2
        id="chat-try-heading"
        className={`font-semibold tracking-tight text-foreground ${isSidebar ? "text-base" : "text-lg"}`}
      >
        {isSidebar ? "チャット（補助）" : "試しに 1 往復（FE-2 / M2）"}
      </h2>
      <DevNote>
        <p className="mt-paper-2 text-sm text-muted-foreground">
          {isSidebar ? (
            <>
              読みながら質問する用（F1-2 接続予定）。{" "}
              <code className="font-mono text-foreground">POST /v1/chat</code>
            </>
          ) : (
            <>
              ブラウザから <code className="font-mono text-foreground">POST /v1/chat</code>{" "}
              を呼び出します。CORS と{" "}
              <code className="font-mono text-foreground">CHAT_MOCK_MODE</code> の設定が必要です。
            </>
          )}
        </p>
      </DevNote>

      <div
        className={`mt-paper-4 flex min-h-0 flex-1 flex-col gap-paper-4 ${isSidebar ? "overflow-y-auto" : ""}`}
      >
        <label className="flex min-h-0 flex-1 flex-col gap-paper-2">
          <span className="text-sm font-medium text-foreground">メッセージ</span>
          <textarea
            className={`min-h-[6rem] rounded-md border border-border-subtle bg-background px-paper-3 py-paper-2 text-sm text-foreground outline-none ring-primary-500 focus-visible:ring-2 ${isSidebar ? "min-h-[5rem] flex-1 lg:min-h-[8rem]" : ""}`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isSending}
            placeholder="ここに入力して送信…"
            aria-busy={isSending}
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
            className="min-h-11 rounded-md border border-border-subtle bg-background px-paper-4 py-paper-2 text-sm font-medium text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50"
            onClick={clearInput}
            disabled={isSending}
          >
            入力をクリア
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
              <div className="h-3 w-3/5 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
            </div>
          </div>
        ) : null}

        {ui.phase === "success" ? (
          <div className="max-w-[65ch] space-y-paper-2">
            <p className="text-sm font-medium text-semantic-success" role="status">
              アシスタントの応答
            </p>
            <div className="text-base leading-relaxed text-foreground">
              <MarkdownBody>{ui.content}</MarkdownBody>
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
