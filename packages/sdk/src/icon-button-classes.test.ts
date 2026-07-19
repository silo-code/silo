import { describe, it, expect } from "vitest";
import { iconButtonClass } from "./icon-button-classes";

describe("iconButtonClass", () => {
  it("defaults to silo-icon-button", () => {
    expect(iconButtonClass()).toBe("silo-icon-button");
    expect(iconButtonClass("normal")).toBe("silo-icon-button");
  });

  it("adds the sm modifier", () => {
    expect(iconButtonClass("sm")).toBe("silo-icon-button silo-icon-button-sm");
  });
});
