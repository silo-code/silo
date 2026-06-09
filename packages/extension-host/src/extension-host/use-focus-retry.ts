import { useEffect } from "react";
import type { DockPanelApi } from "@silo-code/sdk";

// Shared focus-retry helpers for content viewers.
//
// A freshly-mounted or newly-activated dock panel does NOT reliably inherit DOM
// focus: dockview runs its own focus shuffle when panels mount/activate, and
// rich editors (Monaco, xterm) only accept focus once their internal textarea
// has been laid out with non-zero dimensions. A single `focus()` call loses
// these races, which is why a viewer would otherwise need a second click before
// you can type. We retry across animation frames until the target actually
// reports focus, the panel is no longer the one we wanted to focus, or we hit a
// frame cap (~330ms) so we never loop forever when focus legitimately can't be
// grabbed (panel hidden, etc.).

const DEFAULT_CAP = 20;

const MENU_SELECTOR = ".context-view, .monaco-menu";

/**
 * Whether focus currently sits inside an open floating menu — a Silo
 * `ctx.ui.showMenu` menu (light DOM) or Monaco's context menu (rendered in a
 * shadow root, where `document.activeElement` resolves only to the open
 * `shadow-root-host` and the menu nodes hang off its `shadowRoot`).
 */
function focusInMenu(active: Element | null): boolean {
  if (!active) return false;
  if (active.closest(MENU_SELECTOR)) return true;
  return active.shadowRoot?.querySelector(MENU_SELECTOR) != null;
}

/**
 * Repeatedly call `focus()` on successive animation frames until `isFocused()`
 * returns true, `stillWanted()` returns false, or `cap` frames have elapsed.
 *
 * Use directly for one-shot focus (e.g. on editor mount). For focusing a panel
 * whenever its dock tab becomes active, prefer {@link useFocusOnActive}.
 *
 * @internal
 */
export function retryFocus(
  focus: () => void,
  isFocused: () => boolean,
  stillWanted: () => boolean = () => true,
  cap = DEFAULT_CAP,
): void {
  let attempts = 0;
  let landed = false;
  const tick = () => {
    // Bail before touching focus if we're no longer wanted — a newer focus
    // intent superseded us (e.g. the user kept pressing the region-cycle chord).
    // Checked here, not just after the grab below, so a stale retry can't yank
    // focus back from the area the user actually moved to.
    if (!stillWanted()) return;
    attempts += 1;
    if (isFocused()) {
      landed = true;
    } else {
      // Before focus first lands, grab aggressively each frame — Monaco/xterm
      // only accept focus once their textarea is laid out, so early calls lose.
      // After it has landed, only re-grab if focus fell to NOTHING (<body>/null):
      // dockview's show/hide shuffle can bounce focus off the just-focused
      // editor a frame or two later (the "keystrokes dropped after a switch"
      // symptom). We watch the full frame budget to catch that — but never yank
      // focus away from another real element the user may have moved to.
      const active = document.activeElement;
      // Focus legitimately moved into an open context menu — don't yank it
      // back, or the menu's focus-out dismiss fires and it flashes shut.
      // Right-clicking an *inactive* editor activates its dock panel, which
      // starts this retry; without the guard the per-frame `focus()` steals
      // focus from the just-opened menu (the focused case never starts the
      // retry, which is why the bug only shows when the editor was unfocused).
      // Monaco renders its context menu inside a shadow root, so from the light
      // DOM `document.activeElement` is only the `shadow-root-host` — the menu
      // nodes live one level down — hence the shadow-root peek, not just a
      // light-DOM `closest`. End the loop: Monaco restores editor focus itself
      // once the menu closes.
      if (focusInMenu(active)) return;
      const lostToNothing = active === null || active === document.body;
      if (!landed || lostToNothing) focus();
    }
    if (attempts >= cap || !stillWanted()) return;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Whether a `<textarea>` inside `node` is the live `document.activeElement` —
 * i.e. the editor/terminal genuinely holds DOM keyboard focus *right now*.
 *
 * Use this, not `editor.hasTextFocus()`, as a focus-retry exit condition.
 * Monaco's `hasTextFocus()` is a tracker flag that goes **stale-true** when a
 * blur is dropped during dockview's show/hide shuffle; trusting it lets
 * {@link retryFocus} stop after one attempt believing focus landed when DOM
 * focus is actually on nothing — the "keystrokes silently dropped after a tab
 * switch" symptom. The DOM `activeElement` can't lie about that.
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

/**
 * Focus a viewer's content whenever its dock tab becomes active, using
 * {@link retryFocus} to win dockview's focus shuffle — and, symmetrically,
 * release focus when the tab is deactivated.
 *
 * @param api - The surrounding dock panel api (`dockApi` / `props.api`).
 * @param focus - Imperatively focus the content (e.g. `editor.focus()`).
 * @param isFocused - Whether the content currently holds focus, so the retry
 *   can stop as soon as it lands instead of burning the whole frame cap.
 * @param blur - Release the content's text focus when the tab deactivates.
 *   Without this, a kept-alive editor can stay "focused" in Monaco's eyes and
 *   steal keystrokes from the newly-active tab (see {@link blurTextareaWithin}).
 *
 * @internal
 */
export function useFocusOnActive(
  api: DockPanelApi,
  focus: () => void,
  isFocused: () => boolean,
  blur?: () => void,
): void {
  useEffect(() => {
    const sub = api.onDidActiveChange(() => {
      if (api.isActive) retryFocus(focus, isFocused, () => api.isActive);
      else blur?.();
    });
    return () => sub.dispose();
    // `focus`/`isFocused`/`blur` close over refs, so the listener only needs `api`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);
}
