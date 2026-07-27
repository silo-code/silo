import { describe, it, expect } from "vitest";
import type { GitLogEntry } from "../git/git-api";
import {
  dividerIndex,
  displayDividerIndex,
  orderedCommits,
} from "./commit-list-model";

function entry(hash: string): GitLogEntry {
  return {
    hash,
    shortHash: hash.slice(0, 7),
    author: "a",
    relativeDate: "now",
    subject: hash,
  };
}

const commits = [entry("h1"), entry("h2"), entry("h3"), entry("h4")];

describe("dividerIndex", () => {
  it("marks the boundary after the last unpushed commit", () => {
    const unpushed = new Set(["h1", "h2"]);
    expect(dividerIndex(commits, unpushed)).toBe(2);
  });

  it("returns -1 when nothing is unpushed", () => {
    expect(dividerIndex(commits, new Set())).toBe(-1);
  });

  it("returns -1 when every loaded commit is unpushed (boundary not yet loaded)", () => {
    const unpushed = new Set(commits.map((c) => c.hash));
    expect(dividerIndex(commits, unpushed)).toBe(-1);
  });

  it("returns -1 for the 'all unpushed, no upstream' sentinel", () => {
    expect(dividerIndex(commits, "all")).toBe(-1);
  });

  it("returns -1 when the distinction doesn't apply (detached HEAD)", () => {
    expect(dividerIndex(commits, null)).toBe(-1);
  });
});

describe("orderedCommits", () => {
  it("returns the canonical newest-first array unchanged for newestFirst", () => {
    expect(orderedCommits(commits, "newestFirst")).toEqual(commits);
  });

  it("reverses to oldest-first (GitHub PR commits-tab convention)", () => {
    expect(orderedCommits(commits, "oldestFirst")).toEqual(
      [...commits].reverse(),
    );
  });

  it("doesn't mutate the input array", () => {
    const copy = [...commits];
    orderedCommits(commits, "oldestFirst");
    expect(commits).toEqual(copy);
  });
});

describe("displayDividerIndex", () => {
  it("passes through unchanged for newestFirst", () => {
    expect(displayDividerIndex(2, commits.length, "newestFirst")).toBe(2);
  });

  it("mirrors the boundary across the list for oldestFirst", () => {
    // 2 unpushed of 4 total → the boundary sits 2 from the end once reversed.
    expect(displayDividerIndex(2, commits.length, "oldestFirst")).toBe(2);
    expect(displayDividerIndex(1, commits.length, "oldestFirst")).toBe(3);
    expect(displayDividerIndex(3, commits.length, "oldestFirst")).toBe(1);
  });

  it("stays -1 (no divider) regardless of order", () => {
    expect(displayDividerIndex(-1, commits.length, "newestFirst")).toBe(-1);
    expect(displayDividerIndex(-1, commits.length, "oldestFirst")).toBe(-1);
  });
});
