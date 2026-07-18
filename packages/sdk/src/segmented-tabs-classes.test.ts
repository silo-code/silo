import { describe, it, expect } from "vitest";
import { segmentedTabDataActive } from "./segmented-tabs-classes";

describe("segmentedTabDataActive", () => {
  it("sets data-active=true when active", () => {
    expect(segmentedTabDataActive(true)).toBe("true");
  });

  it("omits the attribute when inactive", () => {
    expect(segmentedTabDataActive(false)).toBeUndefined();
  });
});
