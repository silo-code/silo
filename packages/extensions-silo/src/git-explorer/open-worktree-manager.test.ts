import { describe, it, expect } from "vitest";
import { resolveManageWorktreesTarget } from "./open-worktree-manager";

const state = {
  activeId: "a",
  all: [
    { id: "a", folder: "/repo-a" },
    { id: "b", folder: "/repo-b" },
  ],
};

describe("resolveManageWorktreesTarget", () => {
  it("defaults to the active workspace's primary folder", () => {
    expect(resolveManageWorktreesTarget(state)).toEqual({
      workspaceId: "a",
      folder: "/repo-a",
    });
  });

  it("honors an explicit workspaceId", () => {
    expect(resolveManageWorktreesTarget(state, { workspaceId: "b" })).toEqual({
      workspaceId: "b",
      folder: "/repo-b",
    });
  });

  it("honors an explicit folder override", () => {
    expect(
      resolveManageWorktreesTarget(state, {
        workspaceId: "a",
        folder: "/repo-a-feat",
      }),
    ).toEqual({
      workspaceId: "a",
      folder: "/repo-a-feat",
    });
  });

  it("returns null when the workspace is missing", () => {
    expect(
      resolveManageWorktreesTarget(state, { workspaceId: "missing" }),
    ).toBeNull();
  });

  it("returns null when there is no active workspace", () => {
    expect(
      resolveManageWorktreesTarget({ activeId: null, all: state.all }),
    ).toBeNull();
  });
});
