import { describe, it, expect, beforeEach } from "vitest";
import {
  columnConstraints,
  columnLayout,
  readColumnWidths,
  widthsFromLayout,
  writeColumnWidths,
  DEFAULT_COLUMN_WIDTHS,
  MAX_COLUMN_PX,
  MIN_CENTER_PX,
  MIN_COLUMN_PX,
} from "./column-widths";

const open = { left: false, right: false };

/** The px width a percentage works out to, for readable assertions. */
function px(pct: number, containerPx: number): number {
  return Math.round((pct / 100) * containerPx);
}

describe("columnLayout", () => {
  it("turns px widths into percentages, with the center taking the rest", () => {
    const [left, center, right] = columnLayout(
      { left: 300, right: 400 },
      open,
      2000,
    );
    expect(px(left, 2000)).toBe(300);
    expect(px(right, 2000)).toBe(400);
    expect(px(center, 2000)).toBe(1300);
  });

  it("holds the side columns' px steady as the window resizes", () => {
    const widths = { left: 300, right: 400 };
    for (const windowPx of [1200, 1600, 2400]) {
      const [left, , right] = columnLayout(widths, open, windowPx);
      expect(px(left, windowPx)).toBe(300);
      expect(px(right, windowPx)).toBe(400);
    }
  });

  it("gives a collapsed column nothing", () => {
    const [left, center, right] = columnLayout(
      { left: 300, right: 400 },
      { left: true, right: false },
      2000,
    );
    expect(left).toBe(0);
    expect(px(right, 2000)).toBe(400);
    expect(px(center, 2000)).toBe(1600);
  });

  it("clamps a stored width into the allowed range", () => {
    const [left, , right] = columnLayout({ left: 40, right: 5000 }, open, 4000);
    expect(px(left, 4000)).toBe(MIN_COLUMN_PX);
    expect(px(right, 4000)).toBe(MAX_COLUMN_PX);
  });

  it("shrinks the sides rather than squeezing the center out of a narrow window", () => {
    const [left, center, right] = columnLayout(
      { left: 600, right: 600 },
      open,
      900,
    );
    expect(px(center, 900)).toBeGreaterThanOrEqual(MIN_CENTER_PX);
    expect(px(left, 900)).toBeLessThan(600);
    // Proportional, so an even pair stays even.
    expect(px(left, 900)).toBe(px(right, 900));
  });

  it("always adds up to 100%", () => {
    for (const windowPx of [700, 1440, 3000]) {
      const layout = columnLayout({ left: 300, right: 500 }, open, windowPx);
      expect(layout.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    }
  });
});

describe("columnConstraints", () => {
  it("expresses the px min/max as percentages of this window", () => {
    const { sideMin, sideMax } = columnConstraints(2000);
    expect(px(sideMin, 2000)).toBe(MIN_COLUMN_PX);
    expect(px(sideMax, 2000)).toBe(MAX_COLUMN_PX);
  });

  it("stays a valid set of constraints on a window too narrow for them", () => {
    const { sideMin, sideMax, centerMin } = columnConstraints(500);
    expect(sideMin).toBeLessThanOrEqual(sideMax);
    expect(sideMin * 2 + centerMin).toBeLessThanOrEqual(100);
  });
});

describe("widthsFromLayout", () => {
  it("reads back the px the user dragged to", () => {
    expect(widthsFromLayout([15, 60, 25], 2000, DEFAULT_COLUMN_WIDTHS)).toEqual(
      {
        left: 300,
        right: 500,
      },
    );
  });

  it("keeps a collapsed column's width — that's what it reopens at", () => {
    expect(
      widthsFromLayout([0, 75, 25], 2000, { left: 300, right: 400 }),
    ).toEqual({ left: 300, right: 500 });
  });

  it("round-trips a layout it produced", () => {
    const widths = { left: 320, right: 280 };
    expect(
      widthsFromLayout(columnLayout(widths, open, 1600), 1600, widths),
    ).toEqual(widths);
  });
});

describe("readColumnWidths / writeColumnWidths", () => {
  beforeEach(() => localStorage.clear());

  it("defaults both modes when nothing is stored", () => {
    expect(readColumnWidths()).toEqual({
      normal: DEFAULT_COLUMN_WIDTHS,
      smallScreen: DEFAULT_COLUMN_WIDTHS,
    });
  });

  it("round-trips each mode's own widths", () => {
    const widths = {
      normal: { left: 300, right: 400 },
      smallScreen: { left: 220, right: 260 },
    };
    writeColumnWidths(widths);
    expect(readColumnWidths()).toEqual(widths);
  });

  it("falls back to defaults for a corrupt or partial entry", () => {
    localStorage.setItem("silo:main-column-widths", "{not json");
    expect(readColumnWidths().normal).toEqual(DEFAULT_COLUMN_WIDTHS);

    localStorage.setItem(
      "silo:main-column-widths",
      JSON.stringify({ normal: { left: 5000 } }),
    );
    expect(readColumnWidths().normal).toEqual({
      left: MAX_COLUMN_PX,
      right: DEFAULT_COLUMN_WIDTHS.right,
    });
  });
});
