import { describe, it, expect } from "vitest";
import {
  dropZoneAt,
  fitsSplit,
  MIN_PANE_HEIGHT_PX,
  MIN_PANE_WIDTH_PX,
  type DOMRectLike,
} from "./side-dock-drop";

/** A pane with room to split either way. */
const roomy: DOMRectLike = { left: 0, top: 0, width: 600, height: 600 };

describe("fitsSplit", () => {
  it("needs two usable halves, not just a nonzero one", () => {
    const exact: DOMRectLike = {
      left: 0,
      top: 0,
      width: MIN_PANE_WIDTH_PX * 2,
      height: MIN_PANE_HEIGHT_PX * 2,
    };
    expect(fitsSplit(exact, "right")).toBe(true);
    expect(fitsSplit(exact, "bottom")).toBe(true);
    expect(fitsSplit({ ...exact, width: exact.width - 1 }, "right")).toBe(
      false,
    );
    expect(fitsSplit({ ...exact, height: exact.height - 1 }, "bottom")).toBe(
      false,
    );
  });

  it("measures the axis the split actually divides", () => {
    // Tall and narrow: stackable, not side-by-side.
    const narrow: DOMRectLike = { left: 0, top: 0, width: 200, height: 600 };
    expect(fitsSplit(narrow, "left")).toBe(false);
    expect(fitsSplit(narrow, "right")).toBe(false);
    expect(fitsSplit(narrow, "top")).toBe(true);
    expect(fitsSplit(narrow, "bottom")).toBe(true);
  });
});

describe("dropZoneAt", () => {
  it("reports the middle as center", () => {
    expect(dropZoneAt(roomy, 300, 300)).toBe("center");
  });

  it("reports each edge band", () => {
    expect(dropZoneAt(roomy, 5, 300)).toBe("left");
    expect(dropZoneAt(roomy, 595, 300)).toBe("right");
    expect(dropZoneAt(roomy, 300, 5)).toBe("top");
    expect(dropZoneAt(roomy, 300, 595)).toBe("bottom");
  });

  it("is measured from the rect's own origin, not the viewport", () => {
    const offset: DOMRectLike = {
      left: 400,
      top: 200,
      width: 600,
      height: 600,
    };
    expect(dropZoneAt(offset, 405, 500)).toBe("left");
    expect(dropZoneAt(offset, 700, 500)).toBe("center");
  });

  it("gives a corner to the nearer edge", () => {
    // 4px from the left, 20px from the top → left wins.
    expect(dropZoneAt(roomy, 4, 20)).toBe("left");
    expect(dropZoneAt(roomy, 20, 4)).toBe("top");
  });

  // The overlay is a promise: never show an edge the drop would then refuse.
  it("falls back to center when the split would not fit", () => {
    const narrow: DOMRectLike = { left: 0, top: 0, width: 200, height: 600 };
    expect(dropZoneAt(narrow, 2, 300)).toBe("center");
    expect(dropZoneAt(narrow, 198, 300)).toBe("center");
    // The other axis still has room.
    expect(dropZoneAt(narrow, 100, 2)).toBe("top");
  });

  it("prefers the fitting edge when a corner's nearest one does not fit", () => {
    // Too narrow to split horizontally, tall enough to stack: a top-left
    // corner should offer the split that can actually happen.
    const narrow: DOMRectLike = { left: 0, top: 0, width: 200, height: 600 };
    expect(dropZoneAt(narrow, 2, 6)).toBe("top");
  });

  // The reorder gesture: dragging along a pane's tab bar, which sits above its
  // body. Anything outside the body is the pane itself, never one of its edges.
  it("treats a point outside the rect as center, not the nearest edge", () => {
    expect(dropZoneAt(roomy, 300, -12)).toBe("center"); // over the tab bar
    expect(dropZoneAt(roomy, 300, 640)).toBe("center");
    expect(dropZoneAt(roomy, -20, 300)).toBe("center");
    expect(dropZoneAt(roomy, 640, 300)).toBe("center");
  });

  it("still reads the very first row inside the body as the top edge", () => {
    expect(dropZoneAt(roomy, 300, 0)).toBe("top");
  });

  it("caps the band so a tall pane does not become mostly edge", () => {
    const tall: DOMRectLike = { left: 0, top: 0, width: 600, height: 2000 };
    // A quarter of 2000 would be 500px of edge; the cap keeps it at 80.
    expect(dropZoneAt(tall, 300, 200)).toBe("center");
    expect(dropZoneAt(tall, 300, 40)).toBe("top");
  });
});
