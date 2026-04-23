"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DEFAULT_PAPER_PAGE_IMAGE_SCALE,
  fetchPaperPageImage,
  type PaperPageImageHeaders,
  type PaperPageImageResult,
} from "@/lib/api/paper-pages";
import {
  clientPointToImagePx,
  normalizeDragToImageRect,
  type ImagePxRect,
} from "@/lib/pdf/image-rect";

const MIN_RECT_PX = 4;

export type FigureImagePxRect = ImagePxRect & { unit: "image_px" };

function mapPageImageError(result: Exclude<PaperPageImageResult, { kind: "ok" }>): string {
  switch (result.kind) {
    case "missing_base_url":
      return "NEXT_PUBLIC_API_BASE_URL が未設定です。";
    case "network_error":
      return `ネットワーク: ${result.message}`;
    case "http_error":
      return `ページ画像の取得に失敗しました（HTTP ${result.status}）。`;
    case "invalid_body":
      return result.detail;
    default: {
      const _e: never = result;
      return String(_e);
    }
  }
}

type Props = {
  apiBaseUrl: string | undefined;
  paperId: string | null;
  page: number;
  /** `GET .../image?scale=` に送る値（バックエンド既定 2.0 と一致させる） */
  imageScale?: number;
  /** 確定した矩形（null は未選択） */
  rect: FigureImagePxRect | null;
  onRectChange: (rect: FigureImagePxRect | null) => void;
  /** フェーズ D: 矩形確定後に参照スタックへ追加（任意ラベル付き） */
  onAddToStack?: (payload: { rect: FigureImagePxRect; figureLabel: string | null }) => void;
  /** 現在のスタック件数（上限 UI 用） */
  stackSelectionCount?: number;
  /** 参照スタック上限（既定は `getConfiguredChatVisionMaxFigures()` と一致させる） */
  stackMax?: number;
};

const DEBUG_FIG_RECT =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_FIG_RECT === "true";

