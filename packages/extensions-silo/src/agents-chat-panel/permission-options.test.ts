import { describe, it, expect } from "vitest";
import {
  agentHasBypassMode,
  autoAcceptOptionId,
  permissionButtonVariant,
} from "./permission-options";

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

describe("autoAcceptOptionId", () => {
  it("prefers allow_once over allow_always", () => {
    expect(
      autoAcceptOptionId([
        { optionId: "a", kind: "allow_always" },
        { optionId: "o", kind: "allow_once" },
        { optionId: "r", kind: "reject_once" },
      ]),
    ).toBe("o");
  });

  it("falls back to allow_always when that's all there is", () => {
    expect(
      autoAcceptOptionId([
        { optionId: "a", kind: "allow_always" },
        { optionId: "r", kind: "reject_once" },
      ]),
    ).toBe("a");
  });

  it("is undefined with no allow option at all", () => {
    expect(
      autoAcceptOptionId([{ optionId: "r", kind: "reject_once" }]),
    ).toBeUndefined();
  });

  it("is undefined for a genuine chooser — two distinct options sharing an allow kind", () => {
    expect(
      autoAcceptOptionId([
        { optionId: "sandbox", kind: "allow_once" },
        { optionId: "full", kind: "allow_once" },
      ]),
    ).toBeUndefined();
  });
});

describe("agentHasBypassMode", () => {
  it("finds Claude's bypassPermissions choice, case-insensitively", () => {
    expect(
      agentHasBypassMode([
        {
          options: [
            { value: "default" },
            { value: "acceptEdits" },
            { value: "bypassPermissions" },
          ],
        },
      ]),
    ).toBe(true);
  });

  it("is false for Cursor's agent/plan/ask, which has no bypass choice", () => {
    expect(
      agentHasBypassMode([
        { options: [{ value: "agent" }, { value: "plan" }, { value: "ask" }] },
      ]),
    ).toBe(false);
  });

  it("is false with no config options at all", () => {
    expect(agentHasBypassMode([])).toBe(false);
  });
});
