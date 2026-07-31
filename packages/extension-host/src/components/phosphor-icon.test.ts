import { describe, expect, it } from "vitest";
import { resolvePhosphorIcon } from "./phosphor-icon";

describe("resolvePhosphorIcon", () => {
  it("resolves known Phosphor export names", () => {
    expect(resolvePhosphorIcon("Flag")).toBeTruthy();
    expect(resolvePhosphorIcon("ArrowClockwise")).toBeTruthy();
    expect(resolvePhosphorIcon("PushPin")).toBeTruthy();
  });

  it("rejects unknown names and non-icon barrel exports", () => {
    expect(resolvePhosphorIcon("NotARealIcon")).toBeNull();
    expect(resolvePhosphorIcon("IconContext")).toBeNull();
    expect(resolvePhosphorIcon("")).toBeNull();
  });
});
