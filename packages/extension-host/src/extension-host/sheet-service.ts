import { proxy } from "valtio";

// PROTOTYPE — the host-owned registry of open **sheets**.
//
// A sheet is a side-anchored surface: full height, entering from the left or
// right, sized by width rather than by a modal's centered card.
//
// The **anchor** is the load-bearing axis, because it decides whether the sheet
// is modal at all:
//
// - `anchor: "app"` — pinned to an edge of the window. This is the *modal*
//   sheet: a scrim over everything past it, Escape / scrim-click to close. It
//   is what replaces a large centered dialog (Settings), so it owes the same
//   "answer me and I'll go away" contract.
// - `anchor: "dock"` — pinned to the inner edge of a side dock, reading as that
//   panel extending outward. Never modal: no scrim, no click-outside, and the
//   rest of the workbench stays live. A dock sheet is a *place* you opened
//   beside your work, not a question blocking it, so the center dock next to it
//   has to stay usable.
//
// The **mode** axis therefore only applies to dock sheets, and asks what
// happens to the center dock: "overlay" covers it (the tabs are still there,
// just behind), "push" narrows it so the sheet takes real layout space.
//
// Only "push" strictly needs a central registry — the AppShell has to know how
// much width to hand back before the center dock lays out. Everything else is
// registered too so z-order is arbitrated centrally, exactly like
// modal-service.ts does for `<Modal>`.

/** Which edge a sheet enters from. */
export type SheetSide = "left" | "right";
/**
 * Where a sheet sits horizontally. A dock sheet is always on one side (the
 * dock's); an app sheet may also be `"center"` — floating in the middle of the
 * window with the scrim on both sides of it, for content that reads better as a
 * column than as something hanging off an edge.
 */
export type SheetAlign = SheetSide | "center";
/**
 * Whether that edge is the app window's or the side dock's inner edge — and so
 * whether the sheet is modal (`"app"`) or not (`"dock"`).
 */
export type SheetAnchor = "app" | "dock";
/**
 * What a sheet does to the center dock: cover it, or take real layout space so
 * it narrows to make room. Only meaningful for `anchor: "dock"`.
 */
export type SheetMode = "overlay" | "push";

/** One open sheet, as the AppShell and stacking need to see it. */
export interface OpenSheet {
  id: string;
  align: SheetAlign;
  anchor: SheetAnchor;
  mode: SheetMode;
  /** Resolved width in CSS px. */
  widthPx: number;
}

/**
 * Ordered list of open sheets — the single source of z-order and of the center
 * dock's push insets. Mutated by `<Sheet>` as it mounts/unmounts.
 */
export const sheetStack = proxy<{ open: OpenSheet[] }>({ open: [] });

let nextId = 0;

/** Mint a unique sheet id. */
export function nextSheetKey(): string {
  return `sheet-${nextId++}`;
}

/** Register a sheet at the top of the stack (no-op if already present). */
export function pushSheet(sheet: OpenSheet): void {
  if (sheetStack.open.some((s) => s.id === sheet.id)) return;
  sheetStack.open.push(sheet);
}

/** Re-record a sheet's resolved geometry (its width changes with the window). */
export function updateSheet(id: string, patch: Partial<OpenSheet>): void {
  const s = sheetStack.open.find((x) => x.id === id);
  if (s) Object.assign(s, patch);
}

/** Drop a sheet from the stack (on unmount). */
export function removeSheet(id: string): void {
  const i = sheetStack.open.findIndex((s) => s.id === id);
  if (i !== -1) sheetStack.open.splice(i, 1);
}

/** Open push sheets on `side`, in stack order — the ones taking layout space. */
export function pushSheetsOn(
  open: readonly OpenSheet[],
  side: SheetSide,
): readonly OpenSheet[] {
  return open.filter((s) => s.mode === "push" && s.align === side);
}

/**
 * Total px the center dock must give up on `side` — the sum of every open push
 * sheet's width there.
 */
export function pushInset(open: readonly OpenSheet[], side: SheetSide): number {
  return pushSheetsOn(open, side).reduce((sum, s) => sum + s.widthPx, 0);
}

/**
 * How far in from `side`'s edge a given push sheet sits — the widths of the
 * push sheets opened before it, so two stack side by side instead of
 * overlapping. Returns 0 for a sheet that isn't a push sheet on that side.
 */
export function pushOffset(
  open: readonly OpenSheet[],
  id: string,
  side: SheetSide,
): number {
  const on = pushSheetsOn(open, side);
  const i = on.findIndex((s) => s.id === id);
  if (i <= 0) return 0;
  return on.slice(0, i).reduce((sum, s) => sum + s.widthPx, 0);
}
