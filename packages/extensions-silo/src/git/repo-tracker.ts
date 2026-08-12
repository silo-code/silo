import type { Disposable, Event, Workspace } from "@silo-code/sdk";
import type {
  GitAPI,
  GitRepoSnapshot,
  GitRepoStore,
  GitWorktree,
} from "@silo-code/git-api";
import { samePath } from "./worktree-utils";
import { realClock, type ClockPort } from "./clock";

/** The narrow slice of `ctx.workspaces` the tracker registry actually reads —
 *  which folders are open and which workspace is active — so tests (and any
 *  other future caller) don't need to satisfy the full `WorkspaceService`
 *  interface. The real `ctx.workspaces` already satisfies this structurally. */
export interface WorkspaceActivationState {
  open: readonly Pick<Workspace, "id" | "folder" | "extraFolders">[];
  activeId: string | null;
}
export interface WorkspaceActivationSource {
  getState(): WorkspaceActivationState;
  subscribe(listener: (s: WorkspaceActivationState) => void): Disposable;
}

// The live-session tracker behind GitAPI.watchRepo (ADR 0037). One Tracker
// per physical repo path, shared and ref-counted across every caller naming
// the same `cwd` — GitView, WorktreeManager, BranchManager, and any first- or
// third-party extension all resolve to the identical object. Ambient,
// workspace-activation-driven lifecycle (see `reconcile`) is what fixes the
// original bug this decision exists for: a folder is watched from the moment
// its workspace opens, independent of whether any UI panel is ever mounted.

const DEBOUNCE_MS = 400;
// Matches VS Code's git.autofetchPeriod; only runs for the active workspace's
// folders (see `recomputeAutofetch`) — background workspaces keep the cheap
// fs-watch but don't autofetch, to avoid N parallel `git fetch`es across
// "keep all your projects alive at once."
const AUTOFETCH_INTERVAL_MS = 180_000;

type OneShotGitApi = Omit<GitAPI, "watchRepo">;
type FilesWatch = (path: string, listener: () => void) => Disposable;

const EMPTY_SNAPSHOT: GitRepoSnapshot = {
  status: null,
  worktrees: null,
  loading: false,
  error: null,
};

/** The narrow slice of `ctx.log` the registry needs, for tracker-lifecycle
 *  diagnostics — reuses `silo.git`'s existing Output channel rather than a
 *  new one. */
export interface DebugLog {
  debug(message: string): void;
}
const noopLog: DebugLog = { debug: () => {} };

/** One tracker's live state, for `debugSnapshot()` — answers "how many repos
 *  are actually being watched right now, and why is each one still alive." */
export interface TrackerDiagnostics {
  cwd: string;
  /** Alive because an open workspace references this folder. */
  workspaceOwned: boolean;
  /** Alive because something is actively subscribed (independent of
   *  workspace ownership — see `maybeTeardown`). */
  subscriberCount: number;
  /** Whether this repo's folder belongs to the currently *active* workspace
   *  (the only ones that autofetch — see `recomputeAutofetch`). */
  autofetching: boolean;
}

interface Tracker {
  cwd: string;
  snapshot: GitRepoSnapshot;
  listeners: Set<(s: GitRepoSnapshot) => void>;
  addedListeners: Set<(wt: GitWorktree) => void>;
  removedListeners: Set<(wt: GitWorktree) => void>;
  missingListeners: Set<() => void>;
  fsWatch: Disposable | null;
  debounceId: number | null;
  autofetchId: number | null;
  /** >0 while a mutator is in flight — a debounce fire checks this and skips
   *  itself, deferring to the mutator's own trailing refresh. */
  suppressCount: number;
  inFlightRead: Promise<void> | null;
  /** A refresh was requested while one was already in flight — run once more
   *  after the in-flight one settles, instead of stacking concurrent reads. */
  queuedRead: boolean;
  /** Serializes mutating calls on this tracker — one `git` write at a time. */
  mutationTail: Promise<unknown>;
  workspaceOwned: boolean;
  store: GitRepoStore;
}

/**
 * Diff `next` against `prev` for worktrees that appeared or disappeared.
 * Bare and prunable entries are excluded from `added` — a prunable entry's
 * directory is already gone, so there's nothing new to react to (mirrors the
 * old `newlyCreatedWorktrees` helper's filtering).
 */
