import { describe, it, expect } from "vitest";
import { findTerminalOwnerId } from "./terminal-lifecycle";

describe("findTerminalOwnerId", () => {
  const workspaces = [
    {
      id: "ws_a",
      terminals: [{ id: "term_a" }, { id: "term_b" }],
    },
    {
      id: "ws_c",
      terminals: [{ id: "term_c" }],
    },
  ];

  it("finds a terminal on the active workspace", () => {
    expect(findTerminalOwnerId(workspaces, "term_a")).toBe("ws_a");
  });

  it("finds a terminal on a non-active (e.g. soft-closed) workspace", () => {
    // Regression: unmount used to look up only store.activeWorkspaceId, so
    // closing the last open workspace (activeId → null) falsely treated every
    // still-persisted terminal as deleted and killed its PTY.
    expect(findTerminalOwnerId(workspaces, "term_c")).toBe("ws_c");
  });

  it("returns null when the record was removed (tab close / hard delete)", () => {
    expect(findTerminalOwnerId(workspaces, "term_gone")).toBeNull();
  });

  it("returns null for an empty workspace map (empty-state unmount)", () => {
    expect(findTerminalOwnerId([], "term_a")).toBeNull();
  });

  it("skips null/undefined workspace entries", () => {
    expect(
      findTerminalOwnerId([null, undefined, workspaces[0]], "term_b"),
    ).toBe("ws_a");
    expect(findTerminalOwnerId([null, undefined], "term_b")).toBeNull();
  });
});
