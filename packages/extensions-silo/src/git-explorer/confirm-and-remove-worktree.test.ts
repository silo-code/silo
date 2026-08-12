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
): GitRepoStore {
  return { removeWorktree } as unknown as GitRepoStore;
}

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
});
