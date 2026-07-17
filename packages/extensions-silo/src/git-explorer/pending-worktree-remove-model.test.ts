import { describe, it, expect } from "vitest";
import {
  pendingRemoveStatusLabel,
  worktreeDisplayName,
  isPathPendingRemove,
  type PendingWorktreeRemove,
} from "./pending-worktree-remove-model";

describe("pendingRemoveStatusLabel", () => {
  it("returns null when nothing is pending", () => {
    expect(pendingRemoveStatusLabel([])).toBeNull();
  });

  it("names a single pending worktree", () => {
    expect(
      pendingRemoveStatusLabel([{ path: "/w/repo-feat", name: "repo-feat" }]),
    ).toBe("Removing repo-feat…");
  });

  it("aggregates multiple pending removes", () => {
    const pending: PendingWorktreeRemove[] = [
      { path: "/w/a", name: "a" },
      { path: "/w/b", name: "b" },
    ];
    expect(pendingRemoveStatusLabel(pending)).toBe("Removing 2 worktrees…");
  });
});

describe("worktreeDisplayName", () => {
  it("uses the basename", () => {
    expect(worktreeDisplayName("/w/repo-feat")).toBe("repo-feat");
  });
});

describe("isPathPendingRemove", () => {
  const pending: PendingWorktreeRemove[] = [
    { path: "/w/repo-feat", name: "repo-feat" },
  ];

  it("matches normalized path identity", () => {
    expect(isPathPendingRemove("/w/repo-feat/", pending)).toBe(true);
    expect(isPathPendingRemove("/w/other", pending)).toBe(false);
  });
});
