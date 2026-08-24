import type { SheetAlign, SheetAnchor } from "./sheet-service";

// Pure geometry for a **modal** sheet: turn measured DOM rects into the fixed
// position it occupies. Split out from Sheet.tsx so the arithmetic — which
// anchor edge wins, what an app-anchored sheet's width resolves to, what
// happens when the anchoring dock is collapsed — is unit-testable without a DOM.

/** An app-anchored sheet takes this share of the workbench width… */
export const APP_WIDTH_RATIO = 0.7;
/** …capped here, so it stays a sheet rather than a full-screen takeover. */
export const APP_MAX_WIDTH_PX = 1550;
/** Fallback for a dock-anchored sheet that didn't name a width. */
export const DEFAULT_DOCK_WIDTH_PX = 520;

/** A measured rect, in viewport coordinates. */
export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

/** What a sheet resolves to: a fixed box pinned to one horizontal edge. */
export interface SheetPlacement {
  /** Distance from the viewport top. */
  top: number;
  /** Distance from the viewport bottom (clears the status bar). */
  bottom: number;
  width: number;
  /** Set for a left-side sheet; `right` is set instead for a right-side one. */
  left?: number;
  right?: number;
  /**
   * Horizontal insets for the scrim. For an edge-aligned sheet it begins where
   * the sheet *ends*, so the dimmed area is exactly the part of the window the
   * sheet doesn't occupy — nothing in the sheet's own vertical band is dimmed,
   * and the title-bar strip above it doesn't show through as a grey band. A
   * centered sheet touches no edge, so its scrim covers the whole window and
   * the sheet simply sits on top of it.
   *
   * Only an app-anchored sheet draws one; dock-anchored sheets are non-modal
   * and have no scrim at all. Computed for every placement regardless, since
   * the rule doesn't depend on the anchor.
   */
  scrim: { left: number; right: number };
}

export interface PlaceSheetInput {
  align: SheetAlign;
  anchor: SheetAnchor;
  /** The workbench column area — everything between title bar and status bar. */
  group: Box;
  /**
   * The anchoring side dock's rect, when `anchor` is `"dock"`. A collapsed dock
   * (zero width) or a missing one falls back to the app edge, so the sheet
   * still enters from somewhere sensible.
   */
  col?: Box | null;
  viewport: { width: number; height: number };
  /** Top strip reserved for the macOS traffic lights (0 elsewhere). */
  macOffset: number;
  /** Explicit width in px; omitted lets the anchor decide. */
  width?: number;
}

/**
 * The width a sheet takes when it didn't name one: app-anchored sheets scale
 * with the window (capped), dock-anchored sheets get a fixed default.
 */
export function resolveSheetWidth(
  anchor: SheetAnchor,
  groupWidth: number,
  width?: number,
): number {
  if (width != null) return width;
  if (anchor === "dock") return DEFAULT_DOCK_WIDTH_PX;
  return Math.min(groupWidth * APP_WIDTH_RATIO, APP_MAX_WIDTH_PX);
}

/** Resolve a sheet's fixed box from the measured layout. */
export function placeSheet(input: PlaceSheetInput): SheetPlacement {
  const { align, anchor, group, col, viewport, macOffset } = input;
  const top = group.top + macOffset;
  // An app-anchored sheet is the app's own modal surface, so it runs clear to
  // the bottom of the window, status bar included — while it's open the status
  // bar has nothing to report on. A dock sheet is workbench furniture and stops
  // where the workbench does, leaving the status bar visible beside it.
  const bottom = anchor === "app" ? 0 : viewport.height - group.bottom;
  const width = resolveSheetWidth(anchor, group.width, input.width);

  if (align === "center") {
    return {
      top,
      bottom,
      width,
      left: group.left + (group.width - width) / 2,
      scrim: { left: 0, right: 0 },
    };
  }

  // A dock-anchored sheet enters from the dock's *inner* edge; with no dock (or
  // a collapsed one) that edge collapses onto the app edge, which is exactly
  // where an app-anchored sheet starts.
  const useDock = anchor === "dock" && col != null && col.width > 0;

  if (align === "left") {
    const edge = useDock ? col.right : group.left;
    return {
      top,
      bottom,
      width,
      left: edge,
      scrim: { left: edge + width, right: 0 },
    };
  }
  const edge = useDock ? col.left : group.right;
  const right = viewport.width - edge;
  return {
    top,
    bottom,
    width,
    right,
    scrim: { left: 0, right: right + width },
  };
}
