/**
 * Whether a click on the chat panel should move focus to the composer.
 *
 * The panel has exactly one thing to type into, so a click that lands on
 * "background" — plain transcript text, the gaps between messages, empty
 * composer padding — should behave like clicking a text field: focus moves
 * there. A click something else already claims (a link activation, a
 * tool/tool-group expand toggle, any button) must not also steal focus, and
 * neither should the mouseup at the end of a text-selection drag, or focus
 * would yank the caret into the composer and collapse the selection before
 * the user can copy it.
 *
 * `CLAIMED_SELECTOR` is a hand-maintained allowlist and nothing enforces it:
 * this is only correct as long as every interactive element in the chat panel
 * either matches it or calls `preventDefault()` on its click. Both guards are
 * in use today — the transcript's expandable tool and tool-group heads are
 * `<div>`s that take `role="button"` exactly when they're clickable, and link
 * activation calls `preventDefault()`. Anything new and clickable added to the
 * transcript has to satisfy one of the two, or a click on it will also yank
 * the caret into the composer.
 */

const CLAIMED_SELECTOR = 'button, a, input, textarea, select, [role="button"]';

export function isPanelBackgroundClick(
  target: EventTarget | null,
  hasTextSelection: boolean,
): boolean {
  if (hasTextSelection) return false;
  if (!(target instanceof Element)) return false;
  return target.closest(CLAIMED_SELECTOR) === null;
}
