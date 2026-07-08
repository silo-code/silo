import { describe, expect, it } from "vitest";
import { isValidScrollTop, scrollStorageKey } from "./scroll";

describe("scrollStorageKey", () => {
  it("namespaces the key by editor id", () => {
    expect(scrollStorageKey("editor-1")).toBe("scrollTop:editor-1");
  });

  it("keeps distinct editor ids distinct", () => {
    expect(scrollStorageKey("a")).not.toBe(scrollStorageKey("b"));
  });
});

describe("isValidScrollTop", () => {
  it("accepts zero and positive finite numbers", () => {
    expect(isValidScrollTop(0)).toBe(true);
    expect(isValidScrollTop(120.5)).toBe(true);
  });

  it("rejects negative numbers", () => {
    expect(isValidScrollTop(-1)).toBe(false);
  });

  it("rejects non-finite numbers", () => {
    expect(isValidScrollTop(Number.NaN)).toBe(false);
    expect(isValidScrollTop(Infinity)).toBe(false);
  });

  it("rejects undefined and non-number values", () => {
    expect(isValidScrollTop(undefined)).toBe(false);
    expect(isValidScrollTop("120")).toBe(false);
    expect(isValidScrollTop(null)).toBe(false);
  });
});
