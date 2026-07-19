import { describe, it, expect } from "vitest";
import { tabDataActive } from "./tabs-classes";

describe("tabDataActive", () => {
  it("sets data-active=true when active", () => {
    expect(tabDataActive(true)).toBe("true");
  });

  it("omits the attribute when inactive", () => {
    expect(tabDataActive(false)).toBeUndefined();
  });
});
