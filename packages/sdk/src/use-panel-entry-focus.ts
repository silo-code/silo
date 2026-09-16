import { useCallback, useEffect, useRef } from "react";
import type { DockPanelApi } from "./types";

// Entry focus for a dock panel — landing the caret in the panel's content when
// the user enters it.
//
// A freshly-mounted or newly-activated dock panel does NOT reliably inherit DOM
// focus: dockview runs its own focus shuffle when panels mount/activate, and
// rich content (Monaco, xterm) only accepts focus once its internal textarea
// has been laid out with non-zero dimensions. A single `focus()` call loses
// these races, which is why a panel would otherwise need a second click before
// you can type. We retry across animation frames until the target actually
// reports focus, the panel is no longer the one we wanted to focus, or we hit a
// frame cap (~330ms) so we never loop forever when focus legitimately can't be
// grabbed (panel hidden, content disabled, etc.).

const DEFAULT_CAP = 20;

// Every menu implementation whose open state must suppress the retry: Silo's
// own menus (`ctx.ui.showMenu`, which renders `[data-silo-menu]` with
// `role="menu"`), a third-party menu that follows the same ARIA role, and
// Monaco's context menu (`.context-view` / `.monaco-menu`).
const MENU_SELECTOR =
  '[data-silo-menu], [role="menu"], .context-view, .monaco-menu';

/**
 * Whether focus currently sits inside an open floating menu. Monaco renders its
 * context menu into a shadow root, where `document.activeElement` resolves only
 * to the open `shadow-root-host` and the menu nodes hang off its `shadowRoot` —
 * hence the shadow peek, not just a light-DOM `closest`.
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
 * `stillWanted` is **required**, and must express "this panel is still the one
 * that should hold focus" — normally `() => api.isActive`, or the center
 * dock's focus-intent token (`focusGen`). It is deliberately not optional: a
 * retry loop without it keeps grabbing focus for its entire frame budget no
 * matter what else happened meanwhile. That matters most on *mount*, because
 * re-entering a workspace re-mounts its panels — so an unguarded mount-time
 * grab in a background tab yanks focus away from the tab the user actually
 * left active. And because DOM focus landing inside a dockview panel makes
 * dockview mark that panel's group active
 * (`contentContainer.onDidFocus → doSetGroupActive`), stealing focus silently
 * changes the visible active tab too. That was symptom 1 in ADR 0034.
 *
 * Panel content should reach for {@link usePanelEntryFocus} instead, which
 * supplies the guard and both entry subscriptions for you. This raw form is
 * host/`core.*` plumbing for the non-React callers that can't.
 *
 * @internal
 */
