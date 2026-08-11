import { describe, expect, it } from "vitest";
import {
  cursorTravelProgress,
  planScriptSeek,
  scriptDurationMs,
} from "@silo-code/website/demo";
import { clampTimelineRange, formatTimelineTime } from "./timeline-math";
import {
  navigatorDemoScript,
  worktreeToastRecordScript,
} from "@silo-code/website/demo";
import { timelineDurationMs, presetScript, VIGNETTE_PRESETS } from "./presets";

const ADD_SELECTOR = '[data-demo-target="worktree-toast-add"]';

describe("scriptDurationMs", () => {
  it("sums toast show + add-click step", () => {
    expect(scriptDurationMs(worktreeToastRecordScript)).toBe(
      4000 + 2000 + 2000 + 260,
    );
  });

  it("includes hold + release for click steps", () => {
    expect(
      scriptDurationMs([
        { afterMs: 1000, selector: ".a", holdMs: 500 },
        { afterMs: 2000, selector: ".b" },
      ]),
    ).toBe(1000 + 500 + 260 + 2000 + 880 + 260);
  });
});

describe("timelineDurationMs", () => {
  it("adds timelinePadAfterMs past the script", () => {
    const preset = VIGNETTE_PRESETS.find((p) => p.id === "worktree-toast");
    expect(preset).toBeDefined();
    expect(timelineDurationMs(preset!)).toBe(
      scriptDurationMs(worktreeToastRecordScript) + 10_000,
    );
  });

  it("matches script length plus pad when pad is set", () => {
    const preset = VIGNETTE_PRESETS.find((p) => p.id === "navigator");
    expect(preset).toBeDefined();
    expect(timelineDurationMs(preset!)).toBe(
      scriptDurationMs(presetScript(preset!)) +
        (preset!.timelinePadAfterMs ?? 0),
    );
  });
});

describe("clampTimelineRange", () => {
  it("keeps a valid window", () => {
    expect(clampTimelineRange({ startMs: 2000, endMs: 5000 }, 8800)).toEqual({
      startMs: 2000,
      endMs: 5000,
    });
  });

  it("enforces a minimum window", () => {
    const next = clampTimelineRange({ startMs: 4000, endMs: 4050 }, 8800);
    expect(next.endMs - next.startMs).toBeGreaterThanOrEqual(200);
  });
});

describe("formatTimelineTime", () => {
  it("formats short times in seconds", () => {
    expect(formatTimelineTime(2500)).toBe("2.5s");
  });
});

describe("cursorTravelProgress", () => {
  it("starts at 0 and finishes at 1 over the travel window", () => {
    expect(cursorTravelProgress(6000, 6000)).toBe(0);
    expect(cursorTravelProgress(6000, 7400)).toBe(1);
    expect(cursorTravelProgress(6000, 6700)).toBeGreaterThan(0.5);
    expect(cursorTravelProgress(6000, 6700)).toBeLessThan(1);
  });
});

describe("planScriptSeek", () => {
  it("keeps toast hidden before the show beat", () => {
    expect(planScriptSeek(worktreeToastRecordScript, 2000)).toEqual({
      nextIndex: 0,
      showWorktreeToast: false,
      revealTodosPanel: false,
      claudeTerminalOriginMs: null,
      codexTerminalOriginMs: null,
      clicks: [],
      cursor: null,
      delayMs: 2000,
    });
  });

  it("shows the toast while waiting for the cursor", () => {
    expect(planScriptSeek(worktreeToastRecordScript, 5000)).toEqual({
      nextIndex: 1,
      showWorktreeToast: true,
      revealTodosPanel: false,
      claudeTerminalOriginMs: null,
      codexTerminalOriginMs: null,
      clicks: [],
      cursor: null,
      delayMs: 1000,
    });
  });

  it("glides the cursor in from the top before the click", () => {
    const plan = planScriptSeek(worktreeToastRecordScript, 6500);
    expect(plan.nextIndex).toBe(1);
    expect(plan.showWorktreeToast).toBe(true);
    expect(plan.clicks).toEqual([]);
    expect(plan.cursor?.selector).toBe(ADD_SELECTOR);
    expect(plan.cursor?.fromSelector).toBeNull();
    expect(plan.cursor?.clicking).toBe(false);
    expect(plan.cursor?.travelProgress).toBeGreaterThan(0.5);
    expect(plan.cursor?.travelProgress).toBeLessThan(1);
    expect(plan.delayMs).toBe(1500);
  });

  it("hovers on the button after the glide", () => {
    expect(planScriptSeek(worktreeToastRecordScript, 7500)).toEqual({
      nextIndex: 1,
      showWorktreeToast: true,
      revealTodosPanel: false,
      claudeTerminalOriginMs: null,
      codexTerminalOriginMs: null,
      clicks: [],
      cursor: {
        selector: ADD_SELECTOR,
        fromSelector: null,
        clicking: false,
        travelProgress: 1,
      },
      delayMs: 500,
    });
  });

  it("clicks Add at the eight-second mark", () => {
    const plan = planScriptSeek(worktreeToastRecordScript, 8000);
    expect(plan.showWorktreeToast).toBe(false);
    expect(plan.revealTodosPanel).toBe(false);
    expect(plan.claudeTerminalOriginMs).toBeNull();
    expect(plan.codexTerminalOriginMs).toBeNull();
    expect(plan.clicks).toEqual([ADD_SELECTOR]);
    expect(plan.cursor).toEqual({
      selector: ADD_SELECTOR,
      fromSelector: null,
      clicking: true,
      travelProgress: 1,
    });
  });

  it("glides between workspace rows after the first click", () => {
    // After website click (~2.56s), mid-glide toward docs.
    const plan = planScriptSeek(navigatorDemoScript, 3400);
    expect(plan.cursor?.selector).toContain("workspace:docs");
    expect(plan.cursor?.fromSelector).toContain("workspace:website");
    expect(plan.cursor?.clicking).toBe(false);
    expect(plan.cursor?.travelProgress ?? 0).toBeGreaterThan(0);
    expect(plan.cursor?.travelProgress ?? 1).toBeLessThan(1);
  });
});
