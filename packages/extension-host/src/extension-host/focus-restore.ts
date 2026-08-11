// Restore focus to the last-focused region when the app regains focus.
//
// macOS eats the click that reactivates an inactive window (we don't enable
// acceptsFirstMouse — that would also *trigger* whatever the click lands on), so
// without this the previously-focused dock/panel stays blurred until a second
// click. We remember the last element focused inside a top-level region and
// re-focus it when the window becomes focused again, so the activating click
// drops you right back where you were.

const REGION = ".side-pane, .center-body, .status-bar";

let lastFocused: HTMLElement | null = null;

function inRegion(el: Element | null): el is HTMLElement {
  return el instanceof HTMLElement && el.closest(REGION) !== null;
}

// True when `el` isn't inside a workspace dock at all (side-pane, status-bar —
// always "live"), or is inside the currently-foreground one. False for an
// element belonging to a backgrounded workspace's (hidden) dock — CenterDock
// keeps every visited workspace mounted as a sibling `.dock-host` inside the
// same shared `.center-body`, only toggling `data-active`, so REGION's own
// selector can't tell them apart on its own. See ADR 0034.
function inLiveDockScope(el: Element): boolean {
  const host = el.closest(".dock-host");
  return !host || host.getAttribute("data-active") === "true";
}

function record(): void {
  const el = document.activeElement;
  if (inRegion(el) && inLiveDockScope(el)) {
    lastFocused = el;
  }
}

/**
 * The element to re-focus when the window regains focus, or `null` to leave
 * focus as-is. Returns `null` when focus already sits on a real region element
 * (the activating click landed somewhere — don't override the user), and
 * otherwise the last region element focused before the app lost focus, if it's
 * still in the DOM and still inside the live (foreground) dock. Pure, for
 * testing — `inLiveScope` defaults to the real dock-liveness check and is
 * injectable so unit tests don't need a real dockview DOM.
 */
export function restoreTarget(
  active: Element | null,
  last: HTMLElement | null,
  inLiveScope: (el: Element) => boolean = inLiveDockScope,
): HTMLElement | null {
  if (inRegion(active)) return null;
  if (last && last.isConnected && inRegion(last) && inLiveScope(last)) {
    return last;
  }
  return null;
}

/** Start remembering the last-focused region element. Returns a disposer. */
export function trackRegionFocus(): () => void {
  document.addEventListener("focusin", record, true);
  return () => document.removeEventListener("focusin", record, true);
}

/**
 * Re-focus the last region element if focus was dropped — call when the window
 * regains focus (Tauri's `onFocusChanged`).
 */
export function restoreRegionFocus(): void {
  restoreTarget(document.activeElement, lastFocused)?.focus();
}
