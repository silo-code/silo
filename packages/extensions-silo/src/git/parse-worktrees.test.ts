import { describe, it, expect } from "vitest";
import { parseWorktrees } from "./parse-worktrees";

// Fixtures mimic `git worktree list --porcelain`: blank-line-separated stanzas,
// each starting with `worktree <abs-path>`.

describe("parseWorktrees", () => {
  it("parses a main-only repo", () => {
    const raw = [
      "worktree /repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
    ].join("\n");
    expect(parseWorktrees(raw)).toEqual([
      {
        path: "/repo",
        head: "abc123",
        branch: "main",
        isMain: true,
        detached: false,
        bare: false,
        locked: null,
        prunable: null,
      },
    ]);
  });

  it("marks only the first stanza as the main worktree", () => {
    const raw = [
      "worktree /repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /repo-feat",
      "HEAD def456",
      "branch refs/heads/feat/x",
      "",
    ].join("\n");
    const [main, linked] = parseWorktrees(raw);
    expect(main.isMain).toBe(true);
    expect(linked.isMain).toBe(false);
    expect(linked.path).toBe("/repo-feat");
    expect(linked.branch).toBe("feat/x");
  });

  it("strips the refs/heads/ prefix but keeps slashes in branch names", () => {
    const raw = [
      "worktree /w",
      "HEAD a",
      "branch refs/heads/feat/core-updates",
    ].join("\n");
    expect(parseWorktrees(raw)[0].branch).toBe("feat/core-updates");
  });

  it("parses a detached worktree with no branch", () => {
    const raw = ["worktree /w", "HEAD abc123", "detached"].join("\n");
    expect(parseWorktrees(raw)[0]).toMatchObject({
      branch: null,
      detached: true,
      head: "abc123",
    });
  });

  it("parses a bare entry", () => {
    const raw = ["worktree /repo.git", "bare"].join("\n");
    expect(parseWorktrees(raw)[0]).toMatchObject({
      bare: true,
      head: null,
      branch: null,
    });
  });

  it("parses locked with and without a reason", () => {
    const raw = [
      "worktree /a",
      "HEAD x",
      "branch refs/heads/a",
      "locked",
      "",
      "worktree /b",
      "HEAD y",
      "branch refs/heads/b",
      "locked reason with spaces",
      "",
    ].join("\n");
    const [a, b] = parseWorktrees(raw);
    expect(a.locked).toBe("");
    expect(b.locked).toBe("reason with spaces");
  });

  it("parses a prunable entry with a reason", () => {
    const raw = [
      "worktree /gone",
      "HEAD abc",
      "branch refs/heads/gone",
      "prunable gitdir file points to non-existent location",
    ].join("\n");
    expect(parseWorktrees(raw)[0].prunable).toBe(
      "gitdir file points to non-existent location",
    );
  });

  it("normalizes backslashes in paths to forward slashes", () => {
    const raw = [
      "worktree C:\\repos\\proj",
      "HEAD a",
      "branch refs/heads/main",
    ].join("\n");
    expect(parseWorktrees(raw)[0].path).toBe("C:/repos/proj");
  });

  it("tolerates trailing blank lines and returns empty for empty input", () => {
    expect(parseWorktrees("")).toEqual([]);
    expect(parseWorktrees("\n\n")).toEqual([]);
    const raw = [
      "worktree /repo",
      "HEAD a",
      "branch refs/heads/main",
      "",
      "",
    ].join("\n");
    expect(parseWorktrees(raw)).toHaveLength(1);
  });
});
