// The main columns' widths — the layout math AppShell drives
// react-resizable-panels with, plus where those widths are remembered.
//
// **Side columns are sized in pixels, the center takes the rest.** The library
// works in percentages, so a percentage layout would rescale every column as
// the window resizes — the side panels would grow on a big monitor and shrink
// on a laptop, when what the user set was "this panel is 320px wide". We keep
// the two side widths in px and recompute the percentages whenever the window
// changes size, which leaves the side columns put and gives the center every
// pixel the window gains or loses. Two numbers are the whole layout.
//
// Each of the two layout modes (normal-width / small-screen — see
// `extension-host/small-screen-mode.ts`) remembers its own pair. Both live in
// localStorage rather than the app-state index because the layout has to be
// right on the *first paint*: the index is loaded asynchronously from disk, so
// reading it would mean painting default columns and then jumping. (That's the
// same reason react-resizable-panels' own `autoSaveId` used localStorage, which
// this replaces — its percentage layout is exactly what we're moving off.)
//
// Everything here is pure except `readColumnWidths`/`writeColumnWidths`, so the
// rules below are unit-testable without a DOM or a mounted PanelGroup.

/** A side column narrower than this collapses instead — the drag-to-close
 * gesture react-resizable-panels gives us for a `collapsible` panel. */
export const MIN_COLUMN_PX = 200;
export const MAX_COLUMN_PX = 800;
/** The center column never gives up more than this, whatever the side columns
 * would like — the guard for a window too narrow to satisfy everyone. */
export const MIN_CENTER_PX = 240;

/** The side columns' widths in CSS pixels. */
export interface ColumnWidths {
  left: number;
  right: number;
}

/** One pair per layout mode. */
export interface ColumnWidthsByMode {
  normal: ColumnWidths;
  smallScreen: ColumnWidths;
}

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { left: 260, right: 340 };

const STORAGE_KEY = "silo:main-column-widths";

function clampPx(px: number): number {
  return Math.min(MAX_COLUMN_PX, Math.max(MIN_COLUMN_PX, Math.round(px)));
}

function pct(px: number, containerPx: number): number {
  return (px / Math.max(containerPx, 1)) * 100;
}

/**
 * The `[left, center, right]` percentage layout for these px widths. A
 * collapsed side contributes nothing; the rest is the center's. When the window
 * is too narrow to give both sides what they want *and* keep
 * {@link MIN_CENTER_PX} for the center, the sides shrink proportionally rather
 * than squeezing the editor out.
 */
export function columnLayout(
  widths: ColumnWidths,
  collapsed: { left: boolean; right: boolean },
  containerPx: number,
): number[] {
  let left = collapsed.left ? 0 : clampPx(widths.left);
  let right = collapsed.right ? 0 : clampPx(widths.right);
  const forSides = Math.max(containerPx - MIN_CENTER_PX, 0);
  if (left + right > forSides) {
    const scale = forSides / (left + right);
    left = Math.floor(left * scale);
    right = Math.floor(right * scale);
  }
  const leftPct = pct(left, containerPx);
  const rightPct = pct(right, containerPx);
  return [leftPct, 100 - leftPct - rightPct, rightPct];
}

/**
 * The percentage constraints to hand the panels for a window this wide — the
 * px min/max expressed in the only unit the library takes. Clamped to a band
 * that stays valid on a very narrow window, where the raw conversions would
 * otherwise exceed 100% (or leave no room for the center).
 */
export function columnConstraints(containerPx: number): {
  sideMin: number;
  sideMax: number;
  centerMin: number;
} {
  const sideMin = Math.min(pct(MIN_COLUMN_PX, containerPx), 25);
  const sideMax = Math.max(
    sideMin,
    Math.min(pct(MAX_COLUMN_PX, containerPx), 60),
  );
  const centerMin = Math.min(pct(MIN_CENTER_PX, containerPx), 30);
  return { sideMin, sideMax, centerMin };
}

/**
 * The px widths to remember from a layout the user just produced. A collapsed
 * (zero-width) side keeps the width it had — that's the width it reopens at,
 * and it's the whole reason closing a panel doesn't forget how wide it was.
 */
export function widthsFromLayout(
  layout: readonly number[],
  containerPx: number,
  previous: ColumnWidths,
): ColumnWidths {
  const [left, , right] = layout;
  return {
    left: left ? clampPx((left / 100) * containerPx) : previous.left,
    right: right ? clampPx((right / 100) * containerPx) : previous.right,
  };
}

function sanitize(value: unknown): ColumnWidths {
  const w = value as Partial<ColumnWidths> | undefined;
  return {
    left: clampPx(
      typeof w?.left === "number" ? w.left : DEFAULT_COLUMN_WIDTHS.left,
    ),
    right: clampPx(
      typeof w?.right === "number" ? w.right : DEFAULT_COLUMN_WIDTHS.right,
    ),
  };
}

/** Both modes' remembered widths, defaulted and clamped so a hand-edited or
 * stale entry can't produce an unusable layout. */
export function readColumnWidths(): ColumnWidthsByMode {
  let parsed: unknown;
  try {
    parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
  } catch {
    parsed = null;
  }
  const stored = parsed as Partial<ColumnWidthsByMode> | null;
  return {
    normal: sanitize(stored?.normal),
    smallScreen: sanitize(stored?.smallScreen),
  };
}

export function writeColumnWidths(widths: ColumnWidthsByMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
  } catch {
    // A full/blocked localStorage costs us the remembered widths, nothing more.
  }
}
