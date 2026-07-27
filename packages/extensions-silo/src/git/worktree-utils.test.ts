import { describe, it, expect } from "vitest";
import type { GitWorktree } from "./git-api";
import {
  normalizeFolderPath,
  samePath,
  findWorktreeFor,
} from "./worktree-utils";

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

describe("findWorktreeFor", () => {
  it("matches a folder to its worktree through path normalization", () => {
    const wts = [wt({ path: "/private/tmp/repo", isMain: true })];
    expect(findWorktreeFor("/tmp/repo/", wts)).toBe(wts[0]);
    expect(findWorktreeFor("/tmp/other", wts)).toBeUndefined();
  });
});
