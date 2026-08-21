// The focus-region model (RFC 0012 §B). One declared list of the top-level focus
// regions — Left dock → Center dock → Right dock → Status bar — drives every
// cross-region focus move that used to be three separate ad-hoc systems:
//
//   • the region cycle (Cmd+Alt+. / Cmd+Alt+,) steps `order` and calls `focusEntry`;
//   • the boundary-Tab handoff hands focus to the next region when Tab would
//     leave a side dock's last tabbable (was hardcoded left→center; now any
//     side dock → its neighbor);
//   • click-to-enter focuses a region's entry when its background is clicked
//     (one implementation for the side panes AND the status bar).
//
// Each region owns its structural selector (`contains`) and its entry behavior
// (`focusEntry`), instead of those being scattered across files. The center's
// async retry machinery (`focusGen` / `retryFocus`) stays in dock-api-registry —
// it's the one genuinely subtle bit and is already isolated; the center region's
// `focusEntry` just calls `focusCenterDock`, and every other entry first calls
// `supersedeCenterRetry()` so a still-running center retry can't yank focus back.

import { focusActivePaneContent } from "../layout/side-pane-focus";
import { focusSidePaneActiveTab } from "../layout/side-pane-registry";
import {
  focusCenterDock,
  supersedeCenterRetry,
} from "../docked/dock-api-registry";
import { store } from "../state/store";
import {
  INTERACTIVE,
  firstTabbable,
  focusFirstOrContainer,
  tabbablesIn,
} from "./focus-dom";

/** A collapsed side column is out of Tab order entirely — including while it's
 * revealed by an edge-hover peek, since peek is a mouse-only affordance with no
 * keyboard gesture to invoke it (a peeking column has real width, so the
 * `clientWidth` check below wouldn't catch it on its own). */
function isCollapsed(side: "left" | "right"): boolean {
  return side === "left" ? store.leftPanelCollapsed : store.rightPanelCollapsed;
}

/**
 * A top-level focus region. The host derives the region cycle, the boundary-Tab
 * handoff, and click-to-enter from the one {@link REGIONS} list.
 */
interface FocusRegion {
  /** Stable id, also the structural identity. */
  id: "left" | "center" | "right" | "statusbar";
  /** Left→right sequence (matches the index in {@link REGIONS}). */
  order: number;
  /** Whether focus (or a clicked element) is inside this region. */
  contains(el: Element): boolean;
  /**
   * Put focus on this region's entry point. Returns false when the region is
   * empty/collapsed (nothing to land on), so the caller moves on.
   */
  focusEntry(): boolean;
  /**
   * This region's tabbables in document order — provided by side docks only, for
   * the boundary-Tab handoff. Omitted ⇒ no forward-Tab handoff out of the region
   * (the center owns its own keyboarding; the status bar lets Tab flow out).
   */
  tabbables?(): HTMLElement[];
}

/** The visible side-pane element for a side, or null when collapsed (peeking
 * or not — see `isCollapsed`) or empty. */
function sidePane(side: "left" | "right"): HTMLElement | null {
  if (isCollapsed(side)) return null;
  for (const p of document.querySelectorAll<HTMLElement>(paneSelector(side))) {
    if (p.clientWidth > 0) return p;
  }
  return null;
}

/** Every pane of one dock. Matches on `data-location`, not a `data-slot`
 * prefix: a pane id is opaque (RFC 0027), so `[data-slot^="left"]` would stop
 * matching the moment a user splits a dock and lands a panel in a new pane —
 * silently dropping that pane out of the keyboard region. */
function paneSelector(side: "left" | "right"): string {
  return `.side-pane[data-location="${side}"]`;
}

/** Build a side-dock region (left/right) — they share entry + tabbable logic. */
function sideRegion(side: "left" | "right", order: number): FocusRegion {
  const sel = paneSelector(side);
  return {
    id: side,
    order,
    contains: (el) => !!el.closest(sel),
    focusEntry() {
      supersedeCenterRetry();
      // A collapsed/hidden side dock stays mounted (the resizable panel clips it
      // to zero width rather than unmounting), so its tab buttons are still
      // queryable and focusable. Bail before any fallback can land on them —
      // otherwise the dock would stay in the region cycle while not shown.
      const pane = sidePane(side);
      if (!pane) return false;
      // Land in the active panel's content (its first tabbable — e.g. the
      // workspaces list), the same landing click-to-enter uses, so the keyboard
      // takes over and the panel's own focus ring shows. The tab-button →
      // container fallbacks are entry-only (a region cycle / Tab handoff must
      // always land *somewhere* in the region; a click on empty content doesn't).
      if (focusActivePaneContent(pane)) return true;
      if (focusSidePaneActiveTab(side)) return true;
      const active =
        pane.querySelector<HTMLElement>('.tab-pane[data-active="true"]') ??
        pane;
      return focusFirstOrContainer(active);
    },
    tabbables() {
      // Collapsed: excluded from the handoff entirely, peeking or not (see
      // `isCollapsed`).
      if (isCollapsed(side)) return [];
      // Only the ACTIVE panel's tabbables in each pane — a side dock keeps its
      // inactive panels mounted but hidden, and their (unfocusable) tabbables
      // would otherwise be picked as the "last", breaking the handoff.
      const els: HTMLElement[] = [];
      for (const pane of document.querySelectorAll<HTMLElement>(sel)) {
        const active =
          pane.querySelector<HTMLElement>('.tab-pane[data-active="true"]') ??
          pane;
        els.push(...tabbablesIn(active));
      }
      return els;
    },
  };
}

