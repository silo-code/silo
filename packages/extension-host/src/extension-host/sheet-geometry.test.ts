import { describe, expect, it } from "vitest";
import {
  APP_MAX_WIDTH_PX,
  DEFAULT_DOCK_WIDTH_PX,
  placeSheet,
  resolveSheetWidth,
  type Box,
} from "./sheet-geometry";

// A 1600×1000 window whose workbench area sits below a 0px title bar and above
// a 24px status bar, with a 300px left dock and a 260px right dock.
const group: Box = { left: 0, right: 1600, top: 0, bottom: 976, width: 1600 };
const leftCol: Box = { left: 0, right: 300, top: 0, bottom: 976, width: 300 };
const rightCol: Box = {
  left: 1340,
  right: 1600,
  top: 0,
  bottom: 976,
  width: 260,
};
const viewport = { width: 1600, height: 1000 };

function place(over: Partial<Parameters<typeof placeSheet>[0]> = {}) {
  return placeSheet({
    align: "left",
    anchor: "app",
    group,
    col: null,
    viewport,
    macOffset: 0,
    ...over,
  });
}

describe("resolveSheetWidth", () => {
  it("honors an explicit width over any anchor default", () => {
    expect(resolveSheetWidth("app", 1600, 400)).toBe(400);
    expect(resolveSheetWidth("dock", 1600, 400)).toBe(400);
  });

  it("gives a dock-anchored sheet the fixed default", () => {
    expect(resolveSheetWidth("dock", 1600)).toBe(DEFAULT_DOCK_WIDTH_PX);
  });

  it("scales an app-anchored sheet with the window", () => {
    expect(resolveSheetWidth("app", 1200)).toBe(840);
  });

  it("caps an app-anchored sheet so it never becomes a takeover", () => {
    expect(resolveSheetWidth("app", 4000)).toBe(APP_MAX_WIDTH_PX);
  });
});

describe("placeSheet", () => {
  it("runs an app sheet to the bottom of the window, over the status bar", () => {
    const p = place({ anchor: "app" });
    expect(p.top).toBe(0);
    expect(p.bottom).toBe(0);
  });

  it("stops a dock sheet at the workbench, leaving the status bar visible", () => {
    // The group ends at 976 in a 1000px window — a 24px status bar below it.
    expect(place({ anchor: "dock", col: leftCol }).bottom).toBe(24);
  });

  it("reserves the macOS traffic-light strip at the top, whatever the anchor", () => {
    expect(place({ macOffset: 36 }).top).toBe(36);
    expect(place({ anchor: "dock", col: leftCol, macOffset: 36 }).top).toBe(36);
  });

  it("centers a centered sheet in the workbench", () => {
    const p = place({ align: "center", width: 800 });
    // (1600 - 800) / 2 — equal gutters either side.
    expect(p.left).toBe(400);
    expect(p.right).toBeUndefined();
  });

  it("keeps a centered sheet full height, like every other sheet", () => {
    const p = place({ align: "center", width: 800 });
    expect(p.top).toBe(0);
    expect(p.bottom).toBe(0);
  });

  it("pins an app-anchored left sheet to the window's left edge", () => {
    const p = place({ align: "left", anchor: "app" });
    expect(p.left).toBe(0);
    expect(p.right).toBeUndefined();
  });

  it("pins an app-anchored right sheet to the window's right edge", () => {
    const p = place({ align: "right", anchor: "app" });
    expect(p.right).toBe(0);
    expect(p.left).toBeUndefined();
  });

  it("starts a dock-anchored left sheet at the left dock's inner edge", () => {
    const p = place({
      align: "left",
      anchor: "dock",
      col: leftCol,
      width: 520,
    });
    expect(p.left).toBe(300);
    expect(p.width).toBe(520);
  });

  it("starts a dock-anchored right sheet at the right dock's inner edge", () => {
    const p = place({
      align: "right",
      anchor: "dock",
      col: rightCol,
      width: 520,
    });
    // 1600 (viewport) - 1340 (dock's inner edge) — measured from the right.
    expect(p.right).toBe(260);
  });

  it("falls back to the app edge when the anchoring dock is collapsed", () => {
    const collapsed: Box = { ...leftCol, right: 0, width: 0 };
    expect(place({ align: "left", anchor: "dock", col: collapsed }).left).toBe(
      0,
    );
  });

  it("falls back to the app edge when the anchoring dock isn't there at all", () => {
    expect(place({ align: "right", anchor: "dock", col: null }).right).toBe(0);
  });
});

describe("the scrim", () => {
  it("begins where a left sheet ends, dimming nothing the sheet spans", () => {
    const p = place({ align: "left", anchor: "app", width: 900 });
    expect(p.scrim).toEqual({ left: 900, right: 0 });
    expect(p.scrim.left).toBe((p.left ?? 0) + p.width);
  });

  it("begins where a right sheet ends", () => {
    const p = place({ align: "right", anchor: "app", width: 900 });
    // Measured from the right: the sheet's own 900px plus its 0 offset.
    expect(p.scrim).toEqual({ left: 0, right: 900 });
    expect(p.scrim.right).toBe((p.right ?? 0) + p.width);
  });

  it("spares the left dock a left-anchored sheet grew out of", () => {
    const p = place({
      align: "left",
      anchor: "dock",
      col: leftCol,
      width: 520,
    });
    // The dock (0–300) and the sheet (300–820) both stay undimmed.
    expect(p.scrim).toEqual({ left: 820, right: 0 });
  });

  it("spares the right dock a right-anchored sheet grew out of", () => {
    const p = place({
      align: "right",
      anchor: "dock",
      col: rightCol,
      width: 520,
    });
    // 260px of dock plus 520px of sheet, measured from the window's right edge.
    expect(p.scrim).toEqual({ left: 0, right: 780 });
  });

  it("covers the whole window behind a centered sheet", () => {
    // Nothing to spare: a centered sheet touches neither edge, so the scrim
    // runs edge to edge and the sheet simply sits on top of it.
    expect(place({ align: "center", width: 800 }).scrim).toEqual({
      left: 0,
      right: 0,
    });
  });

  it("still starts past the sheet when the anchoring dock is collapsed", () => {
    const collapsed: Box = { ...leftCol, right: 0, width: 0 };
    const p = place({
      align: "left",
      anchor: "dock",
      col: collapsed,
      width: 520,
    });
    expect(p.scrim).toEqual({ left: 520, right: 0 });
  });
});
