import { describe, expect, it } from "vitest";
import { activityClass, activityFromAgent } from "./activity";

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
