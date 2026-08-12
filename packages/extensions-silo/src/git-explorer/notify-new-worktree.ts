import type { ExtensionContext } from "@silo-code/sdk";
import { path } from "@silo-code/sdk";
import type { GitWorktree } from "@silo-code/git-api";
import { samePath } from "../git/worktree-utils";

// The reverse of notify-missing-folder.ts: instead of noticing a workspace
// folder that vanished on disk, this notices a linked worktree that
// *appeared* on disk since the last check (e.g. `git worktree add` run from
// a terminal by a coding agent) and offers to add it as a workspace folder.
// Called from the GitRepoStore's own `onWorktreeAdded` event (ADR 0037),
// wired once per (workspaceId, folder) pair in git/index.ts's activate() —
// so this fires for any open workspace, whether or not its Git panel has
// ever been mounted. Session-lifetime de-dup, same shape as
// notify-missing-folder.ts.

const notifiedNewWorktrees = new Set<string>();

/** Session-lifetime de-dup key so a worktree is only notified about once. */
function notifyKey(workspaceId: string, worktreePath: string): string {
  return `${workspaceId}::${worktreePath}`;
}

/**
 * Notify once per workspace per newly appeared worktree, with a one-click
 * "Add to workspace" action.
 */
export function notifyNewWorktree(
  ctx: ExtensionContext,
  workspaceId: string,
  wt: GitWorktree,
): void {
  const ws = ctx.workspaces.get(workspaceId);
  if (!ws) return;
  const allFolders = [ws.folder, ...(ws.extraFolders ?? [])];
  // Already open as a folder in this workspace — nothing to offer.
  if (allFolders.some((f) => samePath(f, wt.path))) return;

  const key = notifyKey(workspaceId, wt.path);
  if (notifiedNewWorktrees.has(key)) return;
  notifiedNewWorktrees.add(key);

  const branchSuffix = wt.branch ? ` (${wt.branch})` : "";
  // Toasts are global, not workspace-scoped — this can fire while a
  // *different* workspace is on screen, and "Add to workspace" always
  // targets the worktree's own workspace regardless of what's active. Name
  // it explicitly whenever it isn't the one you're currently looking at, so
  // the action's target is never ambiguous.
  const isActive = ctx.workspaces.getState().activeId === workspaceId;
  const workspaceSuffix = isActive ? "" : ` in "${ws.name}"`;
  ctx.ui.notify(
    "info",
    `"${path.basename(wt.path)}"${branchSuffix} was created${workspaceSuffix}. Add it to your workspace?`,
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
