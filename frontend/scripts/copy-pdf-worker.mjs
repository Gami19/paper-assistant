/**
 * ADR-006: pdf.js を同一オリジンから配信する（public/ にコピー）。
 * - worker（必須）
 * - standard_fonts（v5 では standardFontDataUrl 未設定だと「Base font is not specified」等になる）
 * - wasm / cmaps（日本語 PDF 等の互換用）
 */
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const dist = join(root, "node_modules/pdfjs-dist");
const destDir = join(root, "public");

mkdirSync(destDir, { recursive: true });

copyFileSync(join(dist, "build/pdf.worker.min.mjs"), join(destDir, "pdf.worker.min.mjs"));

cpSync(join(dist, "standard_fonts"), join(destDir, "standard_fonts"), { recursive: true });
cpSync(join(dist, "wasm"), join(destDir, "wasm"), { recursive: true });
cpSync(join(dist, "cmaps"), join(destDir, "cmaps"), { recursive: true });
