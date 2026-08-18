import type { ExtensionContext } from "@silo-code/sdk";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirmAndRemoveWorktree } from "./confirm-and-remove-worktree";
import {
  getPendingWorktreeRemoves,
  isWorktreeManagerOpen,
  markWorktreeManagerOpen,
  resetPendingWorktreeRemovesForTests,
  subscribeWorktreeListDirty,
} from "./pending-worktree-remove";
import type { GitRepoStore } from "@silo-code/git-api";

function mockCtx(opts: {
  confirms: boolean[];
  managerOpen?: boolean;
}): ExtensionContext {
  let confirmIdx = 0;
  const notify = vi.fn();
  const removeFolder = vi.fn();
  const ctx = {
    ui: {
      // The primary Remove dialog (rich content) and the fallback confirms
      // draw from one queue, in call order, so a test reads top to bottom.
      showModal: vi.fn(async () => opts.confirms[confirmIdx++] ?? false),
      confirm: vi.fn(async () => opts.confirms[confirmIdx++] ?? false),
      notify,
    },
    workspaces: { removeFolder },
  } as unknown as ExtensionContext;
  if (opts.managerOpen) markWorktreeManagerOpen();
  return ctx;
}

function fakeStore(
  removeWorktree: (path: string, force?: boolean) => Promise<void>,
  dispose: () => void = vi.fn(),
  unlockWorktree: (path: string) => Promise<void> = vi.fn(async () => {}),
  lockWorktree: (path: string, reason?: string) => Promise<void> = vi.fn(
    async () => {},
  ),
  // The pre-confirm `git status` on the worktree being removed; clean unless a
  // test says otherwise.
  status: (
    path: string,
  ) => Promise<{ files: { path: string }[] }> = async () => ({
    files: [],
  }),
): GitRepoStore {
  return {
    removeWorktree,
    unlockWorktree,
    lockWorktree,
    dispose,
    api: { status },
  } as unknown as GitRepoStore;
}

const dirtyStatus = async () => ({ files: [{ path: "scratch.txt" }] });
/** A status read that fails — the dialog then knows nothing about changes. */
const unreadableStatus = async () => {
  throw new Error("not a git repository");
};

const lockedError = (reason?: string) =>
  new Error(
    reason
      ? `fatal: cannot remove a locked working tree, lock reason: ${reason}`
      : "fatal: cannot remove a locked working tree",
  );

