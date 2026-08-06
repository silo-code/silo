import { useEffect, useState } from "react";
import { getFileService } from "../extension-host/file-service";

// The menu builder itself lives in extension-host/open-workspace-menu.tsx, so
// the public `ctx.workspaces.getOpenWorkspaceMenuItems()` and this host chrome
// share one implementation instead of two copies that must be kept in sync.
// Re-exported here for the CenterDock empty state, which already holds the
// saved-entry data to pass in and so doesn't need the async resolver.
export { buildOpenWorkspaceItems } from "../extension-host/open-workspace-menu";

/**
 * Best-effort check of whether each closed workspace's folder still exists, so a
 * workspace whose folder has gone missing gets a warning. The React-hook form,
 * for host chrome that builds the menu during render; the service's
 * `getOpenWorkspaceMenuItems()` runs the same checks inside its async resolver.
 * A missing entry means "don't know yet" — treat as existing until proven
 * otherwise.
 */
export function useFolderExistence(
  folders: readonly string[],
): Map<string, boolean> {
  const [results, setResults] = useState<Map<string, boolean>>(() => new Map());
  useEffect(() => {
    let cancelled = false;
    const files = getFileService();
    const unknown = folders.filter((f) => !results.has(f));
    if (unknown.length === 0) return;
    Promise.all(
      unknown.map(async (f) => {
        try {
          return [f, await files.pathExists(f)] as const;
        } catch {
          return [f, false] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setResults((prev) => {
        const next = new Map(prev);
        for (const [f, ok] of entries) next.set(f, ok);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [folders, results]);
  return results;
}
