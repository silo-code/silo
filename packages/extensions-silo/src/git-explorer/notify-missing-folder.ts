import type { ExtensionContext } from "@silo-code/sdk";
import { path } from "@silo-code/sdk";
import { samePath } from "../git/worktree-utils";

// Supersedes `core.workspaces`' former missing-folder-notify.ts. That watcher
// only re-checked a workspace's extra folders on *activation*, so a folder
// that vanished while its workspace was already active — e.g. an agent
// running `git worktree remove`, or any other out-of-band delete — went
// unnoticed until the next switch away and back. `GitStatus.missing` (see
// ../git/git-api.ts) is already computed generically for *any* open folder,
// worktree or not, on every `GitView` status refresh (file watcher, autofetch,
// push/pull) — see the `.status(folder).then(...)` callback in GitView.tsx.
// Riding that existing, more frequent, per-folder signal instead of a
// dedicated pathExists poll is what closes the gap.

const notifiedMissingFolders = new Set<string>();

/** Session-lifetime de-dup key so a folder is only notified about once. */
function notifyKey(workspaceId: string, folder: string): string {
  return `${workspaceId}::${folder}`;
}

/**
 * Called from `GitView`'s status refresh with the folder's freshly-fetched
 * `GitStatus.missing`. Notifies once per workspace per missing folder, with a
 * one-click "Remove folder" action. Never fires for the workspace's primary
 * folder — {@link WorkspaceService.removeFolder} no-ops there, so there'd be
 * nothing to offer.
 */
export function notifyMissingFolder(
  ctx: ExtensionContext,
  workspaceId: string,
  folder: string,
  missing: boolean,
): void {
  if (!missing) return;
  const ws = ctx.workspaces.get(workspaceId);
  if (!ws || samePath(folder, ws.folder)) return;

  const key = notifyKey(workspaceId, folder);
  if (notifiedMissingFolders.has(key)) return;
  notifiedMissingFolders.add(key);

  ctx.ui.notify(
    "warn",
    `"${path.basename(folder)}" could not be found. Remove it from the workspace?`,
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
