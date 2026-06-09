// Entry-focus for a side pane: focus the active panel's first tabbable element,
// so the keyboard takes over from there. Used by the focus-region model's
// side-dock entry (region cycle / Tab handoff) and its click-to-enter. Panels
// stay plain accessible components — they expose normal focusable content (a
// roving `tabindex=0`, a button, an input) and this finds it.

import { firstTabbable } from "../extension-host/focus-dom";

/**
 * Focus the active panel's first tabbable element under `root` (the
 * `.tab-pane[data-active="true"]` within a side pane / tab host). Returns whether
 * it took focus. A panel using roving focus keeps its current item at
 * `tabindex=0` (the rest at `-1`), so this lands on that item; otherwise it lands
 * on the first natural control. `tabindex="-1"` controls are excluded (see the
 * shared `TABBABLE` selector), so a row's close button is never chosen ahead of
 * the roving item even when it appears earlier in the DOM.
 */
export function focusActivePaneContent(root: HTMLElement): boolean {
  const pane = root.querySelector<HTMLElement>('.tab-pane[data-active="true"]');
  const first = pane ? firstTabbable(pane) : null;
  if (!first) return false;
  first.focus();
  return true;
}
