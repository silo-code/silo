import { describe, expect, it } from "vitest";

import {
  HEAD_REVEAL_MARGIN_PX,
  TRANSCRIPT_IDLE_DROP_MS,
  planIdleDrop,
  revealScrollAdjustment,
  shouldRevealHead,
  spacerHeightPx,
  transcriptWindow,
} from "./transcript-mount";

const base = {
  onScreen: true,
  idleDropped: false,
  headRevealed: true,
  turnCount: 40,
  spacerPx: 5_000,
};

describe("transcriptWindow", () => {
  it("renders everything for a freshly opened panel", () => {
    expect(transcriptWindow(base)).toEqual({ kind: "all" });
  });

  it("drops every row once an off-screen panel passes the grace period", () => {
    expect(
      transcriptWindow({ ...base, onScreen: false, idleDropped: true }),
    ).toEqual({ kind: "dropped" });
  });

  it("keeps rendering off screen until the grace period elapses", () => {
    expect(transcriptWindow({ ...base, onScreen: false })).toEqual({
      kind: "all",
    });
  });

  // The flash regression: returning to a panel whose idle timer already fired
  // must render in the *same* pass that makes it visible. Deciding this from
  // state updated in an effect paints one empty frame first.
  it("renders immediately on returning to a dropped panel", () => {
    expect(
      transcriptWindow({
        ...base,
        idleDropped: true,
        headRevealed: false,
        onScreen: true,
      }),
    ).toEqual({ kind: "tail", from: 36, spacerPx: 5_000 });
  });

  it("returns to the tail with a spacer when the head is not revealed", () => {
    expect(
      transcriptWindow({ ...base, headRevealed: false, tailTurns: 4 }),
    ).toEqual({ kind: "tail", from: 36, spacerPx: 5_000 });
  });

  it("renders everything when the transcript is shorter than the tail", () => {
    expect(
      transcriptWindow({ ...base, headRevealed: false, turnCount: 3 }),
    ).toEqual({ kind: "all" });
  });

  it("renders everything when the transcript is exactly the tail length", () => {
    expect(
      transcriptWindow({ ...base, headRevealed: false, turnCount: 4 }),
    ).toEqual({ kind: "all" });
  });

  // A wrong spacer height moves the user's scroll position, which is worse
  // than a slow switch — so an unmeasured or implausible height falls back to
  // rendering everything rather than guessing.
  it("falls back to everything when the spacer height was never measured", () => {
    expect(
      transcriptWindow({ ...base, headRevealed: false, spacerPx: null }),
    ).toEqual({ kind: "all" });
  });

  it("falls back to everything when the measurement came back zero", () => {
    expect(
      transcriptWindow({ ...base, headRevealed: false, spacerPx: 0 }),
    ).toEqual({ kind: "all" });
  });

  it("honours a custom tail length", () => {
    expect(
      transcriptWindow({ ...base, headRevealed: false, tailTurns: 10 }),
    ).toEqual({ kind: "tail", from: 30, spacerPx: 5_000 });
  });
});

describe("planIdleDrop", () => {
  it("cancels any pending drop while on screen", () => {
    expect(planIdleDrop({ onScreen: true })).toEqual({ kind: "cancel" });
  });

  it("schedules a drop at the default delay when off screen", () => {
    expect(planIdleDrop({ onScreen: false })).toEqual({
      kind: "schedule",
      delayMs: TRANSCRIPT_IDLE_DROP_MS,
    });
  });

  it("honours an explicit delay", () => {
    expect(planIdleDrop({ onScreen: false, idleMs: 1_000 })).toEqual({
      kind: "schedule",
      delayMs: 1_000,
    });
  });
});

describe("spacerHeightPx", () => {
  // The spacer is itself a flex item in a gap-separated column, so it earns one
  // gap of its own. Subtracting one gap is what keeps total height — and so
  // `scrollTop` — unchanged across the swap.
  it("subtracts one row gap from the measured span", () => {
    expect(spacerHeightPx({ headSpanPx: 5_040, rowGapPx: 40 })).toBe(5_000);
  });

  it("never goes negative", () => {
    expect(spacerHeightPx({ headSpanPx: 10, rowGapPx: 40 })).toBe(0);
  });

  it("rounds to whole pixels", () => {
    expect(spacerHeightPx({ headSpanPx: 100.6, rowGapPx: 0 })).toBe(101);
  });
});

describe("shouldRevealHead", () => {
  const spacerPx = 68_678;

  it("reveals when the restored position lands inside the spacer", () => {
    expect(shouldRevealHead({ scrollTop: 47_768, spacerPx })).toBe(true);
  });

  it("reveals at the very top", () => {
    expect(shouldRevealHead({ scrollTop: 0, spacerPx })).toBe(true);
  });

  // Pinned to the bottom of a long transcript is the common case, and the one
  // the tail window exists to make instant — it must not drag the head back in.
  it("does not reveal when parked at the bottom, below the spacer", () => {
    expect(shouldRevealHead({ scrollTop: 78_885, spacerPx })).toBe(false);
  });

  it("reveals one margin before the spacer comes into view", () => {
    expect(
      shouldRevealHead({
        scrollTop: spacerPx + HEAD_REVEAL_MARGIN_PX,
        spacerPx,
      }),
    ).toBe(true);
    expect(
      shouldRevealHead({
        scrollTop: spacerPx + HEAD_REVEAL_MARGIN_PX + 1,
        spacerPx,
      }),
    ).toBe(false);
  });

  it("honours a custom margin", () => {
    expect(
      shouldRevealHead({
        scrollTop: spacerPx + 900,
        spacerPx,
        marginPx: 1_000,
      }),
    ).toBe(true);
  });
});

describe("revealScrollAdjustment", () => {
  it("nudges down when the real head is taller than the spacer", () => {
    expect(
      revealScrollAdjustment({
        scrollHeightBefore: 10_000,
        scrollHeightAfter: 10_120,
      }),
    ).toBe(120);
  });

  it("nudges up when the real head is shorter", () => {
    expect(
      revealScrollAdjustment({
        scrollHeightBefore: 10_000,
        scrollHeightAfter: 9_900,
      }),
    ).toBe(-100);
  });

  it("is a no-op when the spacer was exact", () => {
    expect(
      revealScrollAdjustment({
        scrollHeightBefore: 10_000,
        scrollHeightAfter: 10_000,
      }),
    ).toBe(0);
  });
});
