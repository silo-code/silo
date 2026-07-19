import { describe, it, expect } from "vitest";
import {
  isLinkedWorktreeGitEntry,
  partitionWorkspaceFolders,
  validateWorkspaceName,
  visiblePropertyPages,
} from "./workspace-properties-model";
import type { WorkspacePropertyPage } from "@silo-code/sdk";
import type { Workspace } from "./workspace-helpers";

describe("validateWorkspaceName", () => {
  it("accepts a normal name unchanged", () => {
    expect(validateWorkspaceName("My Workspace")).toEqual({
      ok: true,
      value: "My Workspace",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(validateWorkspaceName("  spaced  ")).toEqual({
      ok: true,
      value: "spaced",
    });
  });

  it("rejects an empty string", () => {
    const result = validateWorkspaceName("");
    expect(result.ok).toBe(false);
  });

  it("rejects a whitespace-only string", () => {
    const result = validateWorkspaceName("   ");
    expect(result.ok).toBe(false);
  });

  it("returns a human-readable error message when invalid", () => {
    const result = validateWorkspaceName("");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });
});

function page(
  id: string,
  visible?: (ws: Workspace) => boolean,
): WorkspacePropertyPage {
  return { id, title: id, component: () => null, visible };
}

const ws = { id: "ws_1", name: "One" } as Workspace;

describe("visiblePropertyPages", () => {
  it("includes a page with no visible predicate", () => {
    const pages = [page("a")];
    expect(visiblePropertyPages(pages, ws)).toEqual(pages);
  });

  it("includes a page whose visible predicate returns true", () => {
    const pages = [page("a", () => true)];
    expect(visiblePropertyPages(pages, ws)).toEqual(pages);
  });

  it("excludes a page whose visible predicate returns false", () => {
    const pages = [page("a", () => false)];
    expect(visiblePropertyPages(pages, ws)).toEqual([]);
  });

  it("passes the workspace through to the predicate", () => {
    let received: Workspace | undefined;
    visiblePropertyPages([page("a", (w) => ((received = w), true))], ws);
    expect(received).toBe(ws);
  });

  it("preserves input order and filters independently per page", () => {
    const pages = [
      page("hide", () => false),
      page("show1"),
      page("show2", () => true),
    ];
    expect(visiblePropertyPages(pages, ws).map((p) => p.id)).toEqual([
      "show1",
      "show2",
    ]);
  });
});

describe("isLinkedWorktreeGitEntry", () => {
  it("is true when .git exists and is a file", () => {
    expect(isLinkedWorktreeGitEntry({ isDir: false })).toBe(true);
  });

  it("is false when .git is a directory (main worktree / ordinary repo)", () => {
    expect(isLinkedWorktreeGitEntry({ isDir: true })).toBe(false);
  });

  it("is false when .git is missing", () => {
    expect(isLinkedWorktreeGitEntry(null)).toBe(false);
  });
});

describe("partitionWorkspaceFolders", () => {
  it("keeps primary in folders and leaves unmarked extras there", () => {
    expect(
      partitionWorkspaceFolders("/repo", ["/docs", "/assets"], new Set()),
    ).toEqual({
      folders: ["/repo", "/docs", "/assets"],
      worktrees: [],
    });
  });

  it("moves linked-worktree extras into worktrees, preserving order", () => {
    expect(
      partitionWorkspaceFolders(
        "/repo",
        ["/docs", "/repo-feat", "/assets", "/repo-fix"],
        new Set(["/repo-feat", "/repo-fix"]),
      ),
    ).toEqual({
      folders: ["/repo", "/docs", "/assets"],
      worktrees: ["/repo-feat", "/repo-fix"],
    });
  });

  it("never classifies the primary as a worktree row", () => {
    // Even if the primary path appears in the linked set (e.g. the workspace
    // itself is a linked worktree), it stays under Folders as primary.
    expect(
      partitionWorkspaceFolders(
        "/repo-feat",
        ["/other"],
        new Set(["/repo-feat"]),
      ),
    ).toEqual({
      folders: ["/repo-feat", "/other"],
      worktrees: [],
    });
  });

  it("routes missing-on-disk extras into worktrees", () => {
    expect(
      partitionWorkspaceFolders(
        "/repo",
        ["/docs", "/repo-gone"],
        new Set(["/repo-gone"]),
      ),
    ).toEqual({
      folders: ["/repo", "/docs"],
      worktrees: ["/repo-gone"],
    });
  });
});
