import { describe, it, expect } from "vitest";
import { resolveManageBranchesTarget } from "./open-branch-manager";

const state = {
  activeId: "a",
  all: [
    { id: "a", folder: "/repo-a" },
    { id: "b", folder: "/repo-b" },
  ],
};

describe("resolveManageBranchesTarget", () => {
  it("defaults to the active workspace's primary folder", () => {
    expect(resolveManageBranchesTarget(state)).toEqual({ folder: "/repo-a" });
  });

  it("honors an explicit workspaceId", () => {
    expect(resolveManageBranchesTarget(state, { workspaceId: "b" })).toEqual({
      folder: "/repo-b",
    });
  });

  it("honors an explicit folder override", () => {
    expect(
      resolveManageBranchesTarget(state, {
        workspaceId: "a",
        folder: "/repo-a-feat",
      }),
    ).toEqual({ folder: "/repo-a-feat" });
  });

  it("returns null when the workspace is missing", () => {
    expect(
      resolveManageBranchesTarget(state, { workspaceId: "missing" }),
    ).toBeNull();
  });

  it("returns null when there is no active workspace", () => {
    expect(
      resolveManageBranchesTarget({ activeId: null, all: state.all }),
    ).toBeNull();
  });
});
