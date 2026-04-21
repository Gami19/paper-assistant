"use client";

import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

function isDevNotesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_DEV_NOTES === "true";
}

export function DevNote({ children, className = "" }: Props) {
  if (!isDevNotesEnabled()) return null;
  return <div className={className}>{children}</div>;
}

