/**
 * ページ画像（API PNG）上のドラッグ矩形を image_px に正規化する純関数。
 * 表示縮小時は getBoundingClientRect と naturalWidth/Height の比で写像する。
 */

export type ImagePxRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** `getBoundingClientRect()` 互換（テストしやすいよう DOM 型に依存しない） */
export type ImageDisplayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** クライアント座標を画像の論理ピクセル座標へ（左上原点） */
export function clientPointToImagePx(
  clientX: number,
  clientY: number,
  imgRect: ImageDisplayRect,
  naturalWidth: number,
  naturalHeight: number,
): { x: number; y: number } {
  const relX = clientX - imgRect.left;
  const relY = clientY - imgRect.top;
  const sx = naturalWidth / imgRect.width;
  const sy = naturalHeight / imgRect.height;
  return {
    x: Math.floor(relX * sx),
    y: Math.floor(relY * sy),
  };
}

/** ドラッグの対角 2 点から非負の幅・高さの矩形へ。画像境界でクリップ */
export function normalizeDragToImageRect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  naturalWidth: number,
  naturalHeight: number,
): ImagePxRect {
  let x0 = Math.min(ax, bx);
  let y0 = Math.min(ay, by);
  let x1 = Math.max(ax, bx);
  let y1 = Math.max(ay, by);

  x0 = clamp(x0, 0, naturalWidth);
  y0 = clamp(y0, 0, naturalHeight);
  x1 = clamp(x1, 0, naturalWidth);
  y1 = clamp(y1, 0, naturalHeight);

  const w = Math.max(0, x1 - x0);
  const h = Math.max(0, y1 - y0);
  return { x: x0, y: y0, w, h };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
