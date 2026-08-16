import { path } from "@silo-code/sdk";
import { normalizeFolderPath } from "./worktree-model";

/** One in-flight Remove worktree (see ADR 0025). */
export interface PendingWorktreeRemove {
  /** Normalized worktree directory path. */
  path: string;
  /** Basename used in StatusBar / toast copy. */
  name: string;
}

/**
 * StatusBar / busy-status label for the current pending-remove set. One path →
 * name; several → a count. Empty → `null` (hide the entry).
 */
export function pendingRemoveStatusLabel(
  pending: readonly PendingWorktreeRemove[],
): string | null {
  if (pending.length === 0) return null;
  if (pending.length === 1) return `Removing ${pending[0]!.name}…`;
  return `Removing ${pending.length} worktrees…`;
}

/** Display name for a worktree path (basename; path itself if empty). */
export function worktreeDisplayName(worktreePath: string): string {
  const base = path.basename(worktreePath);
  return base || worktreePath;
}

/**
 * Whether a path is in the pending-remove set (path identity via
 * {@link normalizeFolderPath}).
 */
export function isPathPendingRemove(
  worktreePath: string,
  pending: readonly PendingWorktreeRemove[],
): boolean {
  const key = normalizeFolderPath(worktreePath);
  return pending.some((p) => p.path === key);
}
