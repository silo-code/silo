import type { ExtensionContext } from "@silo-code/sdk";
import { path } from "@silo-code/sdk";

// Silo can't watch for a folder removed entirely outside it (e.g. a linked
// git worktree deleted via `git worktree remove` run directly, or a second
// repo attached to a workspace that later got moved/deleted) — every panel
// that lists workspace folders (Git, File Explorer, …) would otherwise have
// to detect and explain this on its own. This is the single, panel-agnostic
// place that notices and offers to fix it.

/** Session-lifetime de-dup key so a folder is only notified about once. */
function notifyKey(workspaceId: string, folder: string): string {
  return `${workspaceId}::${folder}`;
}

/**
 * Check a workspace's *extra* folders (never the primary — {@link
 * WorkspaceService.removeFolder} no-ops there, so there'd be nothing to
 * offer) for ones that no longer exist on disk, and notify once per folder
 * per app session with a one-click "Remove folder" action. `notified` is the
 * caller's session-lifetime de-dup set, mutated in place.
 *
 * Called on workspace activation, including the already-active workspace at
 * cold start — see `core.workspaces`' `activate()`.
 */
export async function checkMissingExtraFolders(
  ctx: ExtensionContext,
  ws: { id: string; extraFolders?: string[] },
  notified: Set<string>,
): Promise<void> {
  for (const folder of ws.extraFolders ?? []) {
    const key = notifyKey(ws.id, folder);
    if (notified.has(key)) continue;

    // Fail open on a read error — don't offer to drop a folder we couldn't
    // actually confirm is gone (mirrors the orphan-worktree disk check in
    // worktree-model.ts).
    const exists = await ctx.files.pathExists(folder).catch(() => true);
    if (exists) continue;

    notified.add(key);
    ctx.ui.notify(
      "warn",
      `"${path.basename(folder)}" could not be found. Remove it from the workspace?`,
      {
        title: "Workspace folder not found",
        actions: [
          {
            label: "Remove folder",
            run: () => ctx.workspaces.removeFolder(ws.id, folder),
          },
        ],
      },
    );
  }
}
