// Small screen mode: when the app window's own logical width drops below a
// threshold (e.g. a MacBook loses its external monitor), auto-collapse the
// side panels that are currently open, and auto-restore them once the window
// grows back. While a panel is auto-hidden, hovering the cursor at the
// window's edge "peeks" it (a transient overlay — see AppShell.tsx's
// `--peek-width` CSS), which self-hides again once the cursor leaves. The
// overlay's width is its own global (not per-workspace) preference, resizable
// by dragging its handle (`beginPeekResize`) — independent of whatever width
// the panel normally has on a large screen.
//
// Centralized here so the resize/hysteresis/debounce/peek-timer logic lives
// in one place: AppShell only reads the store fields this module writes
// (`*PanelAutoHidden`, `*PanelPeeking`) to drive collapse/expand and the peek
// overlay's CSS, and `focus-regions.ts` reads `*PanelAutoHidden` to exclude an
// auto-hidden panel from Tab order. The manual/public collapse path
// (`setLeftPanelCollapsed`/`setRightPanelCollapsed` in state/store.ts, used by
// commands and `ctx.layout`) always clears `*PanelAutoHidden` — that's what
// makes a manual reopen "stick" instead of being re-hidden by this module.

import { subscribe } from "valtio";
import { store, setSmallScreenPeekWidthPx } from "../state/store";
import {
  SMALL_SCREEN_HYSTERESIS_PX,
  MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
  MAX_SMALL_SCREEN_PEEK_WIDTH_PX,
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
function autoHiddenKey(
  side: Side,
): "leftPanelAutoHidden" | "rightPanelAutoHidden" {
  return side === "left" ? "leftPanelAutoHidden" : "rightPanelAutoHidden";
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

/** Collapse whichever panels are currently open, marking them auto-hidden.
 * Idempotent — a panel that's already collapsed (manually or already
 * auto-hidden) is left alone, so this is safe to call on every workspace
 * switch while small-screen mode is active, not just on the resize edge. */
function hideOpenPanels(): void {
  for (const side of SIDES) {
    if (!store[collapsedKey(side)]) {
      store[autoHiddenKey(side)] = true;
      store[collapsedKey(side)] = true;
    }
  }
}

/** Restore whichever panels small-screen mode itself hid. Manually-collapsed
 * panels (`autoHidden === false`) are left alone. */
function restoreAutoHiddenPanels(): void {
  for (const side of SIDES) {
    if (store[autoHiddenKey(side)]) {
      store[autoHiddenKey(side)] = false;
      store[collapsedKey(side)] = false;
      store[peekingKey(side)] = false;
      store[peekDraggingKey(side)] = false;
    }
  }
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
 * Edge-triggered: `hideOpenPanels`/`restoreAutoHiddenPanels` only run exactly
 * once per genuine large↔small transition (or a workspace switch while
 * already small), never re-derived from steady state — that's what lets a
 * manual reopen (Q14: `setLeftPanelCollapsed`/`setRightPanelCollapsed`
 * clearing `autoHidden`) stick until the next real round-trip, instead of
 * being immediately re-hidden by the next unrelated store change.
 */
function createResizeWatcher() {
  let active = false;

  function evaluate(widthPx: number): void {
    if (!store.smallScreenModeEnabled) {
      if (active) {
        active = false;
        restoreAutoHiddenPanels();
      }
      return;
    }
    const next = computeSmallScreenActive(
      active,
      widthPx,
      store.smallScreenThresholdPx,
    );
    if (next === active) return;
    active = next;
    if (active) hideOpenPanels();
    else restoreAutoHiddenPanels();
  }

  function reevaluateForCurrentWidth(): void {
    evaluate(window.innerWidth);
  }

  /** Called whenever `smallScreenModeEnabled`, `smallScreenThresholdPx`, or
   * `activeWorkspaceId` change — re-runs the width check, and (per the
   * "applies uniformly across workspaces" decision) re-hides a newly-active
   * workspace's currently-open panels if the screen is already small. */
  function onWorkspaceOrSettingChange(): void {
    reevaluateForCurrentWidth();
    if (active) hideOpenPanels();
  }

  return { evaluate, reevaluateForCurrentWidth, onWorkspaceOrSettingChange };
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

/** Cursor-at-edge dwell-to-peek / leave-to-hide for one side. Only engages
 * while that side is small-screen-auto-hidden; a manually-collapsed panel
 * never peeks (Q7). */
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
    const autoHidden = store[autoHiddenKey(side)];
    if (!store.smallScreenModeEnabled || !autoHidden) {
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
 * a subscription that re-checks on workspace switch / settings changes, and
 * the edge-hover peek trackers. Call once from AppShell; returns a disposer.
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

  let prevWorkspaceId = store.activeWorkspaceId;
  let prevEnabled = store.smallScreenModeEnabled;
  let prevThreshold = store.smallScreenThresholdPx;
  const unsubscribe = subscribe(store, () => {
    const changed =
      store.activeWorkspaceId !== prevWorkspaceId ||
      store.smallScreenModeEnabled !== prevEnabled ||
      store.smallScreenThresholdPx !== prevThreshold;
    prevWorkspaceId = store.activeWorkspaceId;
    prevEnabled = store.smallScreenModeEnabled;
    prevThreshold = store.smallScreenThresholdPx;
    if (changed) watcher.onWorkspaceOrSettingChange();
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
