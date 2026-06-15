import { describe, it, expect } from "vitest";
import type { GitBranch } from "../git/git-api";
import {
  filterBranches,
  isPublished,
  localNameFor,
  orderBranches,
  remoteBranchNames,
} from "./branch-model";

const local = (name: string, current = false): GitBranch => ({
  name,
  current,
  remote: false,
  upstream: null,
});
const remote = (name: string): GitBranch => ({
  name,
  current: false,
  remote: true,
  upstream: null,
});

describe("filterBranches", () => {
  const branches = [local("main"), local("feature"), remote("origin/feature")];

  it("returns all branches for a blank query", () => {
    expect(filterBranches(branches, "")).toHaveLength(3);
    expect(filterBranches(branches, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively on a substring", () => {
    expect(filterBranches(branches, "FEAT").map((b) => b.name)).toEqual([
      "feature",
      "origin/feature",
    ]);
  });

  it("returns nothing when no name matches", () => {
    expect(filterBranches(branches, "nope")).toEqual([]);
  });
});

describe("orderBranches", () => {
  it("puts the current branch first, then locals, then remotes — alphabetical", () => {
    const ordered = orderBranches([
      remote("origin/zeta"),
      local("zeta"),
      local("alpha"),
      local("main", true),
      remote("origin/alpha"),
    ]);
    expect(ordered.map((b) => b.name)).toEqual([
      "main", // current first
      "alpha", // then locals, alphabetical
      "zeta",
      "origin/alpha", // then remotes, alphabetical
      "origin/zeta",
    ]);
  });

  it("does not mutate the input array", () => {
    const input = [local("b"), local("a")];
    orderBranches(input);
    expect(input.map((b) => b.name)).toEqual(["b", "a"]);
  });
});

describe("localNameFor", () => {
  it("strips the leading remote segment", () => {
    expect(localNameFor("origin/feat/x")).toBe("feat/x");
    expect(localNameFor("upstream/main")).toBe("main");
  });

  it("returns names without a slash unchanged", () => {
    expect(localNameFor("main")).toBe("main");
  });
});

describe("isPublished / remoteBranchNames", () => {
  const localWith = (name: string, upstream: string | null): GitBranch => ({
    name,
    current: false,
    remote: false,
    upstream,
  });
  const branches: GitBranch[] = [
    localWith("main", "origin/main"), // upstream exists remotely
    localWith("feature", "origin/feature"), // upstream configured but pruned
    localWith("scratch", null), // never pushed
    remote("origin/main"),
  ];
  const names = remoteBranchNames(branches);

  it("collects only the remote-tracking branch names", () => {
    expect([...names]).toEqual(["origin/main"]);
  });

  it("is published only when the upstream ref still exists", () => {
    expect(isPublished(localWith("main", "origin/main"), names)).toBe(true);
    // configured upstream, but the remote ref is gone (pruned) → unpublished
    expect(isPublished(localWith("feature", "origin/feature"), names)).toBe(
      false,
    );
    // never pushed → unpublished
    expect(isPublished(localWith("scratch", null), names)).toBe(false);
  });
});
