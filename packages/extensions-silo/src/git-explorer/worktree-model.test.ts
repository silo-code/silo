import { describe, it, expect } from "vitest";
import type { GitWorktree } from "../git/git-api";
import {
  buildWorktreeRows,
  isOnlyMainWorktree,
  orphanCandidateFolders,
  orphanOpenFolders,
  worktreeActions,
  sanitizeBranchForPath,
  suggestWorktreePath,
  branchesInUse,
  managerWorktreeCount,
  shouldShowWorktreeManagerButton,
  worktreeManagerButtonTooltip,
} from "./worktree-model";

function wt(overrides: Partial<GitWorktree>): GitWorktree {
  return {
    path: "/repo",
    head: "abc",
    branch: "main",
    isMain: false,
    detached: false,
    bare: false,
    locked: null,
    prunable: null,
    ...overrides,
  };
}

describe("buildWorktreeRows", () => {
  const main = wt({ path: "/w/repo", isMain: true, branch: "main" });
  const feat = wt({ path: "/w/repo-feat", branch: "feat" });
  const alpha = wt({ path: "/w/alpha", branch: "alpha" });

  it("puts main first, then linked alphabetical by path", () => {
    const rows = buildWorktreeRows([feat, alpha, main], "/w/repo", "/w/repo", [
      "/w/repo",
    ]);
    expect(rows.map((r) => r.wt.path)).toEqual([
      "/w/repo",
      "/w/alpha",
      "/w/repo-feat",
    ]);
  });

  it("flags current, open, and primary rows", () => {
    const rows = buildWorktreeRows([main, feat], "/w/repo-feat", "/w/repo", [
      "/w/repo",
      "/w/repo-feat/",
    ]);
    expect(rows[0]).toMatchObject({
      isCurrent: false,
      isOpen: true,
      isPrimary: true,
    });
    expect(rows[1]).toMatchObject({
      isCurrent: true,
      isOpen: true,
      isPrimary: false,
    });
  });

  it("drops bare entries but keeps prunable ones", () => {
    const bare = wt({ path: "/w/repo.git", bare: true });
    const gone = wt({ path: "/w/gone", prunable: "directory missing" });
    const rows = buildWorktreeRows([main, bare, gone], "/w/repo", "/w/repo", [
      "/w/repo",
    ]);
    expect(rows.map((r) => r.wt.path)).toEqual(["/w/repo", "/w/gone"]);
  });
});

describe("isOnlyMainWorktree", () => {
  const main = wt({ path: "/w/repo", isMain: true, branch: "main" });
  const feat = wt({ path: "/w/repo-feat", branch: "feat" });

  it("is true for a lone main worktree", () => {
    const rows = buildWorktreeRows([main], "/w/repo", "/w/repo", ["/w/repo"]);
    expect(isOnlyMainWorktree(rows)).toBe(true);
  });

  it("is false when linked worktrees exist or the list is empty", () => {
    expect(
      isOnlyMainWorktree(
        buildWorktreeRows([main, feat], "/w/repo", "/w/repo", ["/w/repo"]),
      ),
    ).toBe(false);
    expect(isOnlyMainWorktree([])).toBe(false);
  });
});

describe("orphanCandidateFolders", () => {
  const main = wt({ path: "/w/repo", isMain: true, branch: "main" });
  const feat = wt({ path: "/w/repo-feat", branch: "feat" });

  it("collects open folders absent from the worktree list", () => {
    const rows = buildWorktreeRows([main], "/w/repo", "/w/repo", [
      "/w/repo",
      "/w/gone",
      "/w/other-repo",
    ]);
    expect(
      orphanCandidateFolders(
        rows,
        ["/w/repo", "/w/gone", "/w/other-repo"],
        "/w/repo",
      ),
    ).toEqual(["/w/gone", "/w/other-repo"]);
  });

  it("skips folders already represented in the worktree list", () => {
    const rows = buildWorktreeRows([main, feat], "/w/repo", "/w/repo", [
      "/w/repo",
      "/w/repo-feat",
    ]);
    expect(
      orphanCandidateFolders(rows, ["/w/repo", "/w/repo-feat"], "/w/repo"),
    ).toEqual([]);
  });
});

describe("orphanOpenFolders", () => {
  const main = wt({ path: "/w/repo", isMain: true, branch: "main" });

  it("surfaces a candidate confirmed missing on disk", () => {
    const rows = buildWorktreeRows([main], "/w/repo", "/w/repo", [
      "/w/repo",
      "/w/gone",
    ]);
    const orphans = orphanOpenFolders(
      rows,
      ["/w/repo", "/w/gone"],
      "/w/repo",
      "/w/repo",
      new Set(["/w/gone"]),
    );
    expect(orphans).toHaveLength(1);
    expect(orphans[0]).toMatchObject({
      wt: { path: "/w/gone" },
      isOpen: true,
      isOrphan: true,
    });
    expect(worktreeActions(orphans[0]!)).toEqual(["close"]);
  });

  it("leaves out a candidate that still exists on disk — an unrelated folder (e.g. a second repo attached to the workspace), not a deleted worktree", () => {
    const rows = buildWorktreeRows([main], "/w/repo", "/w/repo", [
      "/w/repo",
      "/w/other-repo",
    ]);
    expect(
      orphanOpenFolders(
        rows,
        ["/w/repo", "/w/other-repo"],
        "/w/repo",
        "/w/repo",
        new Set(), // nothing confirmed missing
      ),
    ).toEqual([]);
  });
});

