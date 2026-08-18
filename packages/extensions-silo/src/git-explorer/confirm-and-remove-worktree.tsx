import type { ExtensionContext } from "@silo-code/sdk";
import type { GitRepoStore } from "@silo-code/git-api";
import { RemoveWorktreeDialog } from "./RemoveWorktreeDialog";
import { removeWorktreeDialogModel } from "./remove-worktree-model";
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
// `git worktree remove` on a locked worktree: "cannot remove a locked working
// tree" with the lock reason appended when one was given (`git worktree lock
// --reason …`). The single `--force` this API exposes only covers the dirty
// check — git wants a second one to override a lock — so the lock comes off
// explicitly instead (`git worktree unlock`). Only reached for a lock the
// caller didn't know about: the normal path takes `locked` from the worktree
// list and folds unlocking into the one remove confirm.
const LOCKED_RE = /locked working tree/i;
const LOCK_REASON_RE = /lock reason:\s*(.+)/i;

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
  /**
   * The worktree's lock reason as `GitWorktree.locked` reported it (`""` when
   * locked without one), or `null`/omitted when it isn't locked. A known lock
   * is folded into the single remove confirm and cleared without prompting
   * again; an unknown one (locked after the list was read) still gets its own
   * confirm when git refuses. Stale either way is harmless — the lock is only
   * ever cleared in response to git actually refusing over it.
   */
  locked?: string | null;
  notifyError: (title: string, err: unknown) => void;
  /** After a successful remove (e.g. reload manager list / refresh Git view). */
  onSuccess?: () => void;
}

