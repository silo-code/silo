import { describe, it, expect } from "vitest";
import { badgeClass } from "./badge-classes";

describe("badgeClass", () => {
  it("defaults to neutral", () => {
    expect(badgeClass()).toBe("silo-badge silo-badge-neutral");
  });

  it("maps every tone to silo-badge-{tone}", () => {
    expect(badgeClass("accent")).toBe("silo-badge silo-badge-accent");
    expect(badgeClass("ok")).toBe("silo-badge silo-badge-ok");
    expect(badgeClass("warn")).toBe("silo-badge silo-badge-warn");
    expect(badgeClass("err")).toBe("silo-badge silo-badge-err");
    expect(badgeClass("outline")).toBe("silo-badge silo-badge-outline");
  });

  it("uses silo-badge-custom when color is set (overrides tone)", () => {
    expect(badgeClass("ok", "#e06c75")).toBe("silo-badge silo-badge-custom");
  });

  it("adds no size class for the default md", () => {
    expect(badgeClass("neutral", undefined, "md")).toBe(
      "silo-badge silo-badge-neutral",
    );
  });

  it("appends the sm size class after the tone", () => {
    expect(badgeClass("neutral", undefined, "sm")).toBe(
      "silo-badge silo-badge-neutral silo-badge-sm",
    );
    expect(badgeClass("ok", undefined, "sm")).toBe(
      "silo-badge silo-badge-ok silo-badge-sm",
    );
  });

  it("combines a custom color with sm", () => {
    expect(badgeClass("ok", "#e06c75", "sm")).toBe(
      "silo-badge silo-badge-custom silo-badge-sm",
    );
  });
});
