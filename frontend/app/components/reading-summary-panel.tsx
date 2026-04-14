"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  summarizePaper,
  type PaperSummarizeResult,
  type PaperSummaryResponse,
} from "@/lib/api/papers";

const DOHERTY_MS = 400;

type Phase =
  | { kind: "idle" }
  | { kind: "loading"; showSkeleton: boolean }
  | { kind: "ok"; data: PaperSummaryResponse }
  | {
      kind: "error";
      result: Exclude<PaperSummarizeResult, { kind: "ok" }>;
      detail: string;
    };

function summarizeErrorMessage(
  result: Exclude<PaperSummarizeResult, { kind: "ok" }>,
): string {
  switch (result.kind) {
    case "missing_base_url":
      return "NEXT_PUBLIC_API_BASE_URL が未設定です。";
    case "network_error":
      return result.message;
    case "http_error":
      return `HTTP ${result.status}（${result.statusText}）`;
    case "invalid_json":
      return "JSON として解釈できませんでした。";
    case "invalid_body":
      return result.detail;
  }
}

type Props = {
  apiBaseUrl: string | undefined;
  paperId: string | null;
};

const SUMMARY_FIELDS: {
  key: keyof PaperSummaryResponse;
  label: string;
}[] = [
  { key: "one_liner", label: "一言" },
  { key: "purpose", label: "目的" },
  { key: "method", label: "手法" },
  { key: "results", label: "結果" },
  { key: "takeaways", label: "示唆" },
  { key: "keywords", label: "キーワード" },
];

export function ReadingSummaryPanel({ apiBaseUrl, paperId }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!paperId) {
      setPhase({ kind: "idle" });
    }
  }, [paperId]);

  const runSummarize = async () => {
    if (!paperId || phase.kind === "loading") return;

    setPhase({ kind: "loading", showSkeleton: false });
    clearTimer();
    timerRef.current = setTimeout(() => {
      setPhase((p) => (p.kind === "loading" ? { ...p, showSkeleton: true } : p));
    }, DOHERTY_MS);

    const result = await summarizePaper(apiBaseUrl, paperId);
    clearTimer();

    if (result.kind === "ok") {
      setPhase({ kind: "ok", data: result.data });
      return;
    }

    setPhase({
      kind: "error",
      result,
      detail: summarizeErrorMessage(result),
    });
  };

  const disabled = !paperId || phase.kind === "loading";

  return (
    <section
      className="border-b border-border-subtle bg-neutral-50/90 p-paper-4 dark:bg-neutral-900/30"
      aria-labelledby="reading-summary-heading"
    >
      <h2
        id="reading-summary-heading"
        className="text-base font-semibold tracking-tight text-foreground"
      >
        要約
      </h2>
      <p className="mt-paper-2 text-sm text-muted-foreground">
        サーバーが PDF からテキストを抜き出し、日本語の構造化要約を返します（
        <code className="font-mono text-foreground">POST /v1/papers/…/summarize</code>）。
      </p>

      <div className="mt-paper-3">
        <button
          type="button"
          className="min-h-11 w-full rounded-md bg-primary-600 px-paper-4 text-sm font-medium text-white hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onClick={() => void runSummarize()}
        >
          {phase.kind === "loading" ? "要約を生成中…" : "この論文を要約"}
        </button>
        {!paperId ? (
          <p className="mt-paper-2 text-xs text-muted-foreground">
            PDF をファイルから開くとアップロードされ、要約が利用できます。
          </p>
        ) : null}
      </div>

      {phase.kind === "loading" && phase.showSkeleton ? (
        <div
          className="mt-paper-4 space-y-paper-2 rounded-md border border-border-subtle bg-background p-paper-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm text-muted-foreground">要約を待っています…</p>
          <div className="space-y-2 motion-reduce:animate-none">
            <div className="h-3 w-full rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
            <div className="h-3 w-[92%] rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
            <div className="h-3 w-4/5 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
          </div>
        </div>
      ) : null}

      {phase.kind === "ok" ? (
        <div className="mt-paper-4 space-y-paper-3">
          <p className="text-sm font-medium text-semantic-success" role="status">
            要約ができました
          </p>
          {phase.data.truncated_source ? (
            <p className="text-xs text-muted-foreground">
              原文が長いため抜粋に基づく要約です（サーバー側でテキストを切り詰めました）。
            </p>
          ) : null}
          <h3 className="text-lg font-semibold leading-snug text-foreground">
            {phase.data.title_ja || "（タイトルなし）"}
          </h3>
          <div className="space-y-paper-2">
            {SUMMARY_FIELDS.map(({ key, label }) => {
              const text = phase.data[key];
              if (typeof text !== "string" || !text.trim()) return null;
              return (
                <details
                  key={key}
                  className="group rounded-md border border-border-subtle bg-background open:pb-paper-2"
                  open={key === "one_liner"}
                >
                  <summary className="cursor-pointer list-none px-paper-3 py-paper-2 text-sm font-medium text-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex w-full items-center justify-between gap-paper-2">
                      {label}
                      <span className="text-xs font-normal text-muted-foreground group-open:hidden">
                        開く
                      </span>
                      <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
                        閉じる
                      </span>
                    </span>
                  </summary>
                  <p className="px-paper-3 pb-paper-2 text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                    {text}
                  </p>
                </details>
              );
            })}
          </div>
        </div>
      ) : null}

      {phase.kind === "error" ? (
        <div className="mt-paper-4 space-y-paper-2" role="alert">
          <p className="text-sm font-medium text-semantic-danger">要約に失敗しました</p>
          <p className="text-sm text-muted-foreground">{phase.detail}</p>
        </div>
      ) : null}
    </section>
  );
}
