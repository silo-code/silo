import { describe, expect, it } from "vitest";
import { isWorktreeCreateResult } from "./WorktreeCreateDialog";

describe("isWorktreeCreateResult", () => {
  it("accepts a new-branch create result", () => {
    expect(
      isWorktreeCreateResult({
        path: "/tmp/repo-feat",
        branch: { create: "feat" },
      }),
    ).toBe(true);
  });

  it("accepts an existing-branch create result", () => {
    expect(
      isWorktreeCreateResult({
        path: "/tmp/repo-main",
        branch: { existing: "main" },
      }),
    ).toBe(true);
  });

  it("rejects cancel / undefined / null", () => {
    expect(isWorktreeCreateResult(undefined)).toBe(false);
    expect(isWorktreeCreateResult(null)).toBe(false);
  });

  it("rejects a truthy dismiss event (no path/branch)", () => {
    // ModalHost used to forward the React click/mousedown event as the settle
    // value when the X or backdrop closed a dismissible showModal.
    expect(isWorktreeCreateResult({ type: "click", target: {} })).toBe(false);
  });

  it("rejects objects missing a usable branch", () => {
    expect(isWorktreeCreateResult({ path: "/tmp/x" })).toBe(false);
    expect(isWorktreeCreateResult({ path: "/tmp/x", branch: {} })).toBe(false);
    expect(
      isWorktreeCreateResult({ path: "/tmp/x", branch: { existing: 1 } }),
    ).toBe(false);
  });

  it("rejects an empty path", () => {
    expect(
      isWorktreeCreateResult({ path: "", branch: { create: "feat" } }),
    ).toBe(false);
  });
});