describe("confirmAndRemoveWorktree", () => {
  beforeEach(() => {
    resetPendingWorktreeRemovesForTests();
  });

  it("no-ops when the user cancels the first confirm", async () => {
    const removeWorktree = vi.fn();
    const ctx = mockCtx({ confirms: [false] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError: vi.fn(),
    });
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("serializes the git removal when several worktrees are removed at once", async () => {
    const tick = () => new Promise<void>((r) => setTimeout(r, 0));
    let active = 0;
    let maxActive = 0;
    const gates: Array<() => void> = [];
    // Each removal blocks until released, so we can observe how many run at once.
    const removeWorktree = vi.fn(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((r) => gates.push(r));
      active -= 1;
    });
    const store = fakeStore(removeWorktree);
    const start = (worktreePath: string) =>
      confirmAndRemoveWorktree({
        ctx: mockCtx({ confirms: [true] }),
        store,
        worktreePath,
        workspaceId: "ws1",
        isOpen: false,
        notifyError: vi.fn(),
      });

    const all = Promise.all([start("/w/a"), start("/w/b"), start("/w/c")]);
    // All three are past their confirms and queued; only the first is running.
    await tick();
    expect(removeWorktree).toHaveBeenCalledTimes(1);
    expect(getPendingWorktreeRemoves()).toHaveLength(3);

    // Drain the queue one at a time.
    while (gates.length) {
      gates.shift()!();
      await tick();
    }
    await all;
    expect(removeWorktree).toHaveBeenCalledTimes(3);
    // The whole point: never two `git worktree remove` running concurrently.
    expect(maxActive).toBe(1);
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("closes the folder on start, clears pending on success, toasts when manager closed", async () => {
    const removeWorktree = vi.fn(async () => {});
    const ctx = mockCtx({ confirms: [true] });
    const onSuccess = vi.fn();
    let dirty = 0;
    const stop = subscribeWorktreeListDirty(() => {
      dirty += 1;
    });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError: vi.fn(),
      onSuccess,
    });
    stop();
    expect(ctx.workspaces.removeFolder).toHaveBeenCalledWith(
      "ws1",
      "/w/repo-feat",
    );
    expect(removeWorktree).toHaveBeenCalledWith("/w/repo-feat");
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "info",
      "Removed worktree repo-feat",
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(dirty).toBe(1);
  });

  it("skips the success toast when the manager is open", async () => {
    const ctx = mockCtx({ confirms: [true], managerOpen: true });
    expect(isWorktreeManagerOpen()).toBe(true);
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(vi.fn(async () => {})),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError: vi.fn(),
    });
    expect(ctx.ui.notify).not.toHaveBeenCalled();
  });

  it("force-confirms dirty trees and leaves the folder closed if force is declined", async () => {
    const removeWorktree = vi.fn(async () => {
      throw new Error("contains modified or untracked files, use --force");
    });
    const ctx = mockCtx({ confirms: [true, false] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError: vi.fn(),
    });
    expect(ctx.workspaces.removeFolder).toHaveBeenCalled();
    expect(removeWorktree).toHaveBeenCalledTimes(1);
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("force-removes after a second confirm", async () => {
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("contains modified or untracked files, use --force"),
      )
      .mockResolvedValueOnce(undefined);
    const ctx = mockCtx({ confirms: [true, true] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError: vi.fn(),
    });
    expect(removeWorktree).toHaveBeenLastCalledWith("/w/repo-feat", true);
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("removes a known-locked worktree on one confirm, unlocking without asking again", async () => {
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError("pinned by CI"))
      .mockResolvedValueOnce(undefined);
    const unlockWorktree = vi.fn(async () => {});
    const ctx = mockCtx({ confirms: [true] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree, vi.fn(), unlockWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError: vi.fn(),
    });
    // The whole point: the lock costs no extra prompt. One dialog, and no
    // fallback confirm behind it. (What that dialog *says* is the model's
    // job — see remove-worktree-model.test.ts.)
    expect(ctx.ui.showModal).toHaveBeenCalledTimes(1);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(unlockWorktree).toHaveBeenCalledWith("/w/repo-feat");
    // Unlocking is not itself a reason to force — the retry is a plain remove.
    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(removeWorktree).toHaveBeenLastCalledWith("/w/repo-feat");
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("never unlocks when the row's lock is stale and git doesn't refuse", async () => {
    // `locked` came from a list read before someone else unlocked it. Waiting
    // for git's refusal means the flow writes nothing it doesn't have to.
    const removeWorktree = vi.fn(async () => {});
    const unlockWorktree = vi.fn(async () => {});
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true] }),
      store: fakeStore(removeWorktree, vi.fn(), unlockWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError: vi.fn(),
    });
    expect(unlockWorktree).not.toHaveBeenCalled();
    expect(removeWorktree).toHaveBeenCalledExactlyOnceWith("/w/repo-feat");
  });

  it("touches nothing when the locked worktree's confirm is declined", async () => {
    const removeWorktree = vi.fn(async () => {});
    const unlockWorktree = vi.fn(async () => {});
    const notifyError = vi.fn();
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [false] }),
      store: fakeStore(removeWorktree, vi.fn(), unlockWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      locked: "pinned by CI",
      notifyError,
    });
    expect(unlockWorktree).not.toHaveBeenCalled();
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("removes a locked, dirty worktree with one dialog and no force prompt", async () => {
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError("pinned by CI"))
      .mockResolvedValueOnce(undefined);
    const unlockWorktree = vi.fn(async () => {});
    const ctx = mockCtx({ confirms: [true] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(
        removeWorktree,
        vi.fn(),
        unlockWorktree,
        undefined,
        dirtyStatus,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError: vi.fn(),
    });
    // The file list was on screen when they confirmed, so the removal starts
    // forced — asking again would be asking twice for the same answer.
    expect(ctx.ui.showModal).toHaveBeenCalledTimes(1);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(removeWorktree).toHaveBeenNthCalledWith(1, "/w/repo-feat", true);
    expect(unlockWorktree).toHaveBeenCalledTimes(1);
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("still force-prompts for changes the dialog couldn't see", async () => {
    // Unreadable status (or work saved after the dialog opened) — git's
    // refusal is the first anyone hears of the changes, so it asks.
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(
        new Error("contains modified or untracked files, use --force"),
      )
      .mockResolvedValueOnce(undefined);
    const ctx = mockCtx({ confirms: [true, true] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(
        removeWorktree,
        vi.fn(),
        undefined,
        undefined,
        unreadableStatus,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError: vi.fn(),
    });
    expect(ctx.ui.showModal).toHaveBeenCalledTimes(1);
    expect(ctx.ui.confirm).toHaveBeenCalledTimes(1);
    expect(removeWorktree).toHaveBeenLastCalledWith("/w/repo-feat", true);
  });

  it("restores the lock, reason and all, when the force confirm is declined", async () => {
    // git checks the lock before the working tree, so a locked+dirty worktree
    // can only reach the force confirm unlocked. Backing out there must not
    // cost the lock — nobody agreed to leave the worktree behind unprotected.
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError("pinned by CI"))
      .mockRejectedValueOnce(
        new Error("contains modified or untracked files, use --force"),
      );
    const lockWorktree = vi.fn(async () => {});
    let dirty = 0;
    const stop = subscribeWorktreeListDirty(() => {
      dirty += 1;
    });
    const notifyError = vi.fn();
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true, false] }),
      store: fakeStore(
        removeWorktree,
        vi.fn(),
        vi.fn(async () => {}),
        lockWorktree,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError,
    });
    stop();
    expect(lockWorktree).toHaveBeenCalledExactlyOnceWith(
      "/w/repo-feat",
      "pinned by CI",
    );
    expect(notifyError).not.toHaveBeenCalled();
    // Once for the unlock, once for the restore — the badge goes and comes back.
    expect(dirty).toBe(2);
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("restores a reasonless lock without inventing a reason", async () => {
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError())
      .mockRejectedValueOnce(
        new Error("contains modified or untracked files, use --force"),
      );
    const lockWorktree = vi.fn(async () => {});
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true, false] }),
      store: fakeStore(
        removeWorktree,
        vi.fn(),
        vi.fn(async () => {}),
        lockWorktree,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "",
      notifyError: vi.fn(),
    });
    expect(lockWorktree).toHaveBeenCalledExactlyOnceWith("/w/repo-feat");
  });

  it("restores the lock when the removal fails outright", async () => {
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError("pinned by CI"))
      .mockRejectedValueOnce(new Error("disk full"));
    const lockWorktree = vi.fn(async () => {});
    const notifyError = vi.fn();
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true] }),
      store: fakeStore(
        removeWorktree,
        vi.fn(),
        vi.fn(async () => {}),
        lockWorktree,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError,
    });
    expect(lockWorktree).toHaveBeenCalledExactlyOnceWith(
      "/w/repo-feat",
      "pinned by CI",
    );
    // The removal failure is reported; the restore is silent when it works.
    expect(notifyError).toHaveBeenCalledTimes(1);
  });

  it("leaves the lock off after a successful removal", async () => {
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError("pinned by CI"))
      .mockResolvedValueOnce(undefined);
    const lockWorktree = vi.fn(async () => {});
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true] }),
      store: fakeStore(
        removeWorktree,
        vi.fn(),
        vi.fn(async () => {}),
        lockWorktree,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError: vi.fn(),
    });
    expect(lockWorktree).not.toHaveBeenCalled();
  });

  it("reports a failed restore — the worktree is left unlocked either way", async () => {
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError("pinned by CI"))
      .mockRejectedValueOnce(
        new Error("contains modified or untracked files, use --force"),
      );
    const lockWorktree = vi.fn(async () => {
      throw new Error("fatal: '/w/repo-feat' is already locked");
    });
    const notifyError = vi.fn();
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true, false] }),
      store: fakeStore(
        removeWorktree,
        vi.fn(),
        vi.fn(async () => {}),
        lockWorktree,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError,
    });
    expect(notifyError).toHaveBeenCalledExactlyOnceWith(
      'Could not restore the lock on "repo-feat"',
      expect.any(Error),
    );
  });

  it("reports why the unlock failed, not git's refusal to remove", async () => {
    const removeWorktree = vi.fn(async () => {
      throw lockedError("pinned by CI");
    });
    const unlockError = new Error("EACCES: .git/worktrees/repo-feat/locked");
    const unlockWorktree = vi.fn(async () => {
      throw unlockError;
    });
    const notifyError = vi.fn();
    const ctx = mockCtx({ confirms: [true] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree, vi.fn(), unlockWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      locked: "pinned by CI",
      notifyError,
    });
    // The unlock was already authorized, so a still-locked tree is reported —
    // never re-prompted for the same decision — and the toast names the step
    // that actually broke rather than its downstream symptom.
    expect(ctx.ui.showModal).toHaveBeenCalledTimes(1);
    expect(ctx.ui.confirm).not.toHaveBeenCalled();
    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(notifyError).toHaveBeenCalledExactlyOnceWith(
      'Remove "repo-feat" failed',
      unlockError,
    );
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("falls back to a confirm for a lock applied after the list was read", async () => {
    // No `locked` — the row was drawn before someone locked the worktree, so
    // git's refusal is the first anyone hears of it.
    const removeWorktree = vi
      .fn()
      .mockRejectedValueOnce(lockedError("pinned by CI"))
      .mockResolvedValueOnce(undefined);
    const unlockWorktree = vi.fn(async () => {});
    const ctx = mockCtx({ confirms: [true, true] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree, vi.fn(), unlockWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError: vi.fn(),
    });
    expect(ctx.ui.confirm).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: '"repo-feat" is locked',
        body: expect.stringContaining("pinned by CI"),
      }),
    );
    expect(unlockWorktree).toHaveBeenCalledWith("/w/repo-feat");
    expect(removeWorktree).toHaveBeenCalledTimes(2);
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("treats an already-deregistered worktree as removed instead of erroring", async () => {
    const removeWorktree = vi.fn(async () => {
      throw new Error("fatal: '/w/repo-feat' is not a working tree");
    });
    const notifyError = vi.fn();
    const ctx = mockCtx({ confirms: [true] });
    const onSuccess = vi.fn();
    let dirty = 0;
    const stop = subscribeWorktreeListDirty(() => {
      dirty += 1;
    });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(removeWorktree),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError,
      onSuccess,
    });
    stop();
    expect(notifyError).not.toHaveBeenCalled();
    expect(removeWorktree).toHaveBeenCalledTimes(1);
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "info",
      "repo-feat was already removed",
    );
    expect(onSuccess).toHaveBeenCalled();
    expect(dirty).toBe(1);
  });

  it("notifies on failure and clears pending", async () => {
    const notifyError = vi.fn();
    const ctx = mockCtx({ confirms: [true] });
    await confirmAndRemoveWorktree({
      ctx,
      store: fakeStore(
        vi.fn(async () => {
          throw new Error("disk full");
        }),
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError,
    });
    expect(notifyError).toHaveBeenCalled();
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("disposes the store on every exit path — cancel, success, and failure", async () => {
    // GitView's "Remove worktree…" resolves a fresh watchRepo() store just for
    // this call and relies on confirmAndRemoveWorktree to release it — dispose()
    // is a safe no-op for a store still owned elsewhere (see repo-tracker.ts).
    const cancelDispose = vi.fn();
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [false] }),
      store: fakeStore(vi.fn(), cancelDispose),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError: vi.fn(),
    });
    expect(cancelDispose).toHaveBeenCalledTimes(1);

    const successDispose = vi.fn();
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true] }),
      store: fakeStore(
        vi.fn(async () => {}),
        successDispose,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError: vi.fn(),
    });
    expect(successDispose).toHaveBeenCalledTimes(1);

    const failureDispose = vi.fn();
    await confirmAndRemoveWorktree({
      ctx: mockCtx({ confirms: [true] }),
      store: fakeStore(
        vi.fn(async () => {
          throw new Error("disk full");
        }),
        failureDispose,
      ),
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError: vi.fn(),
    });
    expect(failureDispose).toHaveBeenCalledTimes(1);
  });
});
