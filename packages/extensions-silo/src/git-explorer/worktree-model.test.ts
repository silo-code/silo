import { describe, it, expect } from "vitest";
import type { GitWorktree } from "../git/git-api";
import {
  normalizeFolderPath,
  samePath,
  buildWorktreeRows,
  worktreeActions,
  sanitizeBranchForPath,
  suggestWorktreePath,
  findWorktreeFor,
  branchesInUse,
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

describe("normalizeFolderPath / samePath", () => {
  it("normalizes separators and trailing slashes", () => {
    expect(normalizeFolderPath("/a/b/")).toBe("/a/b");
    expect(normalizeFolderPath("C:\\repos\\proj")).toBe("C:/repos/proj");
    expect(samePath("/a/b/", "/a/b")).toBe(true);
  });

  it("treats macOS /private realpaths as their symlinked form", () => {
    expect(samePath("/private/tmp/x", "/tmp/x")).toBe(true);
    expect(samePath("/private/var/folders/y", "/var/folders/y")).toBe(true);
    // "/privateer" or unrelated /private children must not be rewritten.
    expect(samePath("/privateer/tmp", "/tmp")).toBe(false);
    expect(normalizeFolderPath("/private/stuff")).toBe("/private/stuff");
  });

  it("keeps distinct paths distinct", () => {
    expect(samePath("/a/b", "/a/b2")).toBe(false);
  });
});

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

  it("withholds remove from a locked worktree", () => {
    expect(worktreeActions({ ...base, wt: wt({ locked: "" }) })).toEqual([
      "open",
    ]);
    expect(
      worktreeActions({ ...base, wt: wt({ locked: "pinned by CI" }) }),
    ).toEqual(["open"]);
  });

  it("offers only prune for a prunable row", () => {
    expect(
      worktreeActions({ ...base, wt: wt({ prunable: "gitdir gone" }) }),
    ).toEqual(["prune"]);
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

describe("findWorktreeFor / branchesInUse", () => {
  it("matches a folder to its worktree through path normalization", () => {
    const wts = [wt({ path: "/private/tmp/repo", isMain: true })];
    expect(findWorktreeFor("/tmp/repo/", wts)).toBe(wts[0]);
    expect(findWorktreeFor("/tmp/other", wts)).toBeUndefined();
  });

  it("collects checked-out branch names, skipping detached entries", () => {
    const wts = [
      wt({ branch: "main", isMain: true }),
      wt({ path: "/w/x", branch: "feat" }),
      wt({ path: "/w/d", branch: null, detached: true }),
    ];
    expect(branchesInUse(wts)).toEqual(new Set(["main", "feat"]));
  });
});
