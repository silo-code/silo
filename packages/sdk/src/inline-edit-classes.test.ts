import { describe, it, expect } from "vitest";
import {
  inlineEditDisplayClass,
  inlineEditRowClass,
} from "./inline-edit-classes";

describe("inlineEditDisplayClass", () => {
  it("is silo-inline-edit-display by default", () => {
    expect(inlineEditDisplayClass(false)).toBe("silo-inline-edit-display");
  });

  it("adds multiline", () => {
    expect(inlineEditDisplayClass(true)).toBe(
      "silo-inline-edit-display multiline",
    );
  });
});

describe("inlineEditRowClass", () => {
  it("is silo-inline-edit-row by default", () => {
    expect(inlineEditRowClass(false)).toBe("silo-inline-edit-row");
  });

  it("adds multiline", () => {
    expect(inlineEditRowClass(true)).toBe("silo-inline-edit-row multiline");
  });
});
