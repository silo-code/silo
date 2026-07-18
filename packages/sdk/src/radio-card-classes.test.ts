import { describe, it, expect } from "vitest";
import { radioCardDataSelected } from "./radio-card-classes";

describe("radioCardDataSelected", () => {
  it("sets data-selected=true when selected", () => {
    expect(radioCardDataSelected(true)).toBe("true");
  });

  it("omits the attribute when not selected", () => {
    expect(radioCardDataSelected(false)).toBeUndefined();
  });
});
