import type { ExtensionContext } from "@silo-code/sdk";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { confirmAndRemoveWorktree } from "./confirm-and-remove-worktree";
import {
  getPendingWorktreeRemoves,
  isWorktreeManagerOpen,
  markWorktreeManagerOpen,
  resetPendingWorktreeRemovesForTests,
} from "./pending-worktree-remove";
import type { GitAPI } from "../git/git-api";

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

describe("confirmAndRemoveWorktree", () => {
  beforeEach(() => {
    resetPendingWorktreeRemovesForTests();
  });

  it("no-ops when the user cancels the first confirm", async () => {
    const removeWorktree = vi.fn();
    const ctx = mockCtx({ confirms: [false] });
    await confirmAndRemoveWorktree({
      ctx,
      api: { removeWorktree } as unknown as GitAPI,
      cwd: "/w/repo",
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError: vi.fn(),
    });
    expect(removeWorktree).not.toHaveBeenCalled();
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("closes the folder on start, clears pending on success, toasts when manager closed", async () => {
    const removeWorktree = vi.fn(async () => {});
    const ctx = mockCtx({ confirms: [true] });
    const onSuccess = vi.fn();
    await confirmAndRemoveWorktree({
      ctx,
      api: { removeWorktree } as unknown as GitAPI,
      cwd: "/w/repo",
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: true,
      notifyError: vi.fn(),
      onSuccess,
    });
    expect(ctx.workspaces.removeFolder).toHaveBeenCalledWith(
      "ws1",
      "/w/repo-feat",
    );
    expect(removeWorktree).toHaveBeenCalledWith("/w/repo", "/w/repo-feat");
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "info",
      "Removed worktree repo-feat",
    );
    expect(onSuccess).toHaveBeenCalled();
  });

  it("skips the success toast when the manager is open", async () => {
    const ctx = mockCtx({ confirms: [true], managerOpen: true });
    expect(isWorktreeManagerOpen()).toBe(true);
    await confirmAndRemoveWorktree({
      ctx,
      api: { removeWorktree: vi.fn(async () => {}) } as unknown as GitAPI,
      cwd: "/w/repo",
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
      api: { removeWorktree } as unknown as GitAPI,
      cwd: "/w/repo",
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
      api: { removeWorktree } as unknown as GitAPI,
      cwd: "/w/repo",
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError: vi.fn(),
    });
    expect(removeWorktree).toHaveBeenLastCalledWith(
      "/w/repo",
      "/w/repo-feat",
      true,
    );
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });

  it("notifies on failure and clears pending", async () => {
    const notifyError = vi.fn();
    const ctx = mockCtx({ confirms: [true] });
    await confirmAndRemoveWorktree({
      ctx,
      api: {
        removeWorktree: vi.fn(async () => {
          throw new Error("disk full");
        }),
      } as unknown as GitAPI,
      cwd: "/w/repo",
      worktreePath: "/w/repo-feat",
      workspaceId: "ws1",
      isOpen: false,
      notifyError,
    });
    expect(notifyError).toHaveBeenCalled();
    expect(getPendingWorktreeRemoves()).toHaveLength(0);
  });
});
