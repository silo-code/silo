import { describe, it, expect } from "vitest";
import { permissionButtonVariant } from "./permission-options";

describe("permissionButtonVariant", () => {
  it("gives every allow the accent", () => {
    expect(permissionButtonVariant("allow_once")).toBe("primary");
    expect(permissionButtonVariant("allow_always")).toBe("primary");
  });

  it("leaves a reject neutral — declining is the safe answer, not a danger", () => {
    expect(permissionButtonVariant("reject_once")).toBe("normal");
    expect(permissionButtonVariant("reject_always")).toBe("normal");
  });

  it("treats a vendor kind, or none at all, as neutral", () => {
    expect(permissionButtonVariant("something_else")).toBe("normal");
    expect(permissionButtonVariant("")).toBe("normal");
  });
});
