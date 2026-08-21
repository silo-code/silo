// Where a dragged side-panel tab would land inside a pane (RFC 0027).
//
// Pure geometry: given the pane's rectangle and the pointer, which of the five
// zones is under it. Kept out of the components so the edge bands, the minimum
// pane size, and the "this split doesn't fit" rule are testable without a DOM.

import type { InsertSide } from "../state/side-dock-tree";

/** `"center"` joins the pane's tab bar; the four sides split it. */
export type DropZone = "center" | InsertSide;

/**
 * How much of a pane's short side is edge rather than center. A quarter reads
 * as an obvious band without making the center hard to hit in a narrow pane.
 */
const EDGE_FRACTION = 0.25;
/** …but never a band wider than this, so a tall pane doesn't get a 200px edge. */
const MAX_EDGE_PX = 80;

/**
 * A pane narrower than this can't be split into a row — two panes plus the
 * handle wouldn't leave either one usable. Roughly the width at which a file
 * tree or a git status list stops being readable.
 */
export const MIN_PANE_WIDTH_PX = 180;
/** The same idea vertically: a tab bar plus a few rows of content. */
export const MIN_PANE_HEIGHT_PX = 80;

function band(extent: number): number {
  return Math.min(extent * EDGE_FRACTION, MAX_EDGE_PX);
}

/** Whether `rect` has room to become two panes side by side / stacked. */
export function fitsSplit(rect: DOMRectLike, side: InsertSide): boolean {
  return side === "left" || side === "right"
    ? rect.width / 2 >= MIN_PANE_WIDTH_PX
    : rect.height / 2 >= MIN_PANE_HEIGHT_PX;
}

export interface DOMRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The zone at (`x`, `y`) within `rect`.
 *
 * A split that wouldn't fit is reported as `"center"` rather than offered and
 * then refused — the overlay the user sees is the thing that will happen. The
 * nearer edge wins when the pointer is in a corner, so the two bands don't
 * fight over it.
 */
export function dropZoneAt(rect: DOMRectLike, x: number, y: number): DropZone {
  const dx = x - rect.left;
  const dy = y - rect.top;
  const hBand = band(rect.width);
  const vBand = band(rect.height);

  // Distance into the pane from each edge; the smallest wins.
  const candidates: { side: InsertSide; depth: number }[] = [];
  if (dx <= hBand) candidates.push({ side: "left", depth: dx });
  if (rect.width - dx <= hBand)
    candidates.push({ side: "right", depth: rect.width - dx });
  if (dy <= vBand) candidates.push({ side: "top", depth: dy });
  if (rect.height - dy <= vBand)
    candidates.push({ side: "bottom", depth: rect.height - dy });

  candidates.sort((a, b) => a.depth - b.depth);
  for (const { side } of candidates) {
    if (fitsSplit(rect, side)) return side;
  }
  return "center";
}
