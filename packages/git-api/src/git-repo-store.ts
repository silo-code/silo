import type { Disposable, Event } from "@silo-code/sdk";
import type { GitAPI, GitStatus, GitWorktree } from "./git-api";

// The live, subscribable counterpart to GitAPI's one-shot reads (ADR 0037).
// GitAPI.watchRepo(cwd) returns one of these per repo working directory,
// shared and ref-counted across every caller naming the same cwd — GitView,
// WorktreeManager, BranchManager, and any first- or third-party extension all
// consume the identical seam via ctx.getExtension<GitAPI>("silo.git").

/** Live, combined read model for one repo working directory. */
export interface GitRepoSnapshot {
  /** `GitAPI.status`'s result; `null` until the first read completes. */
  status: GitStatus | null;
  /** `GitAPI.worktrees`'s result; `null` until the first read completes. */
  worktrees: GitWorktree[] | null;
  /** True while a read triggered by `refresh()` or a watched change is in flight. */
  loading: boolean;
  /**
   * The most recent background read's failure, or `null` after success.
   * Informational only — `status`/`worktrees` keep their last-known-good
   * value on error, they're never cleared just because a poll failed.
   */
  error: { op: "status" | "worktrees"; cause: unknown } | null;
}

/**
 * One repo's live status + worktrees, plus the mutating `GitAPI` calls that
 * act on it. Matches `ReactiveService<GitRepoSnapshot>`
 * (`@silo-code/sdk`'s `useServiceState` contract) — pass it straight in.
 *
 * Freshness is owned by the tracker behind `GitAPI.watchRepo(cwd)`, not by
 * this handle's lifetime: for a `cwd` inside an open workspace folder,
 * watching continues for as long as that workspace is open, independent of
 * whether any UI ever calls `watchRepo` for it. `getState()`/`subscribe()`
 * never perform I/O; the tracker performs one automatic initial read when
 * first created.
 */
export interface GitRepoStore {
  getState(): GitRepoSnapshot;
  subscribe(listener: (s: GitRepoSnapshot) => void): Disposable;
  /**
   * Force an out-of-band re-read now (e.g. a manual Refresh button).
   * Coalesces with any read already in flight or scheduled — never a second
   * concurrent `git status`.
   */
  refresh(): Promise<void>;

  /**
   * Fires when `worktrees` gains an entry not present in the previous
   * snapshot (e.g. `git worktree add` run from a terminal by a coding
   * agent). Replaces the old `notify-new-worktree.ts` diff-watcher.
   */
  readonly onWorktreeAdded: Event<GitWorktree>;
  /** Fires when `worktrees` loses an entry present in the previous snapshot. */
  readonly onWorktreeRemoved: Event<GitWorktree>;
  /**
   * Fires when `cwd` itself stops existing on disk (as opposed to existing
   * but not being a git repo) — e.g. a workspace folder or worktree deleted
   * outside Silo. Replaces the old `notify-missing-folder.ts` diff-watcher.
   */
  readonly onFolderMissing: Event<void>;

  // Mutators: identical contract to the matching GitAPI method (same params,
  // same rejection), minus `cwd`. Each: (a) auto-refreshes on success, (b)
  // has the watch-triggered refresh suppressed for its duration so a
  // commit's pre-commit hooks can't double-refresh mid-mutation, (c)
  // serializes with any other mutator call on the same store (one `git`
  // write at a time — the index lock would fail concurrent ones anyway).
  stage(paths: string[]): Promise<void>;
  unstage(paths: string[]): Promise<void>;
  commit(message: string): Promise<void>;
  revertFile(paths: string[]): Promise<void>;
  clean(paths: string[]): Promise<void>;
  push(options?: Parameters<GitAPI["push"]>[1]): Promise<void>;
  pull(): Promise<void>;
  fetch(prune?: boolean): Promise<void>;
  switchBranch(name: string): Promise<void>;
  createBranch(name: string, startPoint?: string): Promise<void>;
  deleteBranch(name: string, force?: boolean): Promise<void>;
  renameBranch(oldName: string, newName: string): Promise<void>;
  addWorktree(
    path: string,
    options: Parameters<GitAPI["addWorktree"]>[2],
  ): Promise<void>;
  /**
   * Also marks `path` "removal in progress" internally so a refresh racing
   * the `rm -rf` (thousands of spurious "deleted" entries) is skipped — the
   * correctness half of the old `pending-worktree-remove.ts` guard, now
   * generic to any caller instead of one wired through git-explorer's UI.
   */
  removeWorktree(path: string, force?: boolean): Promise<void>;
  lockWorktree(path: string, reason?: string): Promise<void>;
  unlockWorktree(path: string): Promise<void>;
  pruneWorktrees(): Promise<void>;

