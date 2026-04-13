"use client";

import dynamic from "next/dynamic";

const ReadingClient = dynamic(
  () =>
    import("@/app/components/reading-client").then((m) => ({
      default: m.ReadingClient,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-dvh items-center justify-center bg-background p-paper-6">
        <p className="text-sm text-muted-foreground">読み込み中…</p>
      </div>
    ),
  },
);

export default function ReadPage() {
  return <ReadingClient apiBaseUrl={process.env.NEXT_PUBLIC_API_BASE_URL} />;
}