// Declared left→right. Index === order, so stepping is plain index arithmetic.
const REGIONS: readonly FocusRegion[] = [
  sideRegion("left", 0),
  {
    id: "center",
    order: 1,
    contains: (el) => !!el.closest(".center-body"),
    // The center's entry (active editor/terminal cursor, with the cross-frame
    // retry) lives in dock-api-registry; it returns false for an empty center so
    // the region cycle / Tab handoff skip it rather than trapping on dead chrome.
    focusEntry: () => focusCenterDock(),
  },
  sideRegion("right", 2),
  {
    id: "statusbar",
    order: 3,
    contains: (el) => !!el.closest(".status-bar"),
    focusEntry() {
      supersedeCenterRetry();
      const bar = document.querySelector<HTMLElement>(".status-bar");
      return bar ? focusFirstOrContainer(bar) : false;
    },
    // The status bar is the last region in document order, so Tab off its last
    // item would otherwise hit the empty <body> stop WebKit inserts before
    // wrapping. Exposing its tabbables lets the handoff wrap straight to the
    // first region instead.
    tabbables() {
      const bar = document.querySelector<HTMLElement>(".status-bar");
      return bar ? tabbablesIn(bar) : [];
    },
  },
];

/** The region currently holding `el`, or null when it's outside every region. */
export function regionOf(el: Element | null): FocusRegion | null {
  if (!el) return null;
  return REGIONS.find((r) => r.contains(el)) ?? null;
}

/**
 * Move focus to the next/previous region (Left → Center → Right → Status bar),
 * skipping empty/collapsed ones and wrapping at the ends. Pivots on the center
 * when focus is outside every region, so a step lands on a predictable neighbor.
 * Returns false when no other region can take focus.
 */
export function cycleRegionFocus(dir: 1 | -1): boolean {
  const n = REGIONS.length;
  const cur = regionOf(document.activeElement);
  const start = cur
    ? REGIONS.indexOf(cur)
    : REGIONS.findIndex((r) => r.id === "center");
  for (let step = 1; step <= n; step++) {
    const next = REGIONS[(((start + dir * step) % n) + n) % n];
    if (next === cur) continue; // never land back on ourselves
    if (next.focusEntry()) return true; // empty regions return false → keep going
  }
  return false;
}

/**
 * Boundary-Tab handoff. When Tab would carry focus past a region's last tabbable,
 * send it straight to the next focusable region's entry — skipping the resize
 * handle and dockview chrome in between, and (at the document's end) the empty
 * `<body>` stop WebKit inserts before wrapping. Skips empty/collapsed regions and
 * wraps, mirroring the region cycle. Only regions that expose `tabbables()` hand
 * off (side docks + the status bar); the center owns its own Tab key (indent /
 * completion), so you leave it via the region cycle or a click, not Tab. Returns
 * a disposer.
 */
export function installRegionTabHandoff(): () => void {
  function onKey(e: KeyboardEvent): void {
    if (e.key !== "Tab" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) {
      return;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const region = regionOf(active);
    const tabbables = region?.tabbables?.();
    if (!tabbables || active !== tabbables[tabbables.length - 1]) return;
    const n = REGIONS.length;
    for (let step = 1; step < n; step++) {
      const next = REGIONS[(region!.order + step) % n];
      if (next.focusEntry()) {
        e.preventDefault();
        return;
      }
    }
  }
  document.addEventListener("keydown", onKey, true);
  return () => document.removeEventListener("keydown", onKey, true);
}

/**
 * Click-to-enter: when a region's empty background is clicked (`target` is not a
 * real control), focus that region's entry point and return true. One
 * implementation for the side panes and the status bar — replacing the separate
 * `enterActivePaneOnClick` and the status bar's own mousedown handler. Returns
 * false for a click on a real control (it focuses itself) or outside any region.
 */
export function enterRegionOnPointer(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(INTERACTIVE)) return false;
  // Never treat a draggable element as background: the caller `preventDefault()`s
  // a truthy return, and `preventDefault` on `mousedown` cancels the browser's
  // native drag gesture (so `dragstart` never fires). Draggable rows/headers own
  // their own pointer interaction and focus themselves via their handlers.
  if (target.closest('[draggable="true"]')) return false;
  // A side pane: enter the SPECIFIC pane clicked (per-pane, so a bottom split
  // pane's background enters it, not the top pane).
  const pane = target.closest<HTMLElement>(".side-pane");
  if (pane) {
    supersedeCenterRetry();
    return focusActivePaneContent(pane);
  }
  const bar = target.closest<HTMLElement>(".status-bar");
  if (bar) {
    supersedeCenterRetry();
    const first = firstTabbable(bar);
    if (!first) return false;
    first.focus();
    return true;
  }
  return false;
}
