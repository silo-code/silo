import type { WorkspacePropertyPage } from "@silo-code/sdk";
import type { Workspace } from "./workspace-helpers";

/** Result of validating a candidate workspace name. */
export type NameValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Trims and validates a candidate workspace name. Unlike the old staged-form
 * behavior (which silently kept the previous name on empty submit), the
 * edit-mode component surfaces this as an inline error instead — see
 * "Workspace properties modal redesign" in RFC 0015.
 */
export function validateWorkspaceName(input: string): NameValidation {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Name can't be empty." };
  return { ok: true, value: trimmed };
}

/** Registered property pages relevant to `ws`, in the registry's order. */
export function visiblePropertyPages(
  pages: WorkspacePropertyPage[],
  ws: Workspace,
): WorkspacePropertyPage[] {
  return pages.filter((p) => p.visible?.(ws) ?? true);
}

/**
 * Whether a `.git` entry marks a **linked** git worktree. Linked worktrees
 * store a `.git` *file* (pointing at the main repo's `worktrees/` dir); the
 * main worktree and ordinary repos use a `.git` *directory*. Absent → not a
 * linked worktree.
 */
export function isLinkedWorktreeGitEntry(
  meta: { isDir: boolean } | null,
): boolean {
  return meta != null && !meta.isDir;
}

/** Primary + extras split into ordinary folders vs linked-worktree extras. */
export interface PartitionedFolders {
  /** Primary first, then extras that are not linked worktrees. */
  folders: string[];
  /** Extras whose `.git` is a file (opened alongside via the worktree manager). */
  worktrees: string[];
}

/**
 * Split a workspace's folder list for the properties modal: the primary root
 * always stays under Folders; extras known to be linked worktrees (or extras
 * that are missing on disk — still closable here) move to Worktrees so
 * multi-root folders and opened worktrees don't look like the same thing.
 */
export function partitionWorkspaceFolders(
  primary: string,
  extras: readonly string[],
  worktreeExtras: ReadonlySet<string>,
): PartitionedFolders {
  const folders = [primary];
  const worktrees: string[] = [];
  for (const folder of extras) {
    if (worktreeExtras.has(folder)) worktrees.push(folder);
    else folders.push(folder);
  }
  return { folders, worktrees };
}
