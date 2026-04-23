import { describe, expect, it } from "vitest";

import { clientPointToImagePx, normalizeDragToImageRect } from "@/lib/pdf/image-rect";

describe("clientPointToImagePx", () => {
  it("maps display coords to natural pixels (uniform scale)", () => {
    const disp = { left: 100, top: 200, width: 500, height: 1000 };
    const p = clientPointToImagePx(150, 400, disp, 1000, 2000);
    expect(p).toEqual({ x: 100, y: 400 });
  });

  it("floors fractional pixels", () => {
    const disp = { left: 0, top: 0, width: 100, height: 100 };
    const p = clientPointToImagePx(33.7, 66.2, disp, 1000, 1000);
    expect(p.x).toBe(337);
    expect(p.y).toBe(662);
  });
});

describe("normalizeDragToImageRect", () => {
  it("normalizes negative direction drag and clips to image", () => {
    const r = normalizeDragToImageRect(10, 10, 100, 100, 200, 200);
    expect(r).toEqual({ x: 10, y: 10, w: 90, h: 90 });
  });

  it("clips to natural bounds", () => {
    const r = normalizeDragToImageRect(-10, -5, 300, 400, 200, 200);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w).toBe(200);
    expect(r.h).toBe(200);
  });
});
