"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = {
  label?: string;
};

export function RefreshHealthButton({ label = "接続を再確認" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex min-h-11 min-w-[44px] items-center justify-center rounded-md bg-primary-600 px-paper-4 py-paper-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "確認中…" : label}
    </button>
  );
}
