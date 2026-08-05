// Small screen mode ("Laptop Mode"): when the app window's own logical width
// drops below a threshold (e.g. a MacBook loses its external monitor), the app
// switches to a **second layout mode** — its own collapse state and its own
// column widths — and switches back once the window grows again.
//
// The two modes are independent layouts, not a temporary tweak of one layout.
// Collapsing or reopening a side column on a narrow window is remembered for
// the *next* narrow window and never disturbs the normal-width layout, and vice
// versa. The live pair is `leftPanelCollapsed`/`rightPanelCollapsed`; the mode
// that isn't on screen sits in `inactiveModeCollapsed`, and a mode change is
// just a swap of the two (`swapCollapseMode`). Both are per-workspace: the
// workspace record stores them in `leftPanelCollapsed`/`rightPanelCollapsed`
// and `smallScreenCollapsed`, and a workspace switch loads both
// (`loadPanelStateFromWorkspace`). The column *widths* work the same way —
// AppShell owns that half, through `layout/column-widths.ts`.
//
// Peek: hovering the cursor at the window's edge reveals a collapsed side panel
// as a transient overlay (see AppShell.tsx's `--peek-width` CSS), which
// self-hides once the cursor leaves. It applies to *any* collapsed side panel
// at any window size — small-screen mode makes it load-bearing but doesn't own
// it. The overlay's width is its own global preference, resizable by dragging
// its handle (`beginPeekResize`), independent of either mode's column width.
//
// Centralized here so the resize/hysteresis/debounce/peek-timer logic lives in
// one place: AppShell only reads the store fields this module writes
// (`smallScreenActive`, `*PanelPeeking`) to drive collapse/expand and the peek
// overlay's CSS, and `focus-regions.ts` keeps a collapsed (or peeking) column
// out of Tab order.

import { subscribe } from "valtio";
import {
  store,
  setSmallScreenPeekWidthPx,
  swapCollapseMode,
} from "../state/store";
import {
  SMALL_SCREEN_HYSTERESIS_PX,
  MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
  MAX_SMALL_SCREEN_PEEK_WIDTH_PX,
  DEFAULT_SMALL_SCREEN_COLLAPSE,
} from "../state/types";

const RESIZE_DEBOUNCE_MS = 200;
const EDGE_HOTSPOT_PX = 6;
const PEEK_DWELL_MS = 220;
const PEEK_GRACE_MS = 400;

type Side = "left" | "right";

/**
 * Hysteresis band: enters small-screen at `width < threshold`, but once
 * active, only exits at `width >= threshold + hysteresisPx`. Pure so the
 * boundary math is unit-testable without a DOM. Exported for tests.
 */
export function computeSmallScreenActive(
  currentlyActive: boolean,
  widthPx: number,
  thresholdPx: number,
  hysteresisPx: number = SMALL_SCREEN_HYSTERESIS_PX,
): boolean {
  if (currentlyActive) return widthPx < thresholdPx + hysteresisPx;
  return widthPx < thresholdPx;
}

function collapsedKey(
  side: Side,
): "leftPanelCollapsed" | "rightPanelCollapsed" {
  return side === "left" ? "leftPanelCollapsed" : "rightPanelCollapsed";
}
function peekingKey(side: Side): "leftPanelPeeking" | "rightPanelPeeking" {
  return side === "left" ? "leftPanelPeeking" : "rightPanelPeeking";
}
function peekDraggingKey(
  side: Side,
): "leftPanelPeekDragging" | "rightPanelPeekDragging" {
  return side === "left" ? "leftPanelPeekDragging" : "rightPanelPeekDragging";
}
function peekWidthKey(
  side: Side,
): "smallScreenPeekWidthLeftPx" | "smallScreenPeekWidthRightPx" {
  return side === "left"
    ? "smallScreenPeekWidthLeftPx"
    : "smallScreenPeekWidthRightPx";
}

const SIDES: readonly Side[] = ["left", "right"];

/** What the normal-width layout falls back to when we leave small-screen mode
 * with nothing recorded to go back to (it was already active at launch and no
 * workspace has loaded yet). Small-screen mode's own default lives in
 * `state/types.ts` — `loadPanelStateFromWorkspace` needs it too. */
const DEFAULT_NORMAL_COLLAPSE = { left: false, right: false };

function clearPeek(): void {
  for (const side of SIDES) {
    store[peekingKey(side)] = false;
    store[peekDraggingKey(side)] = false;
  }
}

/** Switch the live layout to small-screen mode's own — the one this workspace
 * was last left in on a narrow window, or "both collapsed" the first time. */
