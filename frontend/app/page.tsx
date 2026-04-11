import { BackendHealthCard } from "@/app/components/backend-health-card";
import { fetchBackendHealth } from "@/lib/api/health";

/** 疎通はリクエストごとに取り直す（ビルド時の URL に固定しない） */
export const dynamic = "force-dynamic";

export default async function Home() {
  const health = await fetchBackendHealth(process.env.NEXT_PUBLIC_API_BASE_URL);

  return (
    <div className="flex min-h-full flex-col bg-background">
      <main className="mx-auto flex w-full max-w-prose flex-col gap-paper-8 px-paper-4 py-paper-12">
        <header className="border-b border-border-subtle pb-paper-6">
          <p className="text-sm text-muted-foreground">paper-assistant / FE-1（M1 疎通）</p>
          <h1 className="mt-paper-2 text-2xl font-semibold tracking-tight text-foreground">
            論文読解アシスタント
          </h1>
        </header>
        <p className="max-w-[65ch] text-base leading-relaxed text-muted-foreground">
          フロント足場に加え、バックエンド API への健全性チェックを表示します。デザイントークンは{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-sm text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100">
            globals.css
          </code>{" "}
          を参照してください。
        </p>
        <BackendHealthCard result={health} />
      </main>
    </div>
  );
}
