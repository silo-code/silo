/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryFocus } from "./use-panel-entry-focus";

// The retry is the whole substance of `usePanelEntryFocus` — the hook around it
// is two subscriptions and a guard. Per the repo testing guide we drive the
// logic directly rather than rendering React: `requestAnimationFrame` is
// replaced with a hand-pumped queue so every frame is deterministic. This file
// opts into jsdom (the SDK's suite is node by default) because the retry reads
// the live `document.activeElement` to decide whether focus fell to nothing or
// moved somewhere it must not be yanked back from.
describe("retryFocus", () => {
  let queue: FrameRequestCallback[] = [];
  let origRaf: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    queue = [];
    origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      queue.push(cb)) as typeof globalThis.requestAnimationFrame;
    document.body.innerHTML = "";
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
  });

  /** Run exactly one scheduled frame (ticks queued during it run on the next flush). */
  function flushFrame() {
    const due = queue;
    queue = [];
    for (const cb of due) cb(0);
  }

  it("stops re-grabbing focus once it is no longer wanted (the region-cycle race)", () => {
    const focus = vi.fn();
    let wanted = true;
    // Never reports focused, so without the guard it would grab every frame.
    retryFocus(
      focus,
      () => false,
      () => wanted,
    );

    flushFrame(); // wanted → grabs once
    expect(focus).toHaveBeenCalledTimes(1);

    wanted = false; // a newer focus intent superseded us
    flushFrame(); // must bail BEFORE grabbing
    flushFrame();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("re-grabs each frame until focus lands, then stops grabbing", () => {
    const focus = vi.fn();
    let focused = false;
    retryFocus(
      focus,
      () => focused,
      () => true,
    );

    flushFrame(); // not focused → grab
    flushFrame(); // still not focused → grab
    expect(focus).toHaveBeenCalledTimes(2);

    focused = true;
    flushFrame(); // landed → no further grab
    expect(focus).toHaveBeenCalledTimes(2);
  });

  // Regression guard for symptom 1 (ADR 0034): a panel that merely re-mounts
  // in the background — which happens to every panel of a workspace whose dock
  // becomes visible again — must not grab focus from the tab the user actually
  // left active. `stillWanted` is required precisely so a mount-time caller
  // can't silently omit it and grab unconditionally.
  it("never grabs on mount when the panel is not the active tab", () => {
    const focus = vi.fn();
    let isActive = false; // this panel re-mounted in the background
    retryFocus(
      focus,
      () => false, // never reports focused → would grab every frame if unguarded
      () => isActive,
    );

    flushFrame();
    flushFrame();
    expect(focus).not.toHaveBeenCalled();

    // …and it stays bailed even if the panel becomes active later: the loop
    // ended, so activation focus is the active tab's own concern, not a
    // stale mount-time retry's.
    isActive = true;
    flushFrame();
    expect(focus).not.toHaveBeenCalled();
  });

  it("never grabs when superseded before the first frame", () => {
    const focus = vi.fn();
    retryFocus(
      focus,
      () => false,
      () => false,
    );
    flushFrame();
    expect(focus).not.toHaveBeenCalled();
  });

  it("gives up after the frame cap so it never loops forever", () => {
    const focus = vi.fn();
    retryFocus(
      focus,
      () => false, // focus can never land (panel hidden, content disabled, …)
      () => true,
      3,
    );

    for (let i = 0; i < 10; i++) flushFrame();
    expect(focus).toHaveBeenCalledTimes(3);
    expect(queue).toHaveLength(0);
  });

  it("re-grabs after landing only when focus fell to nothing", () => {
    const focus = vi.fn();
    let focused = true; // landed on the first frame
    retryFocus(
      focus,
      () => focused,
      () => true,
    );

    flushFrame(); // landed → no grab
    expect(focus).not.toHaveBeenCalled();

    // dockview's show/hide shuffle bounced focus off the content onto nothing.
    focused = false;
    flushFrame();
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it("does not yank focus back from another real element after it landed", () => {
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();

    const focus = vi.fn();
    let focused = true;
    retryFocus(
      focus,
      () => focused,
      () => true,
    );

    flushFrame(); // landed
    focused = false; // the user moved on to `other` — not "lost to nothing"
    flushFrame();
    flushFrame();
    expect(focus).not.toHaveBeenCalled();
  });

  describe("open menus", () => {
    /** Focus a menu-like element and run one frame of a never-landing retry. */
    function grabsWhileFocusedIn(menu: HTMLElement): boolean {
      document.body.append(menu);
      menu.tabIndex = -1;
      menu.focus();
      const focus = vi.fn();
      retryFocus(
        focus,
        () => false,
        () => true,
      );
      flushFrame();
      return focus.mock.calls.length > 0;
    }

    // Right-clicking an *inactive* panel activates it, which starts the retry;
    // without this guard the per-frame `focus()` steals focus from the menu
    // that same click just opened and the menu flashes shut.
    it("stands down for a Silo menu (ctx.ui.showMenu)", () => {
      const menu = document.createElement("div");
      menu.setAttribute("data-silo-menu", "tree-1");
      menu.setAttribute("role", "menu");
      expect(grabsWhileFocusedIn(menu)).toBe(false);
    });

    it("stands down for a Monaco context menu", () => {
      const menu = document.createElement("div");
      menu.className = "context-view";
      expect(grabsWhileFocusedIn(menu)).toBe(false);
    });

    // Monaco renders its context menu into a shadow root, so from the light DOM
    // `document.activeElement` is only the host element — the menu nodes live
    // one level down, which is why a plain `closest` isn't enough.
    it("stands down for a menu inside a shadow root", () => {
      const host = document.createElement("div");
      document.body.append(host);
      const shadow = host.attachShadow({ mode: "open" });
      const menu = document.createElement("div");
      menu.className = "monaco-menu";
      shadow.append(menu);
      host.tabIndex = -1;
      host.focus();

      const focus = vi.fn();
      retryFocus(
        focus,
        () => false,
        () => true,
      );
      flushFrame();
      expect(focus).not.toHaveBeenCalled();
    });

    it("ends the loop rather than resuming once the menu closes", () => {
      const menu = document.createElement("div");
      menu.setAttribute("data-silo-menu", "tree-1");
      menu.tabIndex = -1;
      document.body.append(menu);
      menu.focus();

      const focus = vi.fn();
      retryFocus(
        focus,
        () => false,
        () => true,
      );
      flushFrame(); // bails
      expect(queue).toHaveLength(0);

      // Nothing rescheduled: the menu's owner restores content focus itself.
      menu.remove();
      flushFrame();
      expect(focus).not.toHaveBeenCalled();
    });

    it("still grabs when focus is merely on the body, not a menu", () => {
      const plain = document.createElement("div");
      expect(grabsWhileFocusedIn(plain)).toBe(true);
    });
  });
});
