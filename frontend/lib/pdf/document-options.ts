import type { DocumentProps } from "react-pdf";

/**
 * pdf.js v5: `standardFontDataUrl` 未指定だと標準 14 フォント（Helvetica 等）で
 * 「Base font is not specified」警告や描画失敗が起きうる。
 * `wasmUrl` / `cMapUrl` は日本語・画像圧縮 PDF 向け（postinstall で public に同梱）。
 *
 * @see scripts/copy-pdf-worker.mjs
 */
export const PDF_DOCUMENT_OPTIONS = {
  standardFontDataUrl: "/standard_fonts/",
  wasmUrl: "/wasm/",
  cMapUrl: "/cmaps/",
} as const satisfies NonNullable<DocumentProps["options"]>;
