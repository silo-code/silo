import { describe, expect, it } from "vitest";

import {
  TRANSCRIPT_IDLE_DROP_MS,
  planIdleDrop,
  transcriptRowsMounted,
} from "./transcript-mount";

describe("transcriptRowsMounted", () => {
  it("renders rows while the panel is on screen", () => {
    expect(transcriptRowsMounted({ onScreen: true, idleDropped: false })).toBe(
      true,
    );
  });

  it("keeps rows off screen until the grace period has elapsed", () => {
    expect(transcriptRowsMounted({ onScreen: false, idleDropped: false })).toBe(
      true,
    );
  });

  it("drops rows once the panel has been off screen past the grace period", () => {
    expect(transcriptRowsMounted({ onScreen: false, idleDropped: true })).toBe(
      false,
    );
  });

  // The regression this derivation exists for. Returning to a panel whose idle
  // timer already fired must render rows in the *same* pass that makes it
  // visible — deciding this from state updated in an effect paints one empty
  // frame first, which reads as a flash of the transcript disappearing and
  // coming back on every workspace switch.
  it("re-renders rows immediately on returning to a dropped panel", () => {
    expect(transcriptRowsMounted({ onScreen: true, idleDropped: true })).toBe(
      true,
    );
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

  it("cancels on screen even when an explicit delay is given", () => {
    expect(planIdleDrop({ onScreen: true, idleMs: 1_000 })).toEqual({
      kind: "cancel",
    });
  });
});
