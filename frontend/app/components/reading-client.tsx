"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

import {
  PaperPageFigureSelection,
  type FigureImagePxRect,
} from "@/app/components/paper-page-figure-selection";
import { ReadingChatPanel, type VisionFigureRef } from "@/app/components/reading-chat-panel";
import { ReadingSummaryPanel } from "@/app/components/reading-summary-panel";
import { normalizeApiBaseUrl } from "@/lib/api/health";
import {
  getConfiguredChatVisionMaxFigures,
  getConfiguredPaperPageImageScale,
} from "@/lib/api/paper-pages";
import { uploadPaper } from "@/lib/api/papers";
import { PDF_READING_DOCUMENT_OPTIONS } from "@/lib/pdf/document-options";
import { isValidPdfPageCount } from "@/lib/pdf/page-number";

// pdfjs の API 本体と同一バージョンの worker を参照する（public への手動コピーよりズレにくい）
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const DEFAULT_PDF = "/sample.pdf";
const ZOOM_STEP = 0.15;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2.5;

type PdfSource = { kind: "url"; url: string } | { kind: "blob"; url: string };

function getPdfSelectionText(container: HTMLElement | null): string {
  if (!container) return "";
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return "";
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return "";
  return sel.toString().replace(/\s+/g, " ").trim();
}

type Props = {
  apiBaseUrl: string | undefined;
};

