import { RefreshHealthButton } from "@/app/components/refresh-health-button";
import { DevNote } from "@/app/components/dev-note";
import type { HealthCheckResult } from "@/lib/api/health";

type Props = {
  result: HealthCheckResult;
};

function statusLabel(result: HealthCheckResult): string {
  switch (result.kind) {
    case "ok":
      return "状態: 接続できています";
    case "missing_base_url":
      return "状態: 設定が未入力です";
    case "http_error":
      return "状態: サーバーがエラーを返しました";
    case "network_error":
      return "状態: 接続できませんでした";
    case "invalid_json":
      return "状態: 応答の形式が不正です";
    case "invalid_body":
      return "状態: 応答が想定と異なります";
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export function BackendHealthCard({ result }: Props) {
  const showRetry = result.kind !== "ok";

  return (
    <section
      className="rounded-lg border border-border-subtle bg-neutral-50 p-paper-6 dark:bg-neutral-900/40"
      aria-labelledby="backend-health-heading"
    >
      <h2
        id="backend-health-heading"
        className="text-lg font-semibold tracking-tight text-foreground"
      >
        バックエンド接続
      </h2>
      <DevNote>
        <p className="mt-paper-2 text-sm text-muted-foreground">
          M1 疎通確認（サーバー経由で <code className="font-mono text-foreground">/health</code>{" "}
          を呼び出しています）
        </p>
      </DevNote>

      <div className="mt-paper-4 flex flex-col gap-paper-3">
        <p
          className={
            result.kind === "ok"
              ? "text-sm font-medium text-semantic-success"
              : "text-sm font-medium text-semantic-danger"
          }
          role="status"
        >
          {statusLabel(result)}
        </p>

        {result.kind === "ok" ? (
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            サービス名 <span className="font-mono text-foreground">{result.data.service}</span>{" "}
            から正常応答を受け取りました。
          </p>
        ) : null}

        {result.kind === "missing_base_url" ? (
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            <code className="font-mono text-foreground">NEXT_PUBLIC_API_BASE_URL</code>{" "}
            が空です。リポジトリの <code className="font-mono text-foreground">frontend/.env.example</code>{" "}
            を参考に <code className="font-mono text-foreground">.env.local</code>{" "}
            を作成し、FastAPI の基底 URL（例: <code className="font-mono text-foreground">http://127.0.0.1:8000</code>
            ）を設定してください。保存したらこのページを再読み込みするか、下のボタンで再確認できます。
          </p>
        ) : null}

        {result.kind === "http_error" ? (
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            HTTP {result.status}（{result.statusText}）が返りました。バックエンドが起動しているか、URL
            が正しいかを確認してください。本番では Vercel の環境変数と Railway（等）のデプロイ URL
            が一致しているかもあわせて確認してください。
          </p>
        ) : null}

        {result.kind === "network_error" ? (
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            ネットワークエラー: {result.message}。ローカルでは API サーバーを起動しているか、ファイアウォールや
            VPN の影響がないかを確認してください。
          </p>
        ) : null}

        {result.kind === "invalid_json" ? (
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            JSON として解釈できない応答でした。URL が API ではなく HTML ページを返していないか確認してください。
          </p>
        ) : null}

        {result.kind === "invalid_body" ? (
          <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
            応答の形が <code className="font-mono text-foreground">lib/api/health.ts</code>{" "}
            の契約と一致しません。詳細: {result.detail}
          </p>
        ) : null}

        {showRetry ? (
          <div className="pt-paper-2">
            <RefreshHealthButton />
          </div>
        ) : null}
      </div>
    </section>
  );
}