function diffWorktrees(
  prev: GitWorktree[] | null,
  next: GitWorktree[],
): { added: GitWorktree[]; removed: GitWorktree[] } {
  const prevList = prev ?? [];
  const added = next.filter(
    (wt) =>
      !wt.bare &&
      wt.prunable == null &&
      !prevList.some((p) => samePath(p.path, wt.path)),
  );
  const removed = prevList.filter(
    (p) => !next.some((wt) => samePath(wt.path, p.path)),
  );
  return { added, removed };
}

function makeEvent<T>(listeners: Set<(e: T) => void>): Event<T> {
  return (listener) => {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  };
}

export function createGitRepoTrackerRegistry(deps: {
  api: OneShotGitApi;
  workspaces: WorkspaceActivationSource;
  filesWatch: FilesWatch;
  clock?: ClockPort;
  log?: DebugLog;
}): {
  watchRepo(cwd: string): GitRepoStore;
  /** A snapshot of every currently-live tracker, for spot-checking that
   *  long-running usage isn't accumulating trackers it should have torn
   *  down (e.g. via a periodic "Git: Log Watch Session Diagnostics" command
   *  — see git/index.ts). */
  debugSnapshot(): TrackerDiagnostics[];
  dispose(): void;
} {
  const { api, workspaces, filesWatch } = deps;
  const clock = deps.clock ?? realClock;
  const log = deps.log ?? noopLog;
  const trackers = new Map<string, Tracker>();
  // Paths mid `git worktree remove` — a refresh racing the `rm -rf` (thousands
  // of spurious "deleted" entries) is what caused the v0.38 UI freeze; skip
  // reads against a path in here entirely, for whichever tracker owns it.
  const pendingRemoval = new Set<string>();

  function runRead(tracker: Tracker): Promise<void> {
    if (pendingRemoval.has(tracker.cwd)) return Promise.resolve();
    if (tracker.inFlightRead) {
      tracker.queuedRead = true;
      return tracker.inFlightRead;
    }
    tracker.snapshot = { ...tracker.snapshot, loading: true };
    notify(tracker);
    const read = Promise.allSettled([
      api.status(tracker.cwd),
      api.worktrees(tracker.cwd),
    ]).then(([statusResult, worktreesResult]) => {
      const prevWorktrees = tracker.snapshot.worktrees;
      const status =
        statusResult.status === "fulfilled"
          ? statusResult.value
          : tracker.snapshot.status;
      const worktrees =
        worktreesResult.status === "fulfilled"
          ? worktreesResult.value
          : tracker.snapshot.worktrees;
      const error =
        statusResult.status === "rejected"
          ? { op: "status" as const, cause: statusResult.reason }
          : worktreesResult.status === "rejected"
            ? { op: "worktrees" as const, cause: worktreesResult.reason }
            : null;

      const wasMissing = tracker.snapshot.status?.missing === true;
      const isMissing = status?.missing === true;

      tracker.snapshot = { status, worktrees, loading: false, error };
      notify(tracker);

      // Only diff against a *previous* successful read, never the first one
      // for this tracker (prevWorktrees === null) — otherwise every
      // pre-existing worktree a repo already has would fire onWorktreeAdded
      // the moment it's first tracked (e.g. right after Silo starts), which
      // is exactly the cold-start spam this event exists to avoid.
      if (worktreesResult.status === "fulfilled" && prevWorktrees !== null) {
        const { added, removed } = diffWorktrees(
          prevWorktrees,
          worktreesResult.value,
        );
        for (const wt of added) for (const l of tracker.addedListeners) l(wt);
        for (const wt of removed)
          for (const l of tracker.removedListeners) l(wt);
      }
      if (!wasMissing && isMissing) {
        for (const l of tracker.missingListeners) l();
      }
    });
    tracker.inFlightRead = read.finally(() => {
      tracker.inFlightRead = null;
      if (tracker.queuedRead) {
        tracker.queuedRead = false;
        void runRead(tracker);
      }
    });
    return tracker.inFlightRead;
  }

  function notify(tracker: Tracker) {
    for (const l of tracker.listeners) l(tracker.snapshot);
  }

  function scheduleDebouncedRead(tracker: Tracker) {
    if (tracker.debounceId != null) clock.clearTimeout(tracker.debounceId);
    tracker.debounceId = clock.setTimeout(() => {
      tracker.debounceId = null;
      // A mutation in flight already suppresses reads and refreshes once on
      // its own when it settles — don't double up.
      if (tracker.suppressCount > 0) return;
      void runRead(tracker);
    }, DEBOUNCE_MS);
  }

  function makeMutator<Args extends unknown[]>(
    tracker: Tracker,
    fn: (...args: Args) => Promise<void>,
  ): (...args: Args) => Promise<void> {
    return (...args: Args) => {
      // Suppress synchronously, on the calling turn — not inside the queued
      // `.then` below, which only runs on a later microtask. A caller that
      // emits an fs-watch event right after calling this (e.g. a pre-commit
      // hook touching .git) must see suppression already in effect, or the
      // event slips through and schedules an unwanted debounced read before
      // this mutation's own trailing refresh ever runs.
      tracker.suppressCount++;
      if (tracker.debounceId != null) {
        clock.clearTimeout(tracker.debounceId);
        tracker.debounceId = null;
      }
      const settle = async () => {
        tracker.suppressCount--;
        await runRead(tracker);
      };
      const run = tracker.mutationTail
        .catch(() => {})
        .then(() => fn(...args))
        .then(
          async (value) => {
            await settle();
            return value;
          },
          async (err) => {
            await settle();
            throw err;
          },
        );
      tracker.mutationTail = run.catch(() => {});
      return run;
    };
  }

  // Kept alive by workspace ownership OR at least one active subscriber —
  // NOT by how many times watchRepo() has been called. watchRepo() is
  // documented as safe to call every render without useMemo (it's
  // idempotent by cwd), so it must not be what increments a ref count —
  // every re-render would otherwise "acquire" a new reference that never
  // gets released. Real callers pair watchRepo() with subscribe() (directly,
  // or via useServiceState), whose own returned Disposable already ties
  // cleanup to mount/unmount, not render count — so subscriber presence is
  // the correct, already-idiomatic proxy for "someone still wants this."
  function maybeTeardown(tracker: Tracker) {
    if (tracker.workspaceOwned || tracker.listeners.size > 0) return;
    tracker.fsWatch?.dispose();
    tracker.fsWatch = null;
    if (tracker.debounceId != null) clock.clearTimeout(tracker.debounceId);
    if (tracker.autofetchId != null) clock.clearInterval(tracker.autofetchId);
    trackers.delete(tracker.cwd);
    log.debug(
      `[watch] stopped tracking ${tracker.cwd} (${trackers.size} total)`,
    );
  }

  function getOrCreateTracker(cwd: string): Tracker {
    const existing = trackers.get(cwd);
    if (existing) return existing;

    // eslint-disable-next-line prefer-const -- store is filled in below, tracker needs it for closures
    let tracker: Tracker;
    tracker = {
      cwd,
      snapshot: EMPTY_SNAPSHOT,
      listeners: new Set(),
      addedListeners: new Set(),
      removedListeners: new Set(),
      missingListeners: new Set(),
      fsWatch: null,
      debounceId: null,
      autofetchId: null,
      suppressCount: 0,
      inFlightRead: null,
      queuedRead: false,
      mutationTail: Promise.resolve(),
      workspaceOwned: false,
      store: null as unknown as GitRepoStore, // assigned immediately below
    };
    tracker.fsWatch = filesWatch(cwd, () => {
      if (tracker.suppressCount > 0) return; // mutation owns the trailing refresh
      scheduleDebouncedRead(tracker);
    });
    tracker.store = {
      getState: () => tracker.snapshot,
      subscribe: (listener) => {
        tracker.listeners.add(listener);
        return {
          dispose: () => {
            tracker.listeners.delete(listener);
            maybeTeardown(tracker);
          },
        };
      },
      refresh: () => runRead(tracker),
      onWorktreeAdded: makeEvent(tracker.addedListeners),
      onWorktreeRemoved: makeEvent(tracker.removedListeners),
      onFolderMissing: makeEvent(tracker.missingListeners),
      stage: makeMutator(tracker, (paths: string[]) => api.stage(cwd, paths)),
      unstage: makeMutator(tracker, (paths: string[]) =>
        api.unstage(cwd, paths),
      ),
      commit: makeMutator(tracker, (message: string) =>
        api.commit(cwd, message),
      ),
      revertFile: makeMutator(tracker, (paths: string[]) =>
        api.revertFile(cwd, paths),
      ),
      clean: makeMutator(tracker, (paths: string[]) => api.clean(cwd, paths)),
      push: makeMutator(tracker, (options?: Parameters<GitAPI["push"]>[1]) =>
        api.push(cwd, options),
      ),
      pull: makeMutator(tracker, () => api.pull(cwd)),
      fetch: makeMutator(tracker, (prune?: boolean) => api.fetch(cwd, prune)),
      switchBranch: makeMutator(tracker, (name: string) =>
        api.switchBranch(cwd, name),
      ),
      createBranch: makeMutator(tracker, (name: string, startPoint?: string) =>
        api.createBranch(cwd, name, startPoint),
      ),
      deleteBranch: makeMutator(tracker, (name: string, force?: boolean) =>
        api.deleteBranch(cwd, name, force),
      ),
      renameBranch: makeMutator(tracker, (oldName: string, newName: string) =>
        api.renameBranch(cwd, oldName, newName),
      ),
      addWorktree: makeMutator(
        tracker,
        (path: string, options: Parameters<GitAPI["addWorktree"]>[2]) =>
          api.addWorktree(cwd, path, options),
      ),
      removeWorktree: (() => {
        const mutator = makeMutator(
          tracker,
          async (path: string, force?: boolean) => {
            try {
              await api.removeWorktree(cwd, path, force);
            } finally {
              pendingRemoval.delete(path);
            }
          },
        );
        // pendingRemoval must be set synchronously, on the calling turn —
        // same reasoning as suppressCount in makeMutator — so a refresh
        // racing this call (even one issued on the very next microtask,
        // e.g. by another tracker for the same path) is already guarded.
        return (path: string, force?: boolean) => {
          pendingRemoval.add(path);
          return mutator(path, force);
        };
      })(),
      pruneWorktrees: makeMutator(tracker, () => api.pruneWorktrees(cwd)),
      api,
      cwd,
      // An explicit "check now" nudge for a caller that peeked via
      // getState() without ever subscribing — the common (subscribed) case
      // already tears down automatically when the last listener unsubscribes
      // (see `subscribe` above), so this is a safety net, not the primary path.
      dispose: () => maybeTeardown(tracker),
    };
    trackers.set(cwd, tracker);
    log.debug(`[watch] started tracking ${cwd} (${trackers.size} total)`);
    void runRead(tracker); // one automatic initial read
    return tracker;
  }

  function workspaceFolders(state: WorkspaceActivationState) {
    return state.open.map((ws) => ({
      workspaceId: ws.id,
      folders: [ws.folder, ...(ws.extraFolders ?? [])],
    }));
  }

  function recomputeAutofetch(state: WorkspaceActivationState) {
    const activeFolders = new Set(
      workspaceFolders(state).find((w) => w.workspaceId === state.activeId)
        ?.folders ?? [],
    );
    for (const tracker of trackers.values()) {
      const shouldAutofetch = activeFolders.has(tracker.cwd);
      const isAutofetching = tracker.autofetchId != null;
      if (shouldAutofetch && !isAutofetching) {
        tracker.autofetchId = clock.setInterval(() => {
          void api
            .fetch(tracker.cwd)
            .catch(() => {})
            .then(() => runRead(tracker));
        }, AUTOFETCH_INTERVAL_MS);
      } else if (!shouldAutofetch && isAutofetching) {
        clock.clearInterval(tracker.autofetchId!);
        tracker.autofetchId = null;
      }
    }
  }

  function reconcile(state: WorkspaceActivationState) {
    const desired = new Set(workspaceFolders(state).flatMap((w) => w.folders));
    for (const cwd of desired) {
      getOrCreateTracker(cwd).workspaceOwned = true;
    }
    for (const tracker of [...trackers.values()]) {
      if (!desired.has(tracker.cwd)) {
        tracker.workspaceOwned = false;
        maybeTeardown(tracker);
      }
    }
    recomputeAutofetch(state);
  }

  reconcile(workspaces.getState());
  const workspacesSub = workspaces.subscribe(reconcile);

  return {
    watchRepo(cwd: string): GitRepoStore {
      return getOrCreateTracker(cwd).store;
    },
    debugSnapshot(): TrackerDiagnostics[] {
      return [...trackers.values()].map((t) => ({
        cwd: t.cwd,
        workspaceOwned: t.workspaceOwned,
        subscriberCount: t.listeners.size,
        autofetching: t.autofetchId != null,
      }));
    },
    dispose() {
      workspacesSub.dispose();
      for (const tracker of trackers.values()) {
        tracker.fsWatch?.dispose();
        if (tracker.debounceId != null) clock.clearTimeout(tracker.debounceId);
        if (tracker.autofetchId != null)
          clock.clearInterval(tracker.autofetchId);
      }
      trackers.clear();
    },
  };
}