function enterSmallScreenMode(): void {
  store.smallScreenActive = true;
  swapCollapseMode(DEFAULT_SMALL_SCREEN_COLLAPSE);
  clearPeek();
}

/** ...and back to the normal-width layout, exactly as the user left it. */
function exitSmallScreenMode(): void {
  store.smallScreenActive = false;
  swapCollapseMode(DEFAULT_NORMAL_COLLAPSE);
  clearPeek();
}

/** Whether `target` sits inside the peek wrapper for `side` (AppShell's
 * `.side-peek-host--left`/`--right`, see AppShell.tsx). Ancestry-based rather
 * than a bounding-rect check against a queried `.side-pane`: a side column can
 * split into a top + bottom pane (two separate `.side-pane` elements), and a
 * rect check against just one of them falsely reports "not engaged" — and
 * therefore hides the peek — while the cursor is over the other segment's tab
 * bar/content. `closest()` covers both segments uniformly since they're both
 * descendants of the one wrapper, regardless of the internal split. */
function isWithinPeekHost(side: Side, target: EventTarget | null): boolean {
  return (
    target instanceof Element && !!target.closest(`.side-peek-host--${side}`)
  );
}

/**
 * Edge-triggered: the mode swap runs exactly once per genuine large↔small
 * transition, never re-derived from steady state — that's what lets the user's
 * own collapse/reopen inside a mode stand, instead of being overwritten by the
 * next unrelated store change. A workspace switch needs nothing from here:
 * `loadPanelStateFromWorkspace` loads both of the incoming workspace's layout
 * modes and picks the live one by `smallScreenActive`.
 */
