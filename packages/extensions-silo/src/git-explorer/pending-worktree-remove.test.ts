import { describe, it, expect, beforeEach } from "vitest";
import {
  beginPendingWorktreeRemove,
  endPendingWorktreeRemove,
  enqueueWorktreeRemoval,
  getPendingRemoveStatusLabel,
  getPendingWorktreeRemoves,
  isWorktreeManagerOpen,
  isWorktreeRemovePending,
  markWorktreeListDirty,
  markWorktreeManagerOpen,
  resetPendingWorktreeRemovesForTests,
  subscribePendingWorktreeRemoves,
  subscribeWorktreeListDirty,
} from "./pending-worktree-remove";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

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

  it("notifies list-dirty listeners and stops after unsubscribe", () => {
    let dirty = 0;
    const stop = subscribeWorktreeListDirty(() => {
      dirty += 1;
    });
    markWorktreeListDirty();
    markWorktreeListDirty();
    expect(dirty).toBe(2);
    stop();
    markWorktreeListDirty();
    expect(dirty).toBe(2);
  });

  it("serializes queued removals — one runs at a time, in order", async () => {
    const order: string[] = [];
    let releaseA!: () => void;
    const a = enqueueWorktreeRemoval(async () => {
      order.push("A:start");
      await new Promise<void>((r) => (releaseA = r));
      order.push("A:end");
    });
    const b = enqueueWorktreeRemoval(async () => {
      order.push("B:start");
    });
    // A is in-flight (awaiting release); B must not have started yet.
    await tick();
    expect(order).toEqual(["A:start"]);
    releaseA();
    await Promise.all([a, b]);
    expect(order).toEqual(["A:start", "A:end", "B:start"]);
  });

  it("a failing removal rejects its own caller but not the ones behind it", async () => {
    const a = enqueueWorktreeRemoval(async () => {
      throw new Error("boom");
    });
    const b = enqueueWorktreeRemoval(async () => "ok");
    await expect(a).rejects.toThrow("boom");
    await expect(b).resolves.toBe("ok");
  });
});