export function ReadingClient({ apiBaseUrl }: Props) {
  const [source, setSource] = useState<PdfSource>({ kind: "url", url: DEFAULT_PDF });
  const [paperId, setPaperId] = useState<string | null>(null);
  const [paperExcerpt, setPaperExcerpt] = useState("");
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [numPages, setNumPages] = useState<number | null>(null);
  /** 1-based、react-pdf の pageNumber prop と一致 */
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1);
  /** 図・表矩形ドラフト（`GET .../pages/{page}/image` の image_px）。確定後は参照スタックへ追加 */
  const [figureRect, setFigureRect] = useState<FigureImagePxRect | null>(null);
  /** フェーズ D: Vision 送信単位のスタック（ページ・矩形は各要素に保持） */
  const [figureSelections, setFigureSelections] = useState<VisionFigureRef[]>([]);
  const [figSelectMode, setFigSelectMode] = useState(false);
  const pageImageScale = getConfiguredPaperPageImageScale();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [docLoading, setDocLoading] = useState(true);
  const blobUrlRef = useRef<string | null>(null);
  const pdfAreaRef = useRef<HTMLDivElement | null>(null);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => revokeBlob(), [revokeBlob]);

  const setFileFromBlob = useCallback(
    (blob: Blob) => {
      revokeBlob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setSource({ kind: "blob", url });
      setPaperId(null);
      setFigureRect(null);
      setFigureSelections([]);
      setPageNumber(1);
      setNumPages(null);
      setLoadError(null);
      setDocLoading(true);
    },
    [revokeBlob],
  );

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf") {
      setLoadError("PDF ファイル（application/pdf）を選んでください。");
      return;
    }

    const base = normalizeApiBaseUrl(apiBaseUrl);
    if (!base) {
      setLoadError(
        "バックエンド URL（NEXT_PUBLIC_API_BASE_URL）が未設定のためアップロードできません。.env.local を確認するか、サンプル／URL から開いてください。",
      );
      return;
    }

    setUploading(true);
    setLoadError(null);
    setSelectionNotice(null);
    revokeBlob();

    const res = await uploadPaper(apiBaseUrl, file);
    setUploading(false);

    if (res.kind !== "ok") {
      const msg =
        res.kind === "http_error"
          ? `アップロードに失敗しました（HTTP ${res.status}）。`
          : res.kind === "network_error"
            ? `ネットワーク: ${res.message}`
            : res.kind === "invalid_body"
              ? `応答形式が不正です: ${res.detail}`
              : res.kind === "invalid_json"
                ? "応答を JSON として解釈できませんでした。"
                : "アップロードに失敗しました。";
      setLoadError(msg);
      return;
    }

    const id = res.data.paper_id;
    setPaperId(id);
    setFigureRect(null);
    setFigureSelections([]);
    setSource({ kind: "url", url: `${base}/v1/papers/${id}/file` });
    setPageNumber(1);
    setNumPages(null);
    setDocLoading(true);
  };

  const loadFromUrl = async () => {
    const raw = urlInput.trim();
    if (!raw) {
      setLoadError("URL を入力してください。");
      return;
    }
    let absolute: string;
    try {
      absolute = new URL(raw, window.location.origin).href;
    } catch {
      setLoadError("有効な URL 形式ではありません。");
      return;
    }
    setLoadError(null);
    setSelectionNotice(null);
    setDocLoading(true);
    try {
      const res = await fetch(absolute, { mode: "cors", credentials: "omit" });
      if (!res.ok) {
        setLoadError(`取得に失敗しました（HTTP ${res.status}）。同一オリジンまたは CORS 許可された URL を試してください。`);
        setDocLoading(false);
        return;
      }
      const blob = await res.blob();
      if (!blob.type.includes("pdf") && blob.size > 0) {
        setLoadError("応答が PDF ではない可能性があります。");
        setDocLoading(false);
        return;
      }
      setFileFromBlob(blob);
    } catch {
      setLoadError(
        "ネットワークまたは CORS の制限で取得できませんでした。ローカルファイルを選ぶか、/sample.pdf など同一オリジンのパスを指定してください。",
      );
      setDocLoading(false);
    }
  };

  const resetToSample = () => {
    revokeBlob();
    setPaperId(null);
    setFigureRect(null);
    setFigureSelections([]);
    setPaperExcerpt("");
    setSelectionNotice(null);
    setSource({ kind: "url", url: DEFAULT_PDF });
    setPageNumber(1);
    setNumPages(null);
    setLoadError(null);
    setDocLoading(true);
    setUrlInput("");
  };

  const onDocumentLoadSuccess = ({ numPages: n }: { numPages: number }) => {
    if (!isValidPdfPageCount(n)) {
      setLoadError("ページ数が不正です。");
      setDocLoading(false);
      return;
    }
    setFigureRect(null);
    setFigureSelections([]);
    setNumPages(n);
    setPageNumber((p) => Math.min(p, n));
    setLoadError(null);
    setDocLoading(false);
  };

  const onDocumentLoadError = (err: Error) => {
    setLoadError(err.message || "PDF の読み込みに失敗しました。");
    setDocLoading(false);
  };

  const goPrev = () => {
    setFigureRect(null);
    setFigureSelections([]);
    setPageNumber((p) => Math.max(1, p - 1));
  };
  const goNext = () => {
    setFigureRect(null);
    setFigureSelections([]);
    setPageNumber((p) => (numPages != null ? Math.min(numPages, p + 1) : p));
  };

  const zoomOut = () => setScale((s) => Math.max(ZOOM_MIN, Math.round((s - ZOOM_STEP) * 100) / 100));
  const zoomIn = () => setScale((s) => Math.min(ZOOM_MAX, Math.round((s + ZOOM_STEP) * 100) / 100));

  const figStackMax = getConfiguredChatVisionMaxFigures();

  const handleAddFigureToStack = useCallback(
    (payload: { rect: FigureImagePxRect; figureLabel: string | null }) => {
      if (figureSelections.length >= figStackMax) {
        setSelectionNotice(`参照は最大 ${figStackMax} 件までです。`);
        return;
      }
      setSelectionNotice(null);
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `fig-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setFigureSelections((prev) => [
        ...prev,
        {
          id,
          page: pageNumber,
          scale: pageImageScale,
          rect: payload.rect,
          ...(payload.figureLabel ? { figureLabel: payload.figureLabel } : {}),
        },
      ]);
      setFigureRect(null);
    },
    [figStackMax, figureSelections.length, pageNumber, pageImageScale],
  );

  const toggleFigSelectMode = () => {
    setFigSelectMode((prev) => {
      const next = !prev;
      if (!next) setFigureRect(null);
      return next;
    });
  };

  const applySelectionToChat = () => {
    const text = getPdfSelectionText(pdfAreaRef.current);
    if (!text) {
      setSelectionNotice("PDF のテキストレイヤー上で文字を選択してから押してください。");
      return;
    }
    setSelectionNotice(null);
    setPaperExcerpt(`（表示中 ${pageNumber} ページ付近の抜粋）\n"""\n${text}\n"""`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="shrink-0 border-b border-border-subtle px-paper-4 py-paper-3">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-paper-3">
          <div>
            <p className="text-xs text-muted-foreground">paper-assistant / FE-5（M5）</p>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">論文読解</h1>
          </div>
          <p className="max-w-[42ch] text-xs text-muted-foreground">
            ファイルから開くと API にアップロードされ、要約・文脈付き Q&A が利用できます（仕様 §MVP）。
          </p>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-0 lg:flex-row">
        {/* 主: PDF（DOM 順で先） */}
        <section
          className="flex min-h-[50vh] min-w-0 flex-1 flex-col border-border-subtle lg:min-h-0 lg:border-r"
          aria-labelledby="pdf-main-heading"
        >
          <h2 id="pdf-main-heading" className="sr-only">
            論文 PDF ビューア
          </h2>

          <div className="flex shrink-0 flex-wrap items-center gap-paper-2 border-b border-border-subtle bg-neutral-100/80 px-paper-3 py-paper-2 dark:bg-neutral-900/50">
            <label className="min-h-11 cursor-pointer rounded-md border border-border-subtle bg-background px-paper-3 py-2 text-sm font-medium text-foreground hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <span>PDF を開く（アップロード）</span>
              <input type="file" accept="application/pdf" className="sr-only" onChange={(e) => void onFileChange(e)} />
            </label>
            <button
              type="button"
              className="min-h-11 rounded-md border border-border-subtle bg-background px-paper-3 text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
              onClick={resetToSample}
            >
              サンプルに戻す
            </button>
            <div className="flex min-h-11 max-w-full flex-1 flex-wrap items-center gap-paper-2 sm:flex-nowrap">
              <input
                type="url"
                className="min-h-11 min-w-[8rem] flex-1 rounded-md border border-border-subtle bg-background px-paper-3 text-sm"
                placeholder="同一オリジン URL（例: /sample.pdf）"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                aria-label="PDF の URL"
              />
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-md bg-primary-600 px-paper-4 text-sm font-medium text-white hover:bg-primary-700"
                onClick={() => void loadFromUrl()}
              >
                URL から読込
              </button>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-paper-2 border-b border-border-subtle px-paper-3 py-paper-2">
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-md border border-border-subtle bg-background text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
              onClick={goPrev}
              disabled={pageNumber <= 1}
              aria-label="前のページ"
            >
              ◀
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-md border border-border-subtle bg-background text-sm font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
              onClick={goNext}
              disabled={numPages != null ? pageNumber >= numPages : true}
              aria-label="次のページ"
            >
              ▶
            </button>
            <span className="text-sm text-muted-foreground" aria-live="polite">
              ページ {numPages != null ? `${pageNumber} / ${numPages}` : "— / —"}
            </span>
            <span className="mx-paper-2 hidden h-6 w-px bg-border-subtle sm:inline-block" aria-hidden />
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-md border border-border-subtle bg-background text-lg font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
              onClick={zoomOut}
              disabled={scale <= ZOOM_MIN}
              aria-label="縮小"
            >
              −
            </button>
            <button
              type="button"
              className="min-h-11 min-w-11 rounded-md border border-border-subtle bg-background text-lg font-medium hover:bg-neutral-50 dark:hover:bg-neutral-800"
              onClick={zoomIn}
              disabled={scale >= ZOOM_MAX}
              aria-label="拡大"
            >
              ＋
            </button>
            <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              className={`min-h-11 rounded-md border px-paper-3 text-sm font-medium ${
                figSelectMode
                  ? "border-primary-600 bg-primary-600 text-white hover:bg-primary-700"
                  : "border-border-subtle bg-background hover:bg-neutral-50 dark:hover:bg-neutral-800"
              }`}
              onClick={toggleFigSelectMode}
              disabled={!!loadError}
              aria-pressed={figSelectMode}
              title="サーバーが返すページ画像上でドラッグして図・表の範囲を指定します（image_px）"
            >
              図・表を選択
            </button>
            <button
              type="button"
              className="ml-auto min-h-11 rounded-md border border-border-subtle bg-primary-600 px-paper-3 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={applySelectionToChat}
              disabled={!!loadError || figSelectMode}
              title="テキストレイヤーで選択した範囲を Q&A の文脈に載せます"
            >
              選択範囲について聞く
            </button>
          </div>

          {selectionNotice ? (
            <p className="border-b border-border-subtle bg-amber-50 px-paper-3 py-paper-2 text-xs text-amber-950 dark:bg-amber-950/30 dark:text-amber-100" role="status" aria-live="polite">
              {selectionNotice}
            </p>
          ) : null}

          {figSelectMode ? (
            <p className="border-b border-border-subtle bg-neutral-100/90 px-paper-3 py-paper-2 text-xs text-muted-foreground dark:bg-neutral-900/60" role="status">
              図・表選択モード: 表示は API のページ画像（scale={pageImageScale}）です。ドラッグで矩形を確定すると切り抜きプレビューが表示されます。
            </p>
          ) : null}

          <div ref={pdfAreaRef} className="relative flex-1 overflow-auto bg-neutral-200/60 dark:bg-neutral-950/80">
            {loadError ? (
              <div className="p-paper-6" role="alert">
                <p className="text-sm font-medium text-semantic-danger">PDF を表示できません</p>
                <p className="mt-paper-2 max-w-[65ch] text-sm text-muted-foreground">{loadError}</p>
              </div>
            ) : null}

            {(docLoading || uploading) && !loadError ? (
              <div
                className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 p-paper-6"
                role="status"
                aria-live="polite"
              >
                <div className="max-w-sm space-y-paper-3 text-center">
                  <p className="text-sm text-muted-foreground">
                    {uploading ? "PDF をアップロードしています…" : "PDF を読み込んでいます…"}
                  </p>
                  <div className="space-y-2 motion-reduce:animate-none">
                    <div className="h-2 w-full rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
                    <div className="mx-auto h-2 w-4/5 rounded bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-700" />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-center p-paper-4">
              {!loadError && figSelectMode ? (
                <PaperPageFigureSelection
                  key={`${paperId ?? "local"}-${pageNumber}-${pageImageScale}`}
                  apiBaseUrl={apiBaseUrl}
                  paperId={paperId}
                  page={pageNumber}
                  imageScale={pageImageScale}
                  rect={figureRect}
                  onRectChange={setFigureRect}
                  onAddToStack={handleAddFigureToStack}
                  stackSelectionCount={figureSelections.length}
                  stackMax={figStackMax}
                />
              ) : null}
              {!loadError && !figSelectMode ? (
                <Document
                  key={source.url}
                  file={source.url}
                  options={PDF_READING_DOCUMENT_OPTIONS}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={null}
                  className="shadow-md"
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    className="bg-white text-black"
                    renderTextLayer
                    renderAnnotationLayer
                  />
                </Document>
              ) : null}
            </div>
          </div>
        </section>

        {/* 副: 要約 + チャット */}
        <aside
          className="flex w-full shrink-0 flex-col border-t border-border-subtle lg:h-auto lg:min-h-0 lg:w-[min(100%,24rem)] lg:max-w-md lg:border-l lg:border-t-0"
          aria-label="要約と補助チャット"
        >
          <ReadingSummaryPanel
            key={paperId ?? "no-uploaded-paper"}
            apiBaseUrl={apiBaseUrl}
            paperId={paperId}
          />
          <div className="flex min-h-0 flex-1 flex-col lg:h-full">
            <ReadingChatPanel
              apiBaseUrl={apiBaseUrl}
              paperId={paperId}
              paperExcerpt={paperExcerpt}
              currentPage={pageNumber}
              onClearExcerpt={() => setPaperExcerpt("")}
              visionSelections={figureSelections}
              onRemoveVisionSelection={(id) =>
                setFigureSelections((prev) => prev.filter((s) => s.id !== id))
              }
              onClearVisionStack={() => {
                setFigureSelections([]);
                setFigureRect(null);
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