function FigDebugPanel({
  page,
  imageScale,
  apiHeaders,
  naturalWidth,
  naturalHeight,
  rect,
}: {
  page: number;
  imageScale: number;
  apiHeaders: PaperPageImageHeaders;
  naturalWidth: number;
  naturalHeight: number;
  rect: FigureImagePxRect | null;
}) {
  const naturalSizeOk =
    naturalWidth > 0 &&
    naturalHeight > 0 &&
    naturalWidth === apiHeaders.width &&
    naturalHeight === apiHeaders.height;

  return (
    <details className="rounded-md border border-dashed border-border-subtle bg-neutral-50 p-paper-3 text-xs dark:bg-neutral-900/40">
      <summary className="cursor-pointer font-medium text-foreground">
        図矩形デバッグ（NEXT_PUBLIC_DEBUG_FIG_RECT）
      </summary>
      <dl className="mt-paper-2 grid gap-1 font-mono text-muted-foreground">
        <div>
          <dt className="inline text-foreground">page / scale:</dt>{" "}
          <dd className="inline">
            {page} / {imageScale}
          </dd>
        </div>
        <div>
          <dt className="inline text-foreground">API X-Paper:</dt>{" "}
          <dd className="inline">
            {apiHeaders.width}×{apiHeaders.height}（page={apiHeaders.page}, scale={apiHeaders.scale}）
          </dd>
        </div>
        <div>
          <dt className="inline text-foreground">img natural:</dt>{" "}
          <dd className="inline">
            {naturalWidth}×{naturalHeight}
          </dd>
        </div>
        <div>
          <dt className="inline text-foreground">一致:</dt>{" "}
          <dd className="inline">
            {naturalSizeOk ? (
              <span className="text-emerald-700 dark:text-emerald-400">OK</span>
            ) : (
              <span className="text-amber-800 dark:text-amber-200">要確認（natural とヘッダ不一致）</span>
            )}
          </dd>
        </div>
        {rect ? (
          <div>
            <dt className="inline text-foreground">rect image_px:</dt>{" "}
            <dd className="inline">
              x={rect.x} y={rect.y} w={rect.w} h={rect.h}
            </dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

export function PaperPageFigureSelection({
  apiBaseUrl,
  paperId,
  page,
  imageScale = DEFAULT_PAPER_PAGE_IMAGE_SCALE,
  rect,
  onRectChange,
  onAddToStack,
  stackSelectionCount = 0,
  stackMax = 3,
}: Props) {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [apiHeaders, setApiHeaders] = useState<PaperPageImageHeaders | null>(null);
  const [previewRect, setPreviewRect] = useState<ImagePxRect | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });

  const blobUrlRef = useRef<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const onRectChangeRef = useRef(onRectChange);

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [figureLabelDraft, setFigureLabelDraft] = useState("");

  const stackFull = stackSelectionCount >= stackMax;

  useEffect(() => {
    onRectChangeRef.current = onRectChange;
  });

  useEffect(() => {
    if (!rect) setFigureLabelDraft("");
  }, [rect]);

  const revokeBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => revokeBlob(), [revokeBlob]);

  useEffect(() => {
    if (!paperId) {
      revokeBlob();
      return;
    }

    let cancelled = false;

    void (async () => {
      setLoading(true);
      setLoadError(null);
      const result = await fetchPaperPageImage(apiBaseUrl, paperId, page, imageScale);
      if (cancelled) return;

      if (result.kind !== "ok") {
        revokeBlob();
        setImageUrl(null);
        setLoading(false);
        setLoadError(mapPageImageError(result));
        return;
      }

      revokeBlob();
      const url = URL.createObjectURL(result.blob);
      blobUrlRef.current = url;
      setImageUrl(url);
      setApiHeaders(result.headers);
      setLoading(false);
      setLoadError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, paperId, page, imageScale, revokeBlob]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img || !imageUrl) return;

    const syncDisplay = () => {
      setDisplaySize({ w: img.offsetWidth, h: img.offsetHeight });
    };

    syncDisplay();
    const ro = new ResizeObserver(syncDisplay);
    ro.observe(img);
    return () => ro.disconnect();
  }, [imageUrl]);

  const drawCropPreview = useCallback(() => {
    const img = imgRef.current;
    const canvas = cropCanvasRef.current;
    const r = rect;
    if (!img?.complete || !canvas || !r || r.w < 1 || r.h < 1) {
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = r.w;
    canvas.height = r.h;
    ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  }, [rect]);

  useEffect(() => {
    drawCropPreview();
  }, [drawCropPreview]);

  const getImageDisplayRect = () => {
    const el = imgRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height } as const;
  };

  const pointerToImagePx = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    const disp = getImageDisplayRect();
    if (!img || !disp || img.naturalWidth < 1 || img.naturalHeight < 1) return null;
    return clientPointToImagePx(clientX, clientY, disp, img.naturalWidth, img.naturalHeight);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (loading || loadError || !paperId) return;
    const p = pointerToImagePx(e.clientX, e.clientY);
    if (!p) return;
    dragStartRef.current = p;
    setPreviewRect(null);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    if (!start) return;
    const cur = pointerToImagePx(e.clientX, e.clientY);
    if (!cur) return;
    const img = imgRef.current;
    if (!img) return;
    const norm = normalizeDragToImageRect(
      start.x,
      start.y,
      cur.x,
      cur.y,
      img.naturalWidth,
      img.naturalHeight,
    );
    setPreviewRect(norm);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStartRef.current;
    dragStartRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!start) return;

    const cur = pointerToImagePx(e.clientX, e.clientY);
    const img = imgRef.current;
    if (!cur || !img) {
      setPreviewRect(null);
      return;
    }

    const norm = normalizeDragToImageRect(
      start.x,
      start.y,
      cur.x,
      cur.y,
      img.naturalWidth,
      img.naturalHeight,
    );
    setPreviewRect(null);

    if (norm.w < MIN_RECT_PX || norm.h < MIN_RECT_PX) {
      onRectChangeRef.current(null);
      return;
    }

    onRectChangeRef.current({ ...norm, unit: "image_px" });
  };

  const onPointerLeave = () => {
    /* キャプチャ中は pointerup で確定 */
  };

  const displayRect = previewRect ?? (rect ? { x: rect.x, y: rect.y, w: rect.w, h: rect.h } : null);

  const overlayBox =
    naturalSize.w > 0 &&
    naturalSize.h > 0 &&
    displaySize.w > 0 &&
    displayRect
      ? (() => {
          const sx = displaySize.w / naturalSize.w;
          const sy = displaySize.h / naturalSize.h;
          return {
            left: displayRect.x * sx,
            top: displayRect.y * sy,
            width: displayRect.w * sx,
            height: displayRect.h * sy,
          };
        })()
      : null;

  if (!paperId) {
    return (
      <div className="rounded-md border border-border-subtle bg-background p-paper-4 text-sm text-muted-foreground">
        <p>
          図・表の矩形選択は、<strong className="text-foreground">PDF をアップロード</strong>
          して論文がサーバーに保存されたあとに利用できます。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-paper-3">
      {loading ? (
        <p className="text-sm text-muted-foreground" role="status">
          ページ画像を読み込んでいます…
        </p>
      ) : null}

      {loadError ? (
        <p className="text-sm text-semantic-danger" role="alert">
          {loadError}
        </p>
      ) : null}

      {!loading && !loadError && imageUrl ? (
        <div className="relative inline-block max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL の PNG を表示 */}
          <img
            ref={imgRef}
            src={imageUrl}
            alt={`論文ページ ${page}（API レンダリング）`}
            className="block h-auto max-w-full bg-white"
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
              setDisplaySize({ w: el.offsetWidth, h: el.offsetHeight });
              drawCropPreview();
            }}
          />
          <div
            className="absolute inset-0 cursor-crosshair touch-none"
            style={{ pointerEvents: loading ? "none" : "auto" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={onPointerLeave}
          />
          {overlayBox ? (
            <div
              className="pointer-events-none absolute border-2 border-primary-600 bg-primary-600/15"
              style={{
                left: overlayBox.left,
                top: overlayBox.top,
                width: overlayBox.width,
                height: overlayBox.height,
              }}
            />
          ) : null}
        </div>
      ) : null}

      {rect && rect.w >= 1 && rect.h >= 1 ? (
        <div className="space-y-paper-2">
          <p className="text-xs font-medium text-muted-foreground">切り抜きプレビュー</p>
          <canvas
            ref={cropCanvasRef}
            className="max-h-48 max-w-full border border-border-subtle bg-white shadow-sm"
            aria-label="選択範囲のプレビュー"
          />
          {onAddToStack ? (
            <div className="flex flex-col gap-paper-2 rounded-md border border-border-subtle bg-background p-paper-3">
              <label className="block text-xs font-medium text-foreground">
                図ラベル（任意）
                <input
                  type="text"
                  className="mt-1 w-full min-h-9 rounded-md border border-border-subtle bg-background px-paper-2 py-1 text-sm text-foreground"
                  value={figureLabelDraft}
                  onChange={(e) => setFigureLabelDraft(e.target.value)}
                  placeholder="例: Fig.1"
                  maxLength={64}
                  disabled={stackFull}
                  aria-label="図のラベル（任意）"
                />
              </label>
              <div className="flex flex-wrap gap-paper-2">
                <button
                  type="button"
                  className="min-h-9 rounded-md bg-primary-600 px-paper-3 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={stackFull}
                  onClick={() => {
                    if (!rect || stackFull) return;
                    const label = figureLabelDraft.trim();
                    onAddToStack({
                      rect,
                      figureLabel: label.length > 0 ? label : null,
                    });
                  }}
                >
                  参照に追加
                </button>
                {stackFull ? (
                  <p className="text-xs text-semantic-warning" role="status">
                    参照は最大 {stackMax} 件です。チャット側のチップから削除するか、会話をクリアしてください。
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="text-sm text-primary-600 underline-offset-2 hover:underline dark:text-primary-300"
            onClick={() => onRectChangeRef.current(null)}
          >
            選択をクリア
          </button>
        </div>
      ) : null}

      {DEBUG_FIG_RECT && apiHeaders && imageUrl ? (
        <FigDebugPanel
          key={`${naturalSize.w}x${naturalSize.h}`}
          page={page}
          imageScale={imageScale}
          apiHeaders={apiHeaders}
          naturalWidth={naturalSize.w}
          naturalHeight={naturalSize.h}
          rect={rect}
        />
      ) : null}
    </div>
  );
}
