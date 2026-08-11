import { describe, expect, it } from "vitest";
import { cropToPixels, cropWithPixelSize, pixelsToCrop } from "./crop-math";

describe("cropToPixels / pixelsToCrop", () => {
  it("round-trips a mid-box crop", () => {
    const crop = { x: 0.25, y: 0.1, w: 0.5, h: 0.4 };
    const px = cropToPixels(crop, 1000, 800);
    expect(px).toEqual({ x: 250, y: 80, w: 500, h: 320 });
    expect(pixelsToCrop(px, 1000, 800)).toEqual(crop);
  });

  it("sets an exact homepage-sized crop from the current origin", () => {
    const next = cropWithPixelSize(
      { x: 0.4, y: 0.3, w: 0.2, h: 0.2 },
      719,
      391,
      1400,
      900,
    );
    const px = cropToPixels(next, 1400, 900);
    expect(px.w).toBe(719);
    expect(px.h).toBe(391);
    expect(px.x).toBe(560);
    expect(px.y).toBe(270);
  });
});
