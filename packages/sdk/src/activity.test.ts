import { describe, expect, it } from "vitest";
import {
  activityClass,
  activityFromAgent,
  activityJitterStyle,
} from "./activity";

describe("activityClass", () => {
  it("maps kinds and sizes", () => {
    expect(activityClass("working", "md")).toBe(
      "silo-activity silo-activity-working silo-activity-md",
    );
    expect(activityClass("ready")).toBe(
      "silo-activity silo-activity-ready silo-activity-sm",
    );
    expect(activityClass("warn", "sm")).toBe(
      "silo-activity silo-activity-warn silo-activity-sm",
    );
    expect(activityClass("error")).toBe(
      "silo-activity silo-activity-error silo-activity-sm",
    );
  });

  it("uses none fallback when activity is omitted", () => {
    expect(activityClass(undefined)).toBe(
      "silo-activity silo-activity-none silo-activity-sm",
    );
  });
});

describe("activityFromAgent", () => {
  it("maps overlapping agent states", () => {
    expect(activityFromAgent("working")).toBe("working");
    expect(activityFromAgent("idle")).toBe("ready");
    expect(activityFromAgent("error")).toBe("error");
    expect(activityFromAgent("none")).toBeNull();
    expect(activityFromAgent("dead")).toBeNull();
  });
});

describe("activityJitterStyle", () => {
  const delay = (key: string) =>
    Number.parseFloat(activityJitterStyle(key)["--silo-activity-jitter"]);

  it("is deterministic for a given key", () => {
    expect(activityJitterStyle("term-42")).toEqual(
      activityJitterStyle("term-42"),
    );
  });

  it("spreads different keys across the cycle", () => {
    const keys = ["a", "b", "c", "d", "e", "term-1", "ws:build", "term-2"];
    const delays = keys.map(delay);
    // Not all landing on the same offset (the lockstep bug).
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it("emits a negative delay within one animation period", () => {
    for (const key of ["", "x", "a-very-long-stable-row-identifier", "ws:1"]) {
      const d = delay(key);
      expect(d).toBeLessThanOrEqual(0);
      expect(d).toBeGreaterThan(-1.8);
      expect(activityJitterStyle(key)["--silo-activity-jitter"]).toMatch(
        /^-?\d+\.\d{3}s$/,
      );
    }
  });
});
