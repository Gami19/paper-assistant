import type { DocumentProps } from "react-pdf";
import { pdfjs } from "react-pdf";

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

/**
 * 読書ビュー用。参照をコンポーネント外で固定し、react-pdf の
 * 「Options prop changed, but equal」警告と不要な再読込を避ける。
 */
export const PDF_READING_DOCUMENT_OPTIONS = {
  ...PDF_DOCUMENT_OPTIONS,
  verbosity: pdfjs.VerbosityLevel.ERRORS,
} as const satisfies NonNullable<DocumentProps["options"]>;
