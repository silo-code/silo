import type { ExtensionContext } from "@silo-code/sdk";
import { path } from "@silo-code/sdk";
import type { GitWorktree } from "../git/git-api";
import { newlyCreatedWorktrees } from "./worktree-model";

// The reverse of notify-missing-folder.ts: instead of noticing a workspace
// folder that vanished on disk, this notices a linked worktree that
// *appeared* on disk since the last `git worktree list` check (e.g. `git
// worktree add` run from a terminal by a coding agent) and offers to add it
// as a workspace folder. Session-lifetime de-dup, same shape as the
// missing-folder watcher.

const notifiedNewWorktrees = new Set<string>();

/** Session-lifetime de-dup key so a worktree is only notified about once. */
function notifyKey(workspaceId: string, worktreePath: string): string {
  return `${workspaceId}::${worktreePath}`;
}

/**
 * Compare a repo's worktree list against its last-known list and notify once
 * per workspace per newly appeared worktree, with a one-click "Add to
 * workspace" action. Called from `GitView`'s existing worktree refresh —
 * `prev` is the caller's own cache, so this does no fetching of its own.
 */
export function notifyNewWorktrees(
  ctx: ExtensionContext,
  workspaceId: string,
  prev: readonly GitWorktree[],
  current: readonly GitWorktree[],
): void {
  const ws = ctx.workspaces.get(workspaceId);
  if (!ws) return;
  const allFolders = [ws.folder, ...(ws.extraFolders ?? [])];

  for (const wt of newlyCreatedWorktrees(prev, current, allFolders)) {
    const key = notifyKey(workspaceId, wt.path);
    if (notifiedNewWorktrees.has(key)) continue;
    notifiedNewWorktrees.add(key);

    const branchSuffix = wt.branch ? ` (${wt.branch})` : "";
    ctx.ui.notify(
      "info",
      `"${path.basename(wt.path)}"${branchSuffix} was created. Add it to your workspace?`,
      {
        title: "New worktree detected",
        actions: [
          {
            label: "Add to workspace",
            run: () => ctx.workspaces.addFolder(workspaceId, wt.path),
          },
        ],
      },
    );
  }
}
