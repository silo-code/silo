import { describe, expect, it } from "vitest";
import {
  AUTOSCROLL_THRESHOLD_PX,
  applyRestoreStep,
  isClampedScroll,
  isPinnedScrollTop,
  isPinnedToBottom,
  isValidScrollTop,
  maxScrollTop,
  persistedScroll,
  restoreTargetFor,
  SCROLL_RESTORE_SETTLE_MS,
  SCROLL_RESTORE_TIMEOUT_MS,
  scrollToBottom,
  shouldAbandonRestore,
  transcriptScrollKey,
  type ScrollTarget,
} from "./scroll";

/** A scroller stub that clamps `scrollTop` the way a real one does. */
function scroller(scrollHeight: number, clientHeight: number): HTMLElement {
  let top = 0;
  return {
    scrollHeight,
    clientHeight,
    get scrollTop() {
      return top;
    },
    set scrollTop(next: number) {
      top = Math.max(0, Math.min(next, scrollHeight - clientHeight));
    },
  } as HTMLElement;
}

describe("transcriptScrollKey", () => {
  it("prefers the live session id", () => {
    expect(transcriptScrollKey("claude-chat", "s-1")).toBe("session:s-1");
  });

  it("falls back to the profile while no session exists", () => {
    expect(transcriptScrollKey("claude-chat", null)).toBe(
      "profile:claude-chat:new",
    );
  });

  it("has a bucket for a panel with neither", () => {
    expect(transcriptScrollKey(undefined, null)).toBe("anon");
  });
});

describe("isValidScrollTop", () => {
  it("accepts non-negative finite numbers", () => {
    expect(isValidScrollTop(0)).toBe(true);
    expect(isValidScrollTop(42.5)).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isValidScrollTop(-1)).toBe(false);
    expect(isValidScrollTop(NaN)).toBe(false);
    expect(isValidScrollTop("0")).toBe(false);
  });
});

describe("persistedScroll", () => {
  it("returns the params position when they describe the live bucket", () => {
    expect(
      persistedScroll("claude-chat", "s-1", 120, false, "session:s-1"),
    ).toEqual({ top: 120, pinned: false });
  });

  it("carries the pinned flag through", () => {
    expect(
      persistedScroll("claude-chat", "s-1", 900, true, "session:s-1"),
    ).toEqual({ top: 900, pinned: true });
  });

  it("treats a missing pinned flag as not pinned", () => {
    expect(
      persistedScroll("claude-chat", "s-1", 120, undefined, "session:s-1"),
    ).toEqual({ top: 120, pinned: false });
  });

  it("ignores a position saved against a different session or profile", () => {
    expect(
      persistedScroll("claude-chat", "s-1", 120, false, "session:s-2"),
    ).toBeUndefined();
    expect(
      persistedScroll(
        "codex-chat",
        null,
        120,
        false,
        "profile:claude-chat:new",
      ),
    ).toBeUndefined();
  });

  it("ignores a corrupt offset", () => {
    expect(
      persistedScroll("claude-chat", "s-1", "120", false, "session:s-1"),
    ).toBeUndefined();
  });
});

describe("restoreTargetFor", () => {
  it("follows the stream when nothing was remembered", () => {
    expect(restoreTargetFor(undefined)).toEqual({ kind: "bottom" });
  });

  it("follows the stream when the user was at the bottom", () => {
    expect(restoreTargetFor({ top: 900, pinned: true })).toEqual({
      kind: "bottom",
    });
  });

  it("re-applies the exact offset when the user had scrolled up", () => {
    expect(restoreTargetFor({ top: 240, pinned: false })).toEqual({
      kind: "offset",
      top: 240,
    });
  });
});

describe("maxScrollTop", () => {
  it("is the overflow the scroller can hold", () => {
    expect(maxScrollTop(scroller(1000, 400))).toBe(600);
  });

  it("is zero for content that fits", () => {
    expect(maxScrollTop(scroller(200, 400))).toBe(0);
  });
});

