import { describe, it, expect } from "vitest";
import { parseBranches } from "./parse-branches";

// Fixtures mimic `git for-each-ref --format=%(refname)%09%(HEAD)%09%(upstream:short)`.
const T = "\t";

describe("parseBranches", () => {
  it("parses the current local branch with an upstream", () => {
    const raw = `refs/heads/main${T}*${T}origin/main`;
    expect(parseBranches(raw)).toEqual([
      { name: "main", current: true, remote: false, upstream: "origin/main" },
    ]);
  });

  it("parses a non-current local branch without an upstream", () => {
    const raw = `refs/heads/feature${T} ${T}`;
    expect(parseBranches(raw)).toEqual([
      { name: "feature", current: false, remote: false, upstream: null },
    ]);
  });

  it("keeps slashes in branch names", () => {
    const raw = `refs/heads/feat/core-updates${T} ${T}`;
    expect(parseBranches(raw)[0].name).toBe("feat/core-updates");
  });

  it("parses remote-tracking branches and skips the symbolic HEAD pointer", () => {
    const raw = [
      `refs/heads/main${T}*${T}origin/main`,
      `refs/remotes/origin/HEAD${T} ${T}`,
      `refs/remotes/origin/main${T} ${T}`,
      `refs/remotes/origin/feat/x${T} ${T}`,
    ].join("\n");
    expect(parseBranches(raw)).toEqual([
      { name: "main", current: true, remote: false, upstream: "origin/main" },
      { name: "origin/main", current: false, remote: true, upstream: null },
      { name: "origin/feat/x", current: false, remote: true, upstream: null },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseBranches("")).toEqual([]);
    expect(parseBranches("\n")).toEqual([]);
  });
});
