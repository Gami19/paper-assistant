"use client";

import { useSyncExternalStore } from "react";
import Markdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneLight,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";

function subscribePrefersDark(onStoreChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getPrefersDarkSnapshot(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getPrefersDarkServerSnapshot(): boolean {
  return false;
}

function usePrefersColorSchemeDark(): boolean {
  return useSyncExternalStore(
    subscribePrefersDark,
    getPrefersDarkSnapshot,
    getPrefersDarkServerSnapshot,
  );
}

type MarkdownBodyProps = {
  children: string;
  className?: string;
  /** 要約パネルなど狭いカラム向けに本文を一段小さくする */
  compact?: boolean;
};

export function MarkdownBody({
  children,
  className = "",
  compact = false,
}: MarkdownBodyProps) {
  const isDark = usePrefersColorSchemeDark();
  const prismStyle = isDark ? vscDarkPlus : oneLight;
  const codeFontSize = compact ? "0.8125rem" : "0.875rem";

  const components: Components = {
    pre({ children }) {
      return (
        <div className="not-prose my-3 overflow-x-auto first:mt-0 last:mb-0">{children}</div>
      );
    },
    code({ className: codeClass, children }) {
      const text = String(children).replace(/\n$/, "");
      const match = /language-(\w+)/.exec(codeClass || "");

      if (match) {
        return (
          <SyntaxHighlighter
            language={match[1]}
            style={prismStyle}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: "0.75rem 1rem",
              borderRadius: "0.375rem",
              fontSize: codeFontSize,
              lineHeight: 1.5,
            }}
          >
            {text}
          </SyntaxHighlighter>
        );
      }

      if (text.includes("\n")) {
        return (
          <SyntaxHighlighter
            language="plaintext"
            style={prismStyle}
            PreTag="div"
            customStyle={{
              margin: 0,
              padding: "0.75rem 1rem",
              borderRadius: "0.375rem",
              fontSize: codeFontSize,
              lineHeight: 1.5,
            }}
          >
            {text}
          </SyntaxHighlighter>
        );
      }

      return (
        <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em] text-foreground dark:bg-neutral-800">
          {children}
        </code>
      );
    },
  };

  return (
    <div
      className={`markdown-body prose max-w-none text-foreground prose-headings:scroll-mt-20 ${
        compact ? "prose-sm" : "prose-sm sm:prose-base"
      } ${isDark ? "prose-invert" : "prose-neutral"} ${className}`}
    >
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={components}>
        {children}
      </Markdown>
    </div>
  );
}