/**
 * Confirm and run Remove worktree with pending-remove UX (ADR 0025): after
 * confirms, mark pending, close the folder if open, show StatusBar progress,
 * toast on success only when the manager is dismissed.
 *
 * **One dialog, every obstacle.** Whatever git would refuse over — a lock,
 * uncommitted files — is read up front and stated in a single
 * {@link RemoveWorktreeDialog} (`ctx.ui.showModal`, not `ctx.ui.confirm`,
 * since prose can't carry a file list), whose button names each irreversible
 * step it takes. The prompts further down are strictly for what that dialog
 * couldn't know: a status it failed to read, work saved while it was open, or
 * a lock applied after the worktree list was drawn.
 *
 * A cleared lock is put back if the removal it was clearing the way for never
 * happens — a declined fallback prompt, or a failure.
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
    locked = null,
    notifyError,
    onSuccess,
  } = params;

  try {
    if (isWorktreeRemovePending(worktreePath)) return;

    const name = worktreeDisplayName(worktreePath);

    // What this worktree has uncommitted. `store` watches the *main* worktree,
    // so its snapshot says nothing about this one — ask git directly. Fails
    // open (`null`): a status we couldn't read just means the dialog stays
    // quiet about changes, and git still refuses (and prompts) later if there
    // are any. It never claims a removal will be clean.
    let dirtyFiles: string[] | null = null;
    try {
      dirtyFiles = (await store.api.status(worktreePath)).files.map(
        (f) => f.path,
      );
    } catch {
      // Deliberately silent — see above.
    }

    const model = removeWorktreeDialogModel({
      worktreePath,
      locked,
      dirtyFiles,
    });
    // A rich dialog rather than ctx.ui.confirm: a locked worktree with
    // uncommitted files has more to say than one prose string can carry, and
    // saying it all here is what buys the single confirm.
    const ok = await ctx.ui.showModal<boolean>(
      (close) => <RemoveWorktreeDialog model={model} close={close} />,
      { title: model.title, size: "sm", dismissible: true },
    );
    if (ok !== true) return;

    beginPendingWorktreeRemove(worktreePath);
    if (isOpen) ctx.workspaces.removeFolder(workspaceId, worktreePath);

    // Put a lock we cleared back on when the removal it was clearing the way
    // for doesn't happen — a declined force confirm, or a failure. The user
    // agreed to "unlock *and remove*"; leaving the worktree behind unlocked
    // would quietly drop protection some other tool put there (see the
    // Locked worktree entry in docs/domain-language.md).
    async function restoreLock(reason: string): Promise<void> {
      try {
        await enqueueWorktreeRemoval(() =>
          reason
            ? store.lockWorktree(worktreePath, reason)
            : store.lockWorktree(worktreePath),
        );
      } catch (err) {
        // Worth a toast of its own: the worktree is now unlocked and neither
        // Silo nor the user asked for that end state.
        notifyError(`Could not restore the lock on "${name}"`, err);
      } finally {
        markWorktreeListDirty();
      }
    }

    // The reason of a lock cleared below, kept for that restore; `null` while
    // nothing has been unlocked.
    let clearedLock: string | null = null;
    let removed = false;

    try {
      let alreadyGone = false;
      let unlocked = false;
      let unlockError: unknown = null;
      // Confirmed with the file list on screen, so the removal starts forced —
      // the Force Remove prompt below is only for changes we couldn't see
      // (unreadable status, or work saved after the dialog opened).
      let force = (dirtyFiles?.length ?? 0) > 0;

      // Each git refusal the user can answer (locked, dirty) clears one more
      // obstacle and retries — the lock silently, since the confirm above
      // already covered it, the changes only after their own confirm. Both
      // flags are one-shot, so a second identical refusal is a real error,
      // not a loop.
      for (;;) {
        try {
          // Still funneled through the global enqueueWorktreeRemoval queue, not
          // just the store's own per-tracker serialization — removing several
          // worktrees across *different* repos at once is what caused the
          // multi-worktree freeze (ADR 0025); the store only serializes calls
          // that land on the same tracker (e.g. several linked worktrees of one
          // repo, which all run from the same main-worktree store anyway).
          await enqueueWorktreeRemoval(() =>
            force
              ? store.removeWorktree(worktreePath, true)
              : store.removeWorktree(worktreePath),
          );
          break;
        } catch (err) {
          const message = String(err);
          if (NOT_A_WORKTREE_RE.test(message)) {
            // The row was stale — this worktree is already gone at the git
            // level. Nothing left to delete; just resync our own state instead
            // of surfacing git's fatal error for a no-op.
            alreadyGone = true;
            break;
          }
          if (!unlocked && LOCKED_RE.test(message)) {
            // git's message carries the reason for a lock the caller didn't
            // know about — the same string `locked` would have held.
            const reason =
              locked ?? LOCK_REASON_RE.exec(message)?.[1]?.trim() ?? "";
            if (locked == null) {
              // A lock applied after the list this row was drawn from was read
              // — nobody has agreed to clear it yet, so ask. Clear pending
              // while that confirm is up (ADR: progress only after every
              // confirm), same as the dirty case below.
              endPendingWorktreeRemove(worktreePath);
              const ok = await ctx.ui.confirm({
                title: `"${name}" is locked`,
                body: reason
                  ? `Locked with the reason: “${reason}”. Unlock it and continue removing the worktree?`
                  : "Unlock it and continue removing the worktree?",
                confirmLabel: "Unlock and Remove",
                danger: true,
              });
              if (!ok) return;
              beginPendingWorktreeRemove(worktreePath);
            }
            // A known lock needs no prompt of its own — the remove confirm said
            // "Unlock and Remove". Waiting for git to refuse (rather than
            // unlocking up front) keeps this a no-op when the row's lock is
            // stale: no needless git write, and nothing to undo.
            unlocked = true;
            try {
              await enqueueWorktreeRemoval(() =>
                store.unlockWorktree(worktreePath),
              );
              clearedLock = reason;
              // The lock is off as of now — tell the manager, or its rows keep
              // a "locked" badge that has stopped being true. (If the removal
              // then doesn't happen, restoreLock marks the list again.)
              markWorktreeListDirty();
            } catch (err) {
              // Not reported here: "not locked" just means something else
              // cleared it first and the retry now succeeds. Kept for the case
              // where the lock is still standing — see the throw below.
              unlockError = err;
            }
            continue;
          }
          if (!force && DIRTY_RE.test(message)) {
            // Clear pending while the force confirm is up (ADR: progress only
            // after every confirm). Folder stays closed — recoverable via Open
            // alongside.
            endPendingWorktreeRemove(worktreePath);
            const ok = await ctx.ui.confirm({
              title: `"${name}" has uncommitted changes`,
              body: "Force-remove the worktree and discard them? This can't be undone.",
              confirmLabel: "Force Remove",
              danger: true,
            });
            if (!ok) return;

            beginPendingWorktreeRemove(worktreePath);
            force = true;
            continue;
          }
          // A lock that outlived our unlock: that failure is the real story,
          // not git's (correct) refusal to remove a still-locked worktree.
          if (unlockError != null && LOCKED_RE.test(message)) throw unlockError;
          throw err;
        }
      }

      // Either the directory is gone or it was never there — nothing left to
      // hold a lock, so the restore below stands down.
      removed = true;

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
    } finally {
      // Runs for the declined force confirm (a `return` out of the loop) just
      // as it does for a failure — every path that leaves the worktree on disk
      // after its lock came off.
      if (clearedLock != null && !removed) await restoreLock(clearedLock);
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
