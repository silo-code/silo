import { normalizeFolderPath } from "./worktree-model";
import {
  isPathPendingRemove,
  pendingRemoveStatusLabel,
  worktreeDisplayName,
  type PendingWorktreeRemove,
} from "./pending-worktree-remove-model";

// Extension-scoped pending Remove worktree set (ADR 0025). Outlives the
// worktree manager modal so dismiss-and-reopen still shows Removing… rows and
// busy status stays accurate (RFC 0026 host slot).

let pending: PendingWorktreeRemove[] = [];
/** Nested showModal depth for the worktree manager (usually 0 or 1). */
let managerOpenDepth = 0;
const listeners = new Set<() => void>();
/** Open WorktreeManager instances reload when a remove succeeds anywhere. */
const listDirtyListeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

// Serialize the actual `git worktree remove` executions. Removing several open
// worktrees at once (each a `git worktree remove --force`, i.e. an rm -rf of a
// full working tree) otherwise fires N concurrent removals; on large trees that
// stacks each removal's refresh/status work and starves the UI thread for the
// duration — the multi-worktree "app froze" case. Confirms and pending-state
// updates stay immediate (so "Removing N worktrees…" shows right away); only
// the disk-deleting git call is queued, draining one at a time.
let removalChain: Promise<unknown> = Promise.resolve();

/**
 * Run `task` after any already-queued worktree removals settle, so at most one
 * `git worktree remove` executes at a time. Resolves/rejects with `task`'s own
 * outcome; a failing task never breaks the chain for the ones behind it.
 */
export function enqueueWorktreeRemoval<T>(task: () => Promise<T>): Promise<T> {
  const result = removalChain.then(task, task);
  removalChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Subscribe to pending-remove / manager-open changes (for StatusBar + modal). */
export function subscribePendingWorktreeRemoves(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Subscribe so an open manager reloads after a successful remove (including
 * removes started from the Git view while the manager stays open).
 * Returns an unsubscribe — callers must dispose (e.g. effect cleanup).
 */
export function subscribeWorktreeListDirty(listener: () => void): () => void {
  listDirtyListeners.add(listener);
  return () => {
    listDirtyListeners.delete(listener);
  };
}

/** Notify open managers that the worktree list may have changed on disk. */
export function markWorktreeListDirty(): void {
  for (const listener of [...listDirtyListeners]) listener();
}

/** Snapshot of in-flight removes (stable order: insertion). */
export function getPendingWorktreeRemoves(): readonly PendingWorktreeRemove[] {
  return pending;
}

export function getPendingRemoveStatusLabel(): string | null {
  return pendingRemoveStatusLabel(pending);
}

export function isWorktreeRemovePending(worktreePath: string): boolean {
  return isPathPendingRemove(worktreePath, pending);
}

export function isWorktreeManagerOpen(): boolean {
  return managerOpenDepth > 0;
}

/**
 * Mark the worktree manager modal open until the returned disposer runs
 * (typically when `showModal` settles).
 */
export function markWorktreeManagerOpen(): () => void {
  managerOpenDepth += 1;
  emit();
  let closed = false;
  return () => {
    if (closed) return;
    closed = true;
    managerOpenDepth = Math.max(0, managerOpenDepth - 1);
    emit();
  };
}

/** Begin a pending remove (busy status + row chrome). Idempotent per path. */
export function beginPendingWorktreeRemove(worktreePath: string): void {
  if (isPathPendingRemove(worktreePath, pending)) return;
  pending = [
    ...pending,
    {
      path: normalizeFolderPath(worktreePath),
      name: worktreeDisplayName(worktreePath),
    },
  ];
  emit();
}

/** Clear a path from the pending set (success or failure). */
export function endPendingWorktreeRemove(worktreePath: string): void {
  const key = normalizeFolderPath(worktreePath);
  const next = pending.filter((p) => p.path !== key);
  if (next.length === pending.length) return;
  pending = next;
  emit();
}

/** Test helper — reset module state between unit tests. */
export function resetPendingWorktreeRemovesForTests(): void {
  pending = [];
  managerOpenDepth = 0;
  listeners.clear();
  listDirtyListeners.clear();
  removalChain = Promise.resolve();
}