function createResizeWatcher() {
  function evaluate(widthPx: number): void {
    if (!store.smallScreenModeEnabled) {
      if (store.smallScreenActive) exitSmallScreenMode();
      return;
    }
    const next = computeSmallScreenActive(
      store.smallScreenActive,
      widthPx,
      store.smallScreenThresholdPx,
    );
    if (next === store.smallScreenActive) return;
    if (next) enterSmallScreenMode();
    else exitSmallScreenMode();
  }

  function reevaluateForCurrentWidth(): void {
    evaluate(window.innerWidth);
  }

  return { reevaluateForCurrentWidth };
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: number | null = null;
  return () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

/** Cursor-at-edge dwell-to-peek / leave-to-hide for one side. Engages whenever
 * that side is collapsed — however it got that way and whatever the window
 * size, so reaching a panel you closed yourself is the same gesture as reaching
 * one small-screen mode closed for you. */
function createEdgeTracker(side: Side) {
  let dwellTimer: number | null = null;
  let graceTimer: number | null = null;

  function clearDwell(): void {
    if (dwellTimer !== null) {
      window.clearTimeout(dwellTimer);
      dwellTimer = null;
    }
  }
  function clearGrace(): void {
    if (graceTimer !== null) {
      window.clearTimeout(graceTimer);
      graceTimer = null;
    }
  }
  function scheduleGraceHide(): void {
    if (graceTimer === null) {
      graceTimer = window.setTimeout(() => {
        graceTimer = null;
        store[peekingKey(side)] = false;
      }, PEEK_GRACE_MS);
    }
  }

  /**
   * Force a "cursor left" signal without coordinates — the entry point for
   * the iframe-crossing detector (see `installSmallScreenMode`): a webview in
   * the center dock (e.g. `local-web-viewer`) swallows `mousemove` the moment
   * the cursor crosses onto it, since that's a separate document the parent
   * page can't see into. Without this, a peek that was open right as the
   * cursor entered the iframe would never get another real `mousemove` to
   * notice it had left, and would stay open until the cursor re-emerged.
   */
  function markDisengaged(): void {
    clearDwell();
    if (!store[peekingKey(side)]) return;
    if (store[peekDraggingKey(side)]) {
      clearGrace(); // an active drag always counts as engaged
      return;
    }
    scheduleGraceHide();
  }

  function onMouseMove(x: number, w: number, target: EventTarget | null): void {
    if (!store[collapsedKey(side)]) {
      clearDwell();
      if (store[peekingKey(side)]) {
        clearGrace();
        store[peekingKey(side)] = false;
      }
      return;
    }

    const nearEdge =
      side === "left" ? x <= EDGE_HOTSPOT_PX : x >= w - EDGE_HOTSPOT_PX;
    const peeking = store[peekingKey(side)];

    if (peeking) {
      // A drag in progress always counts as engaged — growing the overlay can
      // easily carry the cursor outside the pre-drag peek-host bounds (or, for
      // the right panel, past the edge hotspot check's math) well before the
      // overlay itself has resized to keep up.
      const engaged =
        nearEdge ||
        isWithinPeekHost(side, target) ||
        store[peekDraggingKey(side)];
      if (engaged) {
        clearGrace();
      } else {
        scheduleGraceHide();
      }
      return;
    }

    if (nearEdge) {
      if (dwellTimer === null) {
        dwellTimer = window.setTimeout(() => {
          dwellTimer = null;
          store[peekingKey(side)] = true;
        }, PEEK_DWELL_MS);
      }
    } else {
      clearDwell();
    }
  }

  function dispose(): void {
    clearDwell();
    clearGrace();
  }

  return { onMouseMove, markDisengaged, dispose };
}

/**
 * Wire up small-screen mode: a debounced window-resize listener, an
 * immediate check on mount (so launching already-small applies right away),
 * a subscription that re-checks when its settings change, and the edge-hover
 * peek trackers. Call once from AppShell; returns a disposer.
 */
export function installSmallScreenMode(): () => void {
  const watcher = createResizeWatcher();
  const leftEdge = createEdgeTracker("left");
  const rightEdge = createEdgeTracker("right");

  watcher.reevaluateForCurrentWidth();

  const onResize = debounce(
    watcher.reevaluateForCurrentWidth,
    RESIZE_DEBOUNCE_MS,
  );
  window.addEventListener("resize", onResize);

  // Toggling the feature or editing the threshold in Settings can cross the
  // boundary without the window ever resizing — run the same edge check.
  let prevEnabled = store.smallScreenModeEnabled;
  let prevThreshold = store.smallScreenThresholdPx;
  const unsubscribe = subscribe(store, () => {
    const changed =
      store.smallScreenModeEnabled !== prevEnabled ||
      store.smallScreenThresholdPx !== prevThreshold;
    prevEnabled = store.smallScreenModeEnabled;
    prevThreshold = store.smallScreenThresholdPx;
    if (changed) watcher.reevaluateForCurrentWidth();
  });

  function onMouseMove(e: MouseEvent): void {
    const w = window.innerWidth;
    leftEdge.onMouseMove(e.clientX, w, e.target);
    rightEdge.onMouseMove(e.clientX, w, e.target);
  }
  document.addEventListener("mousemove", onMouseMove);

  // The cursor crossing onto a webview (e.g. `local-web-viewer`'s <iframe> in
  // the center dock) never fires another `mousemove` on this document — it's
  // a separate document the parent can't see into. `mouseover`, though, still
  // fires normally on the iframe *element itself* the moment it becomes the
  // hover target, since that only depends on the parent's own layout. Use
  // that one crossing event as an explicit "cursor left" signal.
  function onMouseOverIframe(e: MouseEvent): void {
    const target = e.target;
    if (!(target instanceof Element) || !target.closest("iframe")) return;
    leftEdge.markDisengaged();
    rightEdge.markDisengaged();
  }
  document.addEventListener("mouseover", onMouseOverIframe);

  return () => {
    window.removeEventListener("resize", onResize);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseover", onMouseOverIframe);
    unsubscribe();
    leftEdge.dispose();
    rightEdge.dispose();
  };
}

/**
 * Next peek width for a drag of `deltaX` px from where it started. The
 * handle sits on the overlay's *inner* edge — dragging right grows the left
 * panel's overlay but shrinks the right panel's, hence the sign flip. Pure
 * (clamps to the same range `setSmallScreenPeekWidthPx` enforces) so the
 * drag math is unit-testable without a DOM. Exported for tests.
 */
export function nextPeekWidthPx(
  side: Side,
  startWidthPx: number,
  deltaX: number,
): number {
  const raw = side === "left" ? startWidthPx + deltaX : startWidthPx - deltaX;
  return Math.max(
    MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
    Math.min(MAX_SMALL_SCREEN_PEEK_WIDTH_PX, Math.round(raw)),
  );
}

/**
 * Start a peek-overlay resize drag from a `mousedown` on its handle (see
 * AppShell.tsx). Global (not per-workspace) — the width this writes applies
 * to every workspace's peek, independent of each workspace's own normal
 * (large-screen) panel width. Returns a disposer; also self-disposes on
 * `mouseup`.
 */
export function beginPeekResize(side: Side, startClientX: number): () => void {
  const startWidthPx = store[peekWidthKey(side)];
  store[peekDraggingKey(side)] = true;
  document.body.classList.add("panel-resizing");

  function onMove(e: MouseEvent): void {
    setSmallScreenPeekWidthPx(
      side,
      nextPeekWidthPx(side, startWidthPx, e.clientX - startClientX),
    );
  }
  function dispose(): void {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.classList.remove("panel-resizing");
    store[peekDraggingKey(side)] = false;
  }
  function onUp(): void {
    dispose();
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  return dispose;
}