  /**
   * The one-shot `GitAPI` methods this store doesn't cover (log, diff, show,
   * branches, commitDetail, unmergedCommits, branchBase, isBinaryDiff).
   * Deliberately excludes `watchRepo` itself — to watch a *different* repo,
   * go back through `ctx.getExtension<GitAPI>("silo.git")?.api.watchRepo(...)`
   * rather than this store's escape hatch, so a `GitRepoStore`'s lifetime
   * never has to depend on the provider's own construction order.
   */
  readonly api: Omit<GitAPI, "watchRepo">;
  readonly cwd: string;

  /**
   * Explicit "I'm done" signal, for the advanced case only: a `cwd` outside
   * any open workspace, read via `getState()` without ever calling
   * `subscribe()`. Idempotent; a no-op whenever the tracker is still kept
   * alive by workspace ownership or an active subscriber.
   *
   * The common case needs no call to this at all — `watchRepo(cwd)` is safe
   * to call every render without `useMemo` (it never allocates on repeat
   * calls for the same `cwd`), and pairing it with `subscribe()` (directly,
   * or via `useServiceState`) already ties teardown to the subscription's
   * own lifetime, the same way any other `ReactiveService` does.
   */
  dispose(): void;
}

const EMPTY_SNAPSHOT: GitRepoSnapshot = {
  status: null,
  worktrees: null,
  loading: false,
  error: null,
};

const NOOP_DISPOSABLE: Disposable = { dispose: () => {} };
const NOOP_EVENT: Event<never> = () => NOOP_DISPOSABLE;

function unavailable(): Promise<never> {
  return Promise.reject(new Error("Git provider (silo.git) unavailable."));
}

const NULL_GIT_API: GitAPI = {
  status: unavailable,
  log: unavailable,
  commitCount: unavailable,
  diff: unavailable,
  stage: unavailable,
  unstage: unavailable,
  commit: unavailable,
  show: unavailable,
  revertFile: unavailable,
  clean: unavailable,
  push: unavailable,
  branches: unavailable,
  fetch: unavailable,
  pull: unavailable,
  switchBranch: unavailable,
  createBranch: unavailable,
  deleteBranch: unavailable,
  renameBranch: unavailable,
  unmergedCommits: unavailable,
  branchBase: unavailable,
  commitDetail: unavailable,
  isBinaryDiff: unavailable,
  remotes: unavailable,
  worktrees: unavailable,
  addWorktree: unavailable,
  removeWorktree: unavailable,
  lockWorktree: unavailable,
  unlockWorktree: unavailable,
  pruneWorktrees: unavailable,
  watchRepo: () => NULL_GIT_REPO_STORE,
};

/**
 * A safe, always-present fallback for the one place a caller needs a
 * null-check: `ctx.getExtension<GitAPI>("silo.git")?.api` can itself be
 * `undefined` (the provider disabled or not yet activated) — `watchRepo`
 * itself never returns `undefined` once a real `GitAPI` exists. `status`/
 * `worktrees` read `null`, `loading` reads `false`, every mutator and every
 * `GitAPI` method reached through `.api` rejects with "Git provider
 * (silo.git) unavailable." — the same message this scenario already shows
 * elsewhere in the app today.
 *
 * ```ts
 * const repo = ctx.getExtension<GitAPI>("silo.git")?.api?.watchRepo(folder)
 *   ?? NULL_GIT_REPO_STORE;
 * const { status, worktrees } = useServiceState(repo);
 * ```
 */
export const NULL_GIT_REPO_STORE: GitRepoStore = {
  getState: () => EMPTY_SNAPSHOT,
  subscribe: () => NOOP_DISPOSABLE,
  refresh: unavailable,
  onWorktreeAdded: NOOP_EVENT,
  onWorktreeRemoved: NOOP_EVENT,
  onFolderMissing: NOOP_EVENT,
  stage: unavailable,
  unstage: unavailable,
  commit: unavailable,
  revertFile: unavailable,
  clean: unavailable,
  push: unavailable,
  pull: unavailable,
  fetch: unavailable,
  switchBranch: unavailable,
  createBranch: unavailable,
  deleteBranch: unavailable,
  renameBranch: unavailable,
  addWorktree: unavailable,
  removeWorktree: unavailable,
  lockWorktree: unavailable,
  unlockWorktree: unavailable,
  pruneWorktrees: unavailable,
  api: NULL_GIT_API,
  cwd: "",
  dispose: () => {},
};
