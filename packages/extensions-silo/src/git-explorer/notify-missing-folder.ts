import type { ExtensionContext } from "@silo-code/sdk";
import { path } from "@silo-code/sdk";
import { samePath } from "../git/worktree-utils";

// Called from the GitRepoStore's own `onFolderMissing` event (ADR 0037),
// wired once per (workspaceId, folder) pair in git/index.ts's activate() —
// so this fires for any open workspace, whether or not its Git panel has
// ever been mounted, and it's edge-triggered (the store only fires this once
// per transition into "missing", not on every subsequent poll), which is
// what makes the de-dup below effectively just a safety net rather than the
// primary mechanism it used to be.

const notifiedMissingFolders = new Set<string>();

/** Session-lifetime de-dup key so a folder is only notified about once. */
function notifyKey(workspaceId: string, folder: string): string {
  return `${workspaceId}::${folder}`;
}

/**
 * Notify once per workspace per missing folder, with a one-click "Remove
 * folder" action. Only fires for a folder still in the workspace's
 * `extraFolders` — never the primary folder ({@link WorkspaceService.removeFolder}
 * no-ops there), and never a folder that's already been removed by the time
 * this fires (e.g. the read that produced `onFolderMissing` was in flight
 * when the user removed this same folder via the Worktree Manager's own
 * Remove action, which drops it from the workspace before the disk delete
 * even finishes — re-checking live membership here avoids re-offering to
 * remove a folder that's already gone).
 */
export function notifyMissingFolder(
  ctx: ExtensionContext,
  workspaceId: string,
  folder: string,
): void {
  const ws = ctx.workspaces.get(workspaceId);
  if (!ws) return;
  const isExtraFolder = (ws.extraFolders ?? []).some((f) =>
    samePath(f, folder),
  );
  if (!isExtraFolder) return;

  const key = notifyKey(workspaceId, folder);
  if (notifiedMissingFolders.has(key)) return;
  notifiedMissingFolders.add(key);

  // Toasts are global, not workspace-scoped — this can fire while a
  // *different* workspace is on screen, and "Remove folder" always targets
  // this folder's own workspace regardless of what's active. Name it
  // explicitly whenever it isn't the one you're currently looking at, so the
  // action's target is never ambiguous (same reasoning as notifyNewWorktree).
  const isActive = ctx.workspaces.getState().activeId === workspaceId;
  const workspaceSuffix = isActive ? "" : ` from "${ws.name}"`;
  ctx.ui.notify(
    "warn",
    `"${path.basename(folder)}" could not be found${workspaceSuffix}. Remove it from the workspace?`,
    {
      title: "Workspace folder not found",
      actions: [
        {
          label: "Remove folder",
          run: () => ctx.workspaces.removeFolder(workspaceId, folder),
        },
      ],
    },
  );
}
