import { describe, it, expect } from "vitest";
import { inputClass } from "./input-classes";

describe("inputClass", () => {
  it("defaults to silo-input", () => {
    expect(inputClass()).toBe("silo-input");
    expect(inputClass(false)).toBe("silo-input");
  });

  it("adds silo-input-block when block is true", () => {
    expect(inputClass(true)).toBe("silo-input silo-input-block");
  });
});
