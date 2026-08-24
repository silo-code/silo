import { describe, it, expect } from "vitest";
import type { GitFileStatus } from "../git/git-api";
import { buildGitNavItems } from "./git-nav";
import {
  resolveRowScrollTarget,
  measureScrollMargin,
} from "./git-virtual-model";

const file = (path: string, staged = false): GitFileStatus => ({
  path,
  staged: staged ? "M" : ".",
  worktree: staged ? "." : "M",
  isStaged: staged,
  isModified: !staged,
  isUntracked: false,
  isRenamed: false,
});

describe("resolveRowScrollTarget", () => {
  const staged = [file("a.ts", true), file("b.ts", true)];
  const changed = [file("c.ts"), file("d.ts"), file("e.ts")];

  it("maps a staged row nav index to the staged virtual list row index", () => {
    const navItems = buildGitNavItems({
      stagedFiles: staged,
      changedFiles: changed,
      stagedOpen: true,
      changesOpen: true,
    });
    expect(resolveRowScrollTarget(navItems, 2, staged, changed)).toEqual({
      section: "staged",
      rowIndex: 1,
    });
  });

  it("maps a changes row nav index to the changes virtual list row index", () => {
    const navItems = buildGitNavItems({
      stagedFiles: staged,
      changedFiles: changed,
      stagedOpen: true,
      changesOpen: true,
    });
    expect(resolveRowScrollTarget(navItems, 4, staged, changed)).toEqual({
      section: "changes",
      rowIndex: 0,
    });
    expect(resolveRowScrollTarget(navItems, 5, staged, changed)).toEqual({
      section: "changes",
      rowIndex: 1,
    });
  });

  it("returns null for section headers", () => {
    const navItems = buildGitNavItems({
      stagedFiles: staged,
      changedFiles: changed,
      stagedOpen: true,
      changesOpen: true,
    });
    expect(resolveRowScrollTarget(navItems, 0, staged, changed)).toBeNull();
    expect(resolveRowScrollTarget(navItems, 3, staged, changed)).toBeNull();
  });

  it("returns null for nav indices that are not open-section rows", () => {
    const navItems = buildGitNavItems({
      stagedFiles: staged,
      changedFiles: changed,
      stagedOpen: false,
      changesOpen: true,
    });
    expect(resolveRowScrollTarget(navItems, 1, staged, changed)).toBeNull();
  });
});

describe("measureScrollMargin", () => {
  it("computes offset from scroll container top to list top", () => {
    const scrollEl = {
      scrollTop: 120,
      getBoundingClientRect: () => ({ top: 50 }),
    } as HTMLElement;
    const listEl = {
      getBoundingClientRect: () => ({ top: 200 }),
    } as HTMLElement;
    expect(measureScrollMargin(scrollEl, listEl)).toBe(270);
  });
});