describe("worktreeActions", () => {
  const base = {
    isCurrent: false,
    isOpen: false,
    isPrimary: false,
  };

  it("offers open for an unopened linked worktree, plus remove", () => {
    expect(worktreeActions({ ...base, wt: wt({}) })).toEqual([
      "open",
      "remove",
    ]);
  });

  it("offers close (not open) for an open non-primary row", () => {
    expect(worktreeActions({ ...base, isOpen: true, wt: wt({}) })).toEqual([
      "close",
      "remove",
    ]);
  });

  it("never offers remove or close for the main/primary worktree", () => {
    expect(
      worktreeActions({
        ...base,
        isOpen: true,
        isPrimary: true,
        isCurrent: true,
        wt: wt({ isMain: true }),
      }),
    ).toEqual([]);
  });

  it("still offers remove for a locked worktree (the flow confirms unlocking)", () => {
    expect(worktreeActions({ ...base, wt: wt({ locked: "" }) })).toEqual([
      "open",
      "remove",
    ]);
    expect(
      worktreeActions({ ...base, wt: wt({ locked: "pinned by CI" }) }),
    ).toEqual(["open", "remove"]);
  });

  it("offers only prune for a prunable row", () => {
    expect(
      worktreeActions({ ...base, wt: wt({ prunable: "gitdir gone" }) }),
    ).toEqual(["prune"]);
  });

  it("offers no actions while a remove is pending", () => {
    expect(worktreeActions({ ...base, wt: wt({}) }, true)).toEqual([]);
    expect(
      worktreeActions(
        { ...base, isOpen: true, wt: wt({ prunable: "gone" }) },
        true,
      ),
    ).toEqual([]);
  });

  it("offers nothing but remove for the current (unopened-elsewhere) view", () => {
    // isCurrent implies the folder is one of the workspace's folders in
    // practice, but the gate itself: current rows never offer open.
    expect(worktreeActions({ ...base, isCurrent: true, wt: wt({}) })).toEqual([
      "remove",
    ]);
  });
});

describe("sanitizeBranchForPath / suggestWorktreePath", () => {
  it("replaces separators and unsafe characters with dashes", () => {
    expect(sanitizeBranchForPath("feat/x")).toBe("feat-x");
    expect(sanitizeBranchForPath("fix\\win:path")).toBe("fix-win-path");
    expect(sanitizeBranchForPath("wip branch name")).toBe("wip-branch-name");
  });

  it("trims leading/trailing dashes and dots", () => {
    expect(sanitizeBranchForPath("-lead")).toBe("lead");
    expect(sanitizeBranchForPath("trail.")).toBe("trail");
    expect(sanitizeBranchForPath("release/v1..2")).toBe("release-v1.2");
  });

  it("suggests a sibling directory named <repo>-<branch>", () => {
    expect(suggestWorktreePath("/w/proj", "feat/x")).toBe("/w/proj-feat-x");
    expect(suggestWorktreePath("/w/proj/", "main")).toBe("/w/proj-main");
  });

  it("returns the dangling prefix for a blank branch", () => {
    expect(suggestWorktreePath("/w/proj", "")).toBe("/w/proj-");
  });
});

describe("branchesInUse", () => {
  it("collects checked-out branch names, skipping detached entries", () => {
    const wts = [
      wt({ branch: "main", isMain: true }),
      wt({ path: "/w/x", branch: "feat" }),
      wt({ path: "/w/d", branch: null, detached: true }),
    ];
    expect(branchesInUse(wts)).toEqual(new Set(["main", "feat"]));
  });
});

describe("shouldShowWorktreeManagerButton", () => {
  const main = wt({ path: "/w/repo", isMain: true, branch: "main" });
  const feat = wt({ path: "/w/repo-feat", branch: "feat" });
  const bare = wt({ path: "/w/repo.git", bare: true });
  const gone = wt({ path: "/w/gone", prunable: "directory missing" });

  it("hides when the list is unknown or only the main worktree", () => {
    expect(shouldShowWorktreeManagerButton(null)).toBe(false);
    expect(shouldShowWorktreeManagerButton(undefined)).toBe(false);
    expect(shouldShowWorktreeManagerButton([main])).toBe(false);
    expect(shouldShowWorktreeManagerButton([main, bare])).toBe(false);
  });

  it("shows when the manager would list more than main (incl. prunable)", () => {
    expect(shouldShowWorktreeManagerButton([main, feat])).toBe(true);
    expect(shouldShowWorktreeManagerButton([main, gone])).toBe(true);
    expect(managerWorktreeCount([main, bare, feat])).toBe(2);
    expect(worktreeManagerButtonTooltip([main, feat])).toBe(
      "Manage worktrees (2)",
    );
  });
});
