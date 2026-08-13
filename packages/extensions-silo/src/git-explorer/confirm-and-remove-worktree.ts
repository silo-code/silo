import type { ExtensionContext } from "@silo-code/sdk";
import type { GitRepoStore } from "@silo-code/git-api";
import {
  beginPendingWorktreeRemove,
  endPendingWorktreeRemove,
  enqueueWorktreeRemoval,
  isWorktreeManagerOpen,
  isWorktreeRemovePending,
  markWorktreeListDirty,
} from "./pending-worktree-remove";
import { worktreeDisplayName } from "./pending-worktree-remove-model";

const DIRTY_RE = /contains modified or untracked files|use --force/i;
// git's message when the path was already deregistered as a worktree — e.g.
// removed by something outside Silo (another terminal, another tool) since
// the list this row was drawn from was last fetched.
const NOT_A_WORKTREE_RE = /is not a working tree/i;

export interface RemoveWorktreeParams {
  ctx: ExtensionContext;
  /**
   * The live store for the directory git should run in (main worktree — git
   * refuses to remove the worktree it's invoked from). Callers resolve this
   * via `ctx.getExtension<GitAPI>("silo.git")?.api?.watchRepo(cwd)`.
   */
  store: GitRepoStore;
  /** Linked worktree path to remove. */
  worktreePath: string;
  workspaceId: string;
  /** Whether `worktreePath` is currently a workspace folder. */
  isOpen: boolean;
  notifyError: (title: string, err: unknown) => void;
  /** After a successful remove (e.g. reload manager list / refresh Git view). */
  onSuccess?: () => void;
}

/**
 * Confirm and run Remove worktree with pending-remove UX (ADR 0025): after
 * confirms, mark pending, close the folder if open, show StatusBar progress,
 * toast on success only when the manager is dismissed.
 */
export async function confirmAndRemoveWorktree(
  params: RemoveWorktreeParams,
): Promise<void> {
  const {
    ctx,
    store,
    worktreePath,
    workspaceId,
    isOpen,
    notifyError,
    onSuccess,
  } = params;

  try {
    if (isWorktreeRemovePending(worktreePath)) return;

    const name = worktreeDisplayName(worktreePath);
    const ok = await ctx.ui.confirm({
      title: `Remove worktree "${name}"?`,
      body: `Deletes the directory at ${worktreePath}. The branch itself is kept.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;

    beginPendingWorktreeRemove(worktreePath);
    if (isOpen) ctx.workspaces.removeFolder(workspaceId, worktreePath);

    try {
      let alreadyGone = false;
      try {
        // Still funneled through the global enqueueWorktreeRemoval queue, not
        // just the store's own per-tracker serialization — removing several
        // worktrees across *different* repos at once is what caused the
        // multi-worktree freeze (ADR 0025); the store only serializes calls
        // that land on the same tracker (e.g. several linked worktrees of one
        // repo, which all run from the same main-worktree store anyway).
        await enqueueWorktreeRemoval(() => store.removeWorktree(worktreePath));
      } catch (err) {
        if (NOT_A_WORKTREE_RE.test(String(err))) {
          // The row was stale — this worktree is already gone at the git
          // level. Nothing left to delete; just resync our own state instead
          // of surfacing git's fatal error for a no-op.
          alreadyGone = true;
        } else if (DIRTY_RE.test(String(err))) {
          // Clear pending while the force confirm is up (ADR: progress only
          // after every confirm). Folder stays closed — recoverable via Open
          // alongside.
          endPendingWorktreeRemove(worktreePath);
          const force = await ctx.ui.confirm({
            title: `"${name}" has uncommitted changes`,
            body: "Force-remove the worktree and discard them? This can't be undone.",
            confirmLabel: "Force Remove",
            danger: true,
          });
          if (!force) return;

          beginPendingWorktreeRemove(worktreePath);
          await enqueueWorktreeRemoval(() =>
            store.removeWorktree(worktreePath, true),
          );
        } else {
          throw err;
        }
      }

      endPendingWorktreeRemove(worktreePath);
      markWorktreeListDirty();
      if (!isWorktreeManagerOpen()) {
        ctx.ui.notify(
          "info",
          alreadyGone
            ? `${name} was already removed`
            : `Removed worktree ${name}`,
        );
      }
      onSuccess?.();
    } catch (err) {
      endPendingWorktreeRemove(worktreePath);
      notifyError(`Remove "${name}" failed`, err);
    }
  } finally {
    // Release a tracker this call may be the sole owner of — e.g. GitView's
    // "Remove worktree…" resolves the main worktree's own store via a fresh
    // watchRepo() call just for this operation. Safe to call unconditionally:
    // dispose() no-ops when the store is still workspace-owned or has other
    // subscribers (the WorktreeManager modal's own `store`, kept alive by its
    // own useServiceState subscription) — see repo-tracker.ts's maybeTeardown.
    store.dispose();
  }
}
