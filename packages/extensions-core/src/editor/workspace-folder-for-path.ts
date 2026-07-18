/**
 * Pick the workspace root that contains `filePath`.
 *
 * Multi-root workspaces (primary + `extraFolders`, including opened git
 * worktrees) must scope path-relative ops — especially `silo.git` diffs — to
 * the root the file actually lives under. Longest matching prefix wins so a
 * nested root beats its parent.
 *
 * Returns `null` when no root contains the path.
 */
export function workspaceFolderForPath(
  filePath: string,
  primary: string,
  extras: readonly string[] = [],
): string | null {
  const roots = [primary, ...extras]
    .map((f) => f.replace(/\/+$/, ""))
    .filter((f) => f.length > 0);
  let best: string | null = null;
  for (const root of roots) {
    if (filePath === root || filePath.startsWith(`${root}/`)) {
      if (best === null || root.length > best.length) best = root;
    }
  }
  return best;
}
