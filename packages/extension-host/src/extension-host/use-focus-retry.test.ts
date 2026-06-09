import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { retryFocus } from "./use-focus-retry";

// Drive requestAnimationFrame by hand so the retry's frame loop is deterministic.
describe("retryFocus", () => {
  let queue: FrameRequestCallback[] = [];
  let origRaf: typeof globalThis.requestAnimationFrame;

  beforeEach(() => {
    queue = [];
    origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      queue.push(cb)) as typeof globalThis.requestAnimationFrame;
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
    retryFocus(focus, () => focused);

    flushFrame(); // not focused → grab
    flushFrame(); // still not focused → grab
    expect(focus).toHaveBeenCalledTimes(2);

    focused = true;
    flushFrame(); // landed → no further grab
    expect(focus).toHaveBeenCalledTimes(2);
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
});
