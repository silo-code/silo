import { describe, expect, it } from "vitest";
import {
  correlateAroundFreeze,
  DEFAULT_FREEZE_THRESHOLD_MS,
  formatFreezeLog,
  probeEnabledFromStorage,
  summarizeCorrelation,
  tickFreezeProbe,
} from "./ui-freeze-probe-model";

describe("tickFreezeProbe", () => {
  const base = {
    startedAtMs: 1000,
    hidden: false,
    thresholdMs: DEFAULT_FREEZE_THRESHOLD_MS,
    warmupMs: 2000,
  };

  it("seeds the first frame without a freeze", () => {
    expect(
      tickFreezeProbe({ ...base, prevFrameMs: null, nowMs: 1500 }),
    ).toEqual({ kind: "ok", gapMs: 0, nextPrev: 1500 });
  });

  it("skips while document is hidden and clears prev", () => {
    expect(
      tickFreezeProbe({
        ...base,
        prevFrameMs: 1500,
        nowMs: 5000,
        hidden: true,
      }),
    ).toEqual({ kind: "skip", nextPrev: null });
  });

  it("does not report freezes during warmup even on a large gap", () => {
    expect(
      tickFreezeProbe({
        ...base,
        prevFrameMs: 1100,
        nowMs: 2500, // 1500ms gap, but only 1500ms since start (< 2000 warmup)
      }),
    ).toEqual({ kind: "ok", gapMs: 1400, nextPrev: 2500 });
  });

  it("reports a freeze when the gap crosses the threshold after warmup", () => {
    expect(
      tickFreezeProbe({
        ...base,
        prevFrameMs: 4000,
        nowMs: 4500, // startedAt 1000 → 3500ms elapsed > warmup
      }),
    ).toEqual({ kind: "freeze", gapMs: 500, nextPrev: 4500 });
  });

  it("returns ok for normal frame gaps", () => {
    expect(
      tickFreezeProbe({
        ...base,
        prevFrameMs: 5000,
        nowMs: 5016,
      }),
    ).toEqual({ kind: "ok", gapMs: 16, nextPrev: 5016 });
  });
});

describe("formatFreezeLog", () => {
  it("includes rounded duration and local wall-clock time", () => {
    const at = new Date(2026, 7, 21, 14, 9, 3, 42); // month is 0-based
    expect(formatFreezeLog(1032.4, at)).toBe(
      "UI freeze 1032ms at 14:09:03.042 (rAF stalled)",
    );
  });
});

describe("correlateAroundFreeze", () => {
  const entries = [
    {
      timestampMs: 1000,
      channel: "ext:silo.github-prs",
      message: "Fetching open PRs",
    },
    {
      timestampMs: 1500,
      channel: "ext:silo.git",
      message: "> git status",
    },
    {
      timestampMs: 1800,
      channel: "silo:ui-freeze",
      message: "UI freeze 400ms",
    },
    {
      timestampMs: 5000,
      channel: "ext:silo.github-prs",
      message: "too late",
    },
  ];

  it("keeps entries from stall onset−lookback through freeze end", () => {
    // freeze ends at 2000, gap 400 → onset 1600; lookback 500 → start 1100
    const hit = correlateAroundFreeze(entries, 2000, 400, 500);
    expect(hit.map((e) => e.message)).toEqual(["> git status"]);
  });

  it("summarizes by channel count", () => {
    expect(
      summarizeCorrelation([
        { timestampMs: 1, channel: "a", message: "1" },
        { timestampMs: 2, channel: "b", message: "2" },
        { timestampMs: 3, channel: "a", message: "3" },
      ]),
    ).toBe("3 nearby: a×2, b×1");
    expect(summarizeCorrelation([])).toBe("no nearby Output activity");
  });
});

describe("probeEnabledFromStorage", () => {
  it("defaults on in Dev unless explicitly disabled", () => {
    expect(probeEnabledFromStorage(null, true)).toBe(true);
    expect(probeEnabledFromStorage("1", true)).toBe(true);
    expect(probeEnabledFromStorage("0", true)).toBe(false);
  });

  it("defaults off in release unless explicitly enabled", () => {
    expect(probeEnabledFromStorage(null, false)).toBe(false);
    expect(probeEnabledFromStorage("0", false)).toBe(false);
    expect(probeEnabledFromStorage("1", false)).toBe(true);
  });
});
