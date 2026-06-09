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

function record(): void {
  if (inRegion(document.activeElement)) {
    lastFocused = document.activeElement as HTMLElement;
  }
}

/**
 * The element to re-focus when the window regains focus, or `null` to leave
 * focus as-is. Returns `null` when focus already sits on a real region element
 * (the activating click landed somewhere — don't override the user), and
 * otherwise the last region element focused before the app lost focus, if it's
 * still in the DOM. Pure, for testing.
 */
export function restoreTarget(
  active: Element | null,
  last: HTMLElement | null,
): HTMLElement | null {
  if (inRegion(active)) return null;
  if (last && last.isConnected && inRegion(last)) return last;
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
