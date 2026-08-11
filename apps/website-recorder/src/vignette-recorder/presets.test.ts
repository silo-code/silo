import { describe, expect, it } from "vitest";
import { clampCrop } from "./presets";
import { cropSourceRect } from "./capture";

describe("clampCrop", () => {
  it("keeps a valid crop unchanged", () => {
    expect(clampCrop({ x: 0.5, y: 0.4, w: 0.4, h: 0.5 })).toEqual({
      x: 0.5,
      y: 0.4,
      w: 0.4,
      h: 0.5,
    });
  });

  it("enforces a minimum size and clamps into the box", () => {
    expect(clampCrop({ x: 0.95, y: 0.95, w: 0.01, h: 0.01 })).toEqual({
      x: 0.92,
      y: 0.92,
      w: 0.08,
      h: 0.08,
    });
  });

  it("pulls negative origins back to zero", () => {
    expect(clampCrop({ x: -0.2, y: -0.1, w: 0.3, h: 0.4 })).toEqual({
      x: 0,
      y: 0,
      w: 0.3,
      h: 0.4,
    });
  });
});

describe("cropSourceRect", () => {
  it("maps fractions to pixel integers", () => {
    expect(
      cropSourceRect(1000, 800, { x: 0.5, y: 0.25, w: 0.4, h: 0.5 }),
    ).toEqual({ sx: 500, sy: 200, sw: 400, sh: 400 });
  });

  it("never returns a zero-size rect", () => {
    const rect = cropSourceRect(10, 10, { x: 0.99, y: 0.99, w: 0, h: 0 });
    expect(rect.sw).toBeGreaterThanOrEqual(1);
    expect(rect.sh).toBeGreaterThanOrEqual(1);
  });
});