export function retryFocus(
  focus: () => void,
  isFocused: () => boolean,
  stillWanted: () => boolean,
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
      // content a frame or two later (the "keystrokes dropped after a switch"
      // symptom). We watch the full frame budget to catch that — but never yank
      // focus away from another real element the user may have moved to.
      const active = document.activeElement;
      // Focus legitimately moved into an open context menu — don't yank it
      // back, or the menu's focus-out dismiss fires and it flashes shut.
      // Right-clicking an *inactive* panel activates it, which starts this
      // retry; without the guard the per-frame `focus()` steals focus from the
      // just-opened menu (the focused case never starts the retry, which is why
      // the bug only shows when the panel was unfocused). End the loop: the
      // menu's owner restores content focus itself once the menu closes.
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
 * The content {@link usePanelEntryFocus} drives — how to focus it, how to tell
 * whether it already has focus, and optionally how to release it.
 *
 * All three are called through a latest-ref, so inline closures over props or
 * state are always current; you never need to memoize them.
 *
 * @category Core Types
 * @public
 */
export interface PanelEntryFocusTarget {
  /**
   * Imperatively focus the panel's content — e.g. `() => inputRef.current?.focus()`
   * or `() => editor.focus()`. Safe to make a no-op while the content isn't
   * ready to take focus; the retry simply expires.
   */
  focus: () => void;
  /**
   * Whether the content holds DOM keyboard focus **right now**, so the retry
   * can stop as soon as it lands instead of burning the whole frame budget.
   *
   * Read the live `document.activeElement` — e.g.
   * `() => document.activeElement === inputRef.current`. Don't trust a
   * library's own tracker flag (Monaco's `hasTextFocus()`, say): those go
   * stale-true when a blur is dropped during dockview's show/hide shuffle,
   * which stops the retry believing focus landed when it didn't.
   */
  isFocused: () => boolean;
  /**
   * Release the content's focus when the panel's tab is deactivated. Only
   * needed for content that tracks its own focus state internally — a Monaco
   * editor or an xterm terminal is kept alive (hidden) while its tab is
   * inactive, and if its tracker stays stuck believing it has focus it will
   * steal keystrokes meant for the tab you switched to. A plain input needs
   * nothing here.
   */
  blur?: () => void;
}

/**
 * Land keyboard focus in a dock panel's content whenever the user enters the
 * panel, winning dockview's focus shuffle — and, symmetrically, release it when
 * the panel's tab is deactivated.
 *
 * A panel that puts the cursor somewhere on entry (a chat composer, a search
 * box, an editor) needs three things that are easy to get individually wrong,
 * and this hook is all three in one call:
 *
 * 1. **Both entry signals.** {@link DockPanelApi.onDidActiveChange} covers real
 *    activations. {@link DockPanelApi.onDidRequestFocus} covers a click on a
 *    tab that was *already* active — dockview treats that as a complete no-op
 *    and fires no active-change event, even though it is the commonest way a
 *    user asks for the cursor back (they were typing in a side panel, clicked
 *    the status bar, then clicked your tab).
 * 2. **A guard.** Focus is only ever taken while the panel is the active one.
 *    Mount is not "the user just created this panel" — re-entering a workspace
 *    re-mounts every panel in its dock — and DOM focus landing in a panel makes
 *    dockview activate its group, so an unguarded grab silently changes the
 *    visible tab (ADR 0034).
 * 3. **A retry.** A single `focus()` loses dockview's shuffle, and rich content
 *    only accepts focus once its internal textarea is laid out. The hook
 *    retries across frames until focus lands, standing down if the panel stops
 *    being active or focus moves into an open context menu.
 *
 * ```tsx
 * function AcmeChatPanel({ api }: DockPanelProps) {
 *   const input = useRef<HTMLTextAreaElement | null>(null);
 *
 *   usePanelEntryFocus(api, {
 *     focus: () => input.current?.focus(),
 *     isFocused: () => document.activeElement === input.current,
 *   });
 *
 *   return <textarea ref={input} />;
 * }
 * ```
 *
 * The returned function runs the same guarded retry on demand, for content that
 * becomes focusable at a moment that is neither a mount nor an activation — a
 * session finishing its connect, an editor finishing its own mount. It is
 * referentially stable, so it is safe in a dependency array:
 *
 * ```tsx
 * const focusComposer = usePanelEntryFocus(api, { focus, isFocused });
 *
 * useEffect(() => {
 *   if (ready) focusComposer();
 * }, [ready, focusComposer]);
 * ```
 *
 * @param api - The surrounding panel's api ({@link DockPanelProps.api}).
 * @param target - How to focus, test, and release the panel's content.
 * @returns A stable callback that runs the guarded focus retry on demand.
 *
 * @category Consumer Services
 * @public
 */
export function usePanelEntryFocus(
  api: DockPanelApi,
  target: PanelEntryFocusTarget,
): () => void {
  // Read the callbacks through a ref rather than closing over them: the
  // subscription effect depends on `api` alone (re-subscribing every render
  // would be worse), so a captured `target` would freeze at its first render
  // and an author's inline `() => { if (enabled) … }` would go stale.
  const latest = useRef(target);
  useEffect(() => {
    latest.current = target;
  });

  const focusNow = useCallback(() => {
    if (!api.isActive) return;
    retryFocus(
      () => latest.current.focus(),
      () => latest.current.isFocused(),
      () => api.isActive,
    );
  }, [api]);

  useEffect(() => {
    const subActive = api.onDidActiveChange(() => {
      if (api.isActive) focusNow();
      else latest.current.blur?.();
    });
    // `focusNow` guards on `isActive` itself: a Focus Request says only that
    // the user asked, never that this panel became active.
    const subRequest = api.onDidRequestFocus(focusNow);
    return () => {
      subActive.dispose();
      subRequest.dispose();
    };
  }, [api, focusNow]);

  return focusNow;
}
