import { path } from "@silo-code/sdk";
import type { GitWorktree } from "../git/git-api";

// Pure presentation logic for the worktree manager modal — path identity,
// row derivation, action gating, and the suggested-path convention. Extracted
// from WorktreeManager.tsx so the rules are unit-testable without rendering
// React (per the repo's testing convention; see branch-model.ts).

/**
 * Normalize a folder path for identity comparison: forward slashes, no
 * trailing slash, and macOS realpath'd temp prefixes folded back to their
 * symlinked form (`/private/tmp/x` ⇔ `/tmp/x`) — git reports realpaths while
 * workspace folders may hold the symlinked spelling.
 */
export function normalizeFolderPath(p: string): string {
  let n = path.normalize(p);
  if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
  const priv = /^\/private(\/(?:tmp|var|etc)(?:\/|$).*)$/.exec(n);
  if (priv) n = priv[1];
  return n;
}

/** Whether two folder paths identify the same directory (see {@link normalizeFolderPath}). */
export function samePath(a: string, b: string): boolean {
  return normalizeFolderPath(a) === normalizeFolderPath(b);
}

/** One worktree row in the manager, with its relationship to the workspace. */
export interface WorktreeRow {
  wt: GitWorktree;
  /** This entry is the folder the manager was opened from. */
  isCurrent: boolean;
  /** The worktree's path is already one of the workspace's folders. */
  isOpen: boolean;
  /** The worktree's path is the workspace's primary folder (can't be closed). */
  isPrimary: boolean;
}

/**
 * Derive display rows from a worktree list: main worktree first, then linked
 * worktrees alphabetical by path. Bare entries are dropped (nothing to browse
 * or open); prunable entries are kept — they drive the prune action.
 */
export function buildWorktreeRows(
  worktrees: GitWorktree[],
  currentFolder: string,
  wsFolder: string,
  allFolders: string[],
): WorktreeRow[] {
  return worktrees
    .filter((wt) => !wt.bare)
    .sort(
      (a, b) =>
        Number(b.isMain) - Number(a.isMain) || a.path.localeCompare(b.path),
    )
    .map((wt) => ({
      wt,
      isCurrent: samePath(wt.path, currentFolder),
      isOpen: allFolders.some((f) => samePath(wt.path, f)),
      isPrimary: samePath(wt.path, wsFolder),
    }));
}

/** A row action offered for a worktree (drives the row context menu). */
export type WorktreeAction = "open" | "close" | "remove" | "prune";

/**
 * The actions that apply to a worktree row, in display order. `open` adds the
 * worktree as a workspace folder; `close` removes that folder (the worktree
 * itself is untouched); `remove` deletes the worktree via git. A **prunable**
 * row (directory already gone) only offers `prune`; the **main** worktree and
 * the workspace's **primary** folder can't be removed, and a **locked**
 * worktree can't be removed either. A **pending remove** (disk delete in
 * flight — ADR 0025) offers nothing until it finishes.
 */
export function worktreeActions(
  row: WorktreeRow,
  pendingRemove = false,
): WorktreeAction[] {
  if (pendingRemove) return [];
  if (row.wt.prunable != null) return ["prune"];
  const actions: WorktreeAction[] = [];
  if (!row.isOpen && !row.isCurrent) actions.push("open");
  if (row.isOpen && !row.isPrimary) actions.push("close");
  if (!row.wt.isMain && !row.isPrimary && row.wt.locked == null) {
    actions.push("remove");
  }
  return actions;
}

/** Sanitize a branch name into a filesystem-friendly directory suffix. */
export function sanitizeBranchForPath(branch: string): string {
  return branch
    .replace(/[/\\:*?"<>|\s]+/g, "-")
    .replace(/\.+/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/**
 * The suggested location for a new worktree: a **sibling** of the repo named
 * `<repo>-<branch>` (e.g. `/w/proj` + `feat/x` → `/w/proj-feat-x`). A sibling
 * keeps the checkout out of the repo tree, so the main worktree's file watcher
 * and git status never see it. Returns just the parent dir when `branch` is
 * blank (the caller appends as the user types).
 */
export function suggestWorktreePath(repoPath: string, branch: string): string {
  const parent = path.dirname(repoPath);
  const repoName = path.basename(repoPath);
  const suffix = sanitizeBranchForPath(branch);
  return suffix
    ? path.join(parent, `${repoName}-${suffix}`)
    : path.join(parent, repoName ? `${repoName}-` : "");
}

/** The worktree whose root is `folder`, if any (see {@link samePath}). */
export function findWorktreeFor(
  folder: string,
  worktrees: GitWorktree[],
): GitWorktree | undefined {
  return worktrees.find((wt) => samePath(wt.path, folder));
}

/**
 * How many worktrees the manager modal would list — non-bare only, matching
 * {@link buildWorktreeRows}. `null` (list not yet known) counts as zero.
 */
export function managerWorktreeCount(
  worktrees: GitWorktree[] | null | undefined,
): number {
  if (!worktrees) return 0;
  return worktrees.filter((wt) => !wt.bare).length;
}

/**
 * Whether the Git header should show the Manage worktrees shortcut: the
 * manager would list more than the main worktree alone. Driven by the last
 * successful list (callers keep prior cache on refresh failure).
 */
export function shouldShowWorktreeManagerButton(
  worktrees: GitWorktree[] | null | undefined,
): boolean {
  return managerWorktreeCount(worktrees) > 1;
}

/** Tooltip for the header Manage worktrees button (`N` = manager row count). */
export function worktreeManagerButtonTooltip(
  worktrees: GitWorktree[] | null | undefined,
): string {
  return `Manage worktrees (${managerWorktreeCount(worktrees)})`;
}

/**
 * Branch names already checked out in some worktree — git refuses
 * `worktree add` for these, so the create dialog filters them proactively.
 * Detached and bare entries contribute nothing.
 */
export function branchesInUse(worktrees: GitWorktree[]): Set<string> {
  const used = new Set<string>();
  for (const wt of worktrees) {
    if (wt.branch != null) used.add(wt.branch);
  }
  return used;
}
