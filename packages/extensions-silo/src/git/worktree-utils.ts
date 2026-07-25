import { path } from "@silo-code/sdk";
import type { GitWorktree } from "./git-api";

// Pure derivations over `GitWorktree[]` — path identity and "which entry is
// this folder" lookup. Lives beside the `GitWorktree` type (the provider's own
// published data shape) so both the git-explorer view and any other extension
// that needs "is this folder a worktree" (e.g. the file-explorer header badge)
// import a shared, tested answer instead of each re-deriving path identity.

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

/** The worktree whose root is `folder`, if any (see {@link samePath}). */
export function findWorktreeFor(
  folder: string,
  worktrees: GitWorktree[],
): GitWorktree | undefined {
  return worktrees.find((wt) => samePath(wt.path, folder));
}
