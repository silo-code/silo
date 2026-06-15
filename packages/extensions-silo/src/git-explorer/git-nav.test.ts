import { describe, it, expect } from "vitest";
import type { GitFileStatus } from "../git/git-api";
import { buildGitNavItems, navItemKey, type GitNavItem } from "./git-nav";

const file = (path: string): GitFileStatus => ({
  path,
  staged: ".",
  worktree: "M",
  isStaged: false,
  isModified: true,
  isUntracked: false,
  isRenamed: false,
});

const keys = (items: GitNavItem[]): string[] => items.map(navItemKey);

describe("buildGitNavItems", () => {
  const staged = [file("a.ts"), file("b.ts")];
  const changed = [file("c.ts")];

  it("orders staged header + rows before changes header + rows when both open", () => {
    const items = buildGitNavItems({
      stagedFiles: staged,
      changedFiles: changed,
      stagedOpen: true,
      changesOpen: true,
    });
    expect(keys(items)).toEqual([
      "h:staged",
      "r:staged:a.ts",
      "r:staged:b.ts",
      "h:changes",
      "r:changes:c.ts",
    ]);
  });

  it("keeps a collapsed staged header but drops its rows", () => {
    const items = buildGitNavItems({
      stagedFiles: staged,
      changedFiles: changed,
      stagedOpen: false,
      changesOpen: true,
    });
    expect(keys(items)).toEqual(["h:staged", "h:changes", "r:changes:c.ts"]);
  });

  it("keeps a collapsed changes header but drops its rows", () => {
    const items = buildGitNavItems({
      stagedFiles: staged,
      changedFiles: changed,
      stagedOpen: true,
      changesOpen: false,
    });
    expect(keys(items)).toEqual([
      "h:staged",
      "r:staged:a.ts",
      "r:staged:b.ts",
      "h:changes",
    ]);
  });

  it("omits the staged header entirely when there are no staged files", () => {
    const items = buildGitNavItems({
      stagedFiles: [],
      changedFiles: changed,
      stagedOpen: true,
      changesOpen: true,
    });
    expect(keys(items)).toEqual(["h:changes", "r:changes:c.ts"]);
  });

  it("always renders the changes header even with zero changed files", () => {
    const items = buildGitNavItems({
      stagedFiles: [],
      changedFiles: [],
      stagedOpen: true,
      changesOpen: true,
    });
    expect(keys(items)).toEqual(["h:changes"]);
  });
});

describe("navItemKey", () => {
  it("distinguishes headers from rows and namespaces by section", () => {
    expect(navItemKey({ kind: "header", section: "staged" })).toBe("h:staged");
    expect(navItemKey({ kind: "header", section: "changes" })).toBe(
      "h:changes",
    );
    expect(
      navItemKey({ kind: "row", section: "staged", file: file("src/x.ts") }),
    ).toBe("r:staged:src/x.ts");
    expect(
      navItemKey({ kind: "row", section: "changes", file: file("src/x.ts") }),
    ).toBe("r:changes:src/x.ts");
  });
});
