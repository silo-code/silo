// Textarea focus-tracker helpers for Monaco/xterm content.
//
// The focus *retry* itself — and the `usePanelEntryFocus` hook that drives it
// from a panel's entry signals — is public SDK surface (`@silo-code/sdk`, RFC
// 0049), so `silo.*` and third-party panels get the same implementation the
// bundled viewers use. What stays here is the part that isn't general: Monaco
// and xterm keep their own focus trackers, which dockview's show/hide shuffle
// desynchronizes, and only the host and `core.*` viewers deal with that.

/**
 * Whether a `<textarea>` inside `node` is the live `document.activeElement` —
 * i.e. the editor/terminal genuinely holds DOM keyboard focus *right now*.
 *
 * Use this, not `editor.hasTextFocus()`, as a focus-retry exit condition.
 * Monaco's `hasTextFocus()` is a tracker flag that goes **stale-true** when a
 * blur is dropped during dockview's show/hide shuffle; trusting it lets the
 * retry stop after one attempt believing focus landed when DOM focus is
 * actually on nothing — the "keystrokes silently dropped after a tab switch"
 * symptom. The DOM `activeElement` can't lie about that.
 *
 * @internal
 */
export function isTextareaFocusedWithin(
  node: HTMLElement | null | undefined,
): boolean {
  const active = document.activeElement;
  return (
    !!node && active instanceof HTMLTextAreaElement && node.contains(active)
  );
}

/**
 * Release the text focus held by a Monaco editor or xterm terminal inside
 * `node`, called when its dock tab is deactivated.
 *
 * dockview keeps inactive panels alive (hidden), so a deactivated tab's editor
 * is NOT torn down. During dockview's show/hide shuffle the editor's real
 * `blur` event is frequently **dropped** — DOM focus moves to the newly-active
 * editor, but the deactivated editor's focus tracker stays stuck reporting
 * `hasTextFocus() === true`. With two editors both believing they hold text
 * focus, Monaco misroutes typed input to the stale one: the tab you just left
 * receives keystrokes meant for the one you switched to.
 *
 * Two cases, because deactivation can fire either side of the focus move:
 * - The textarea is still the live `document.activeElement` (focus hasn't moved
 *   to the incoming panel yet) → a real `blur()` releases it cleanly.
 * - The textarea is no longer the active element (the common case — focus
 *   already moved and the real blur was dropped) → `blur()` would be a no-op,
 *   so we re-dispatch the `blur`/`focusout` events to resync the stuck tracker
 *   without disturbing where DOM focus currently is.
 *
 * @internal
 */
export function blurTextareaWithin(node: HTMLElement | null | undefined): void {
  if (!node) return;
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement && node.contains(active)) {
    active.blur();
    return;
  }
  node.querySelectorAll("textarea").forEach((ta) => {
    ta.dispatchEvent(new FocusEvent("blur"));
    ta.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}