describe("applyRestoreStep", () => {
  it("is satisfied by one pass for a bottom target", () => {
    const el = scroller(1000, 100);
    expect(applyRestoreStep(el, { kind: "bottom" })).toBe(true);
    expect(el.scrollTop).toBe(900);
  });

  it("applies a reachable offset and reports it satisfied", () => {
    const el = scroller(1000, 100);
    expect(applyRestoreStep(el, { kind: "offset", top: 240 })).toBe(true);
    expect(el.scrollTop).toBe(240);
  });

  it("reports an offset unsatisfied while the content is still too short", () => {
    // The transcript has only painted its first entries — the assignment
    // clamps, so the caller must try again on the next paint.
    const short = scroller(300, 100);
    expect(applyRestoreStep(short, { kind: "offset", top: 240 })).toBe(false);
    expect(short.scrollTop).toBe(200);
  });

  it("keeps retrying until the content is tall enough", () => {
    const target: ScrollTarget = { kind: "offset", top: 240 };
    expect(applyRestoreStep(scroller(300, 100), target)).toBe(false);
    expect(applyRestoreStep(scroller(600, 100), target)).toBe(true);
  });

  it("treats a corrupt target as already satisfied", () => {
    const el = scroller(1000, 100);
    expect(applyRestoreStep(el, { kind: "offset", top: Number.NaN })).toBe(
      true,
    );
    expect(el.scrollTop).toBe(0);
  });
});

describe("shouldAbandonRestore", () => {
  const armed = 1_000;

  it("keeps retrying while the transcript is still changing", () => {
    expect(shouldAbandonRestore(armed + 400, armed, armed + 300, true)).toBe(
      false,
    );
  });

  it("gives up once a painted transcript has been quiet for the settle window", () => {
    expect(
      shouldAbandonRestore(
        armed + SCROLL_RESTORE_SETTLE_MS,
        armed,
        armed,
        true,
      ),
    ).toBe(true);
  });

  it("ignores the quiet window while nothing has painted yet", () => {
    // An empty transcript is still loading — its silence says nothing about
    // whether the saved offset will end up reachable.
    expect(
      shouldAbandonRestore(
        armed + SCROLL_RESTORE_SETTLE_MS * 2,
        armed,
        armed,
        false,
      ),
    ).toBe(false);
  });

  it("still gives up on the hard ceiling when nothing ever paints", () => {
    expect(
      shouldAbandonRestore(
        armed + SCROLL_RESTORE_TIMEOUT_MS,
        armed,
        armed + SCROLL_RESTORE_TIMEOUT_MS,
        false,
      ),
    ).toBe(true);
  });
});

describe("isClampedScroll", () => {
  it("is false with nothing observed yet", () => {
    expect(isClampedScroll(scroller(1000, 100), undefined)).toBe(false);
  });

  it("is false while the scroller can still hold the last offset", () => {
    const el = scroller(1000, 100);
    el.scrollTop = 0;
    expect(isClampedScroll(el, 240)).toBe(false);
  });

  it("catches a re-paint that shortened the content", () => {
    // Every node was replaced, the content is briefly 200px of overflow, and
    // the browser pinned scrollTop there — not a user jumping to the top.
    const el = scroller(300, 100);
    expect(el.scrollTop).toBe(0);
    el.scrollTop = 240;
    expect(el.scrollTop).toBe(200);
    expect(isClampedScroll(el, 240)).toBe(true);
  });

  it("is false when the user scrolled up inside the shortened content", () => {
    const el = scroller(300, 100);
    el.scrollTop = 50;
    expect(isClampedScroll(el, 240)).toBe(false);
  });
});

describe("scrollToBottom", () => {
  it("parks the scroller at its maximum offset", () => {
    const el = scroller(1000, 250);
    scrollToBottom(el);
    expect(el.scrollTop).toBe(750);
    expect(isPinnedToBottom(el)).toBe(true);
  });
});

describe("isPinnedScrollTop", () => {
  it("matches isPinnedToBottom for the live scroll position", () => {
    const el = scroller(1000, 100);
    el.scrollTop = 500;
    expect(isPinnedScrollTop(el, el.scrollTop)).toBe(isPinnedToBottom(el));
  });
});

describe("isPinnedToBottom", () => {
  it("is true within the autoscroll threshold", () => {
    const el = scroller(1000, 100);
    el.scrollTop = 1000 - 100 - (AUTOSCROLL_THRESHOLD_PX - 1);
    expect(isPinnedToBottom(el)).toBe(true);
  });

  it("is false when scrolled up", () => {
    const el = scroller(1000, 100);
    el.scrollTop = 100;
    expect(isPinnedToBottom(el)).toBe(false);
  });
});
