import { describe, it, expect } from "vitest";
import { searchInputClass } from "./search-input-classes";

describe("searchInputClass", () => {
  it("is silo-search-input when empty", () => {
    expect(searchInputClass(false)).toBe("silo-search-input");
  });

  it("adds has-value when there is a value", () => {
    expect(searchInputClass(true)).toBe("silo-search-input has-value");
  });
});
