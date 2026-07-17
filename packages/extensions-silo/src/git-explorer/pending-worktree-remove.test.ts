import { describe, it, expect, beforeEach } from "vitest";
import {
  beginPendingWorktreeRemove,
  endPendingWorktreeRemove,
  getPendingRemoveStatusLabel,
  getPendingWorktreeRemoves,
  isWorktreeManagerOpen,
  isWorktreeRemovePending,
  markWorktreeManagerOpen,
  resetPendingWorktreeRemovesForTests,
  subscribePendingWorktreeRemoves,
} from "./pending-worktree-remove";

describe("pending-worktree-remove store", () => {
  beforeEach(() => {
    resetPendingWorktreeRemovesForTests();
  });

  it("tracks concurrent pending paths and aggregates the StatusBar label", () => {
    beginPendingWorktreeRemove("/w/repo-feat");
    expect(isWorktreeRemovePending("/w/repo-feat/")).toBe(true);
    expect(getPendingRemoveStatusLabel()).toBe("Removing repo-feat…");

    beginPendingWorktreeRemove("/w/repo-other");
    expect(getPendingWorktreeRemoves()).toHaveLength(2);
    expect(getPendingRemoveStatusLabel()).toBe("Removing 2 worktrees…");

    endPendingWorktreeRemove("/w/repo-feat");
    expect(getPendingRemoveStatusLabel()).toBe("Removing repo-other…");
    endPendingWorktreeRemove("/w/repo-other");
    expect(getPendingRemoveStatusLabel()).toBeNull();
  });

  it("notifies subscribers on begin/end and manager open", () => {
    let ticks = 0;
    const stop = subscribePendingWorktreeRemoves(() => {
      ticks += 1;
    });
    beginPendingWorktreeRemove("/w/a");
    const close = markWorktreeManagerOpen();
    expect(isWorktreeManagerOpen()).toBe(true);
    close();
    expect(isWorktreeManagerOpen()).toBe(false);
    endPendingWorktreeRemove("/w/a");
    stop();
    expect(ticks).toBeGreaterThanOrEqual(4);
  });
});
