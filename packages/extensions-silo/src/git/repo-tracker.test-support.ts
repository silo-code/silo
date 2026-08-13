import type { Disposable } from "@silo-code/sdk";
import type { GitAPI, GitStatus, GitWorktree } from "@silo-code/git-api";
import type { ClockPort } from "./clock";
import type {
  DebugLog,
  WorkspaceActivationSource,
  WorkspaceActivationState,
} from "./repo-tracker";

/** Captures debug and warn log lines instead of discarding them, for
 *  asserting on tracker-lifecycle diagnostics and autofetch failures. */
export function createFakeLog(): DebugLog & { lines: string[] } {
  const lines: string[] = [];
  return {
    debug: (message) => lines.push(message),
    warn: (message) => lines.push(message),
    lines,
  };
}

/** Virtual-time clock: no real timers, `advance(ms)` fires everything due,
 *  in order, rescheduling intervals as it goes. */
export function createFakeClock(): ClockPort & { advance(ms: number): void } {
  let now = 0;
  let nextId = 1;
  const timers = new Map<
    number,
    { at: number; fn: () => void; interval: number | null }
  >();

  function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      let next:
        | [number, { at: number; fn: () => void; interval: number | null }]
        | null = null;
      for (const entry of timers) {
        if (entry[1].at <= target && (!next || entry[1].at < next[1].at)) {
          next = entry;
        }
      }
      if (!next) break;
      const [id, timer] = next;
      now = timer.at;
      if (timer.interval != null) {
        timer.at = now + timer.interval;
      } else {
        timers.delete(id);
      }
      timer.fn();
    }
    now = target;
  }

  return {
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn, interval: null });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    setInterval: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { at: now + ms, fn, interval: ms });
      return id;
    },
    clearInterval: (id) => {
      timers.delete(id);
    },
    advance,
  };
}

/** In-memory `ctx.files.watch` stand-in: `emit(path)` fires every listener
 *  registered for that exact path. */
export function createFakeFilesWatch() {
  const listeners = new Map<string, Set<() => void>>();
  const watch = (path: string, listener: () => void): Disposable => {
    let set = listeners.get(path);
    if (!set) listeners.set(path, (set = new Set()));
    set.add(listener);
    return {
      dispose: () => {
        set!.delete(listener);
      },
    };
  };
  const emit = (path: string) => {
    for (const l of listeners.get(path) ?? []) l();
  };
  return { watch, emit };
}

/** In-memory `ctx.workspaces` stand-in, narrowed to what the tracker reads. */
export function createFakeWorkspaces(): WorkspaceActivationSource & {
  openWorkspace(ws: {
    id: string;
    folder: string;
    extraFolders?: string[];
  }): void;
  closeWorkspace(id: string): void;
  setActive(id: string | null): void;
} {
  let state: WorkspaceActivationState = { open: [], activeId: null };
  const listeners = new Set<(s: WorkspaceActivationState) => void>();
  const emit = () => {
    for (const l of listeners) l(state);
  };
  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    openWorkspace: (ws) => {
      state = { ...state, open: [...state.open, ws] };
      emit();
    },
    closeWorkspace: (id) => {
      state = { ...state, open: state.open.filter((w) => w.id !== id) };
      emit();
    },
    setActive: (id) => {
      state = { ...state, activeId: id };
      emit();
    },
  };
}

const DEFAULT_STATUS: GitStatus = {
  branch: "main",
  upstream: null,
  ahead: 0,
  behind: 0,
  files: [],
  inRepo: true,
};

/** Hand-scriptable `GitAPI` stand-in — no real `git` process. Every method
 *  the tracker doesn't exercise still exists (typed as `GitAPI`) but rejects,
 *  so an accidental call fails loudly instead of resolving `undefined`. */
export function createFakeGitApi(): GitAPI & {
  setStatus(cwd: string, status: GitStatus): void;
  setWorktrees(cwd: string, worktrees: GitWorktree[]): void;
  calls: { fetch: string[]; status: string[]; worktrees: string[] };
} {
  const statuses = new Map<string, GitStatus>();
  const worktrees = new Map<string, GitWorktree[]>();
  const calls = {
    fetch: [] as string[],
    status: [] as string[],
    worktrees: [] as string[],
  };
  const unimplemented = () => Promise.reject(new Error("not stubbed"));

  return {
    setStatus: (cwd, status) => statuses.set(cwd, status),
    setWorktrees: (cwd, wts) => worktrees.set(cwd, wts),
    calls,
    status: async (cwd) => {
      calls.status.push(cwd);
      return statuses.get(cwd) ?? { ...DEFAULT_STATUS };
    },
    worktrees: async (cwd) => {
      calls.worktrees.push(cwd);
      return worktrees.get(cwd) ?? [];
    },
    fetch: async (cwd) => {
      calls.fetch.push(cwd);
    },
    log: unimplemented,
    commitCount: unimplemented,
    diff: unimplemented,
    stage: async () => {},
    unstage: async () => {},
    commit: async () => {},
    show: unimplemented,
    revertFile: async () => {},
    clean: async () => {},
    push: async () => {},
    branches: unimplemented,
    pull: async () => {},
    switchBranch: async () => {},
    createBranch: async () => {},
    deleteBranch: async () => {},
    renameBranch: async () => {},
    unmergedCommits: unimplemented,
    branchBase: unimplemented,
    commitDetail: unimplemented,
    isBinaryDiff: unimplemented,
    addWorktree: async () => {},
    removeWorktree: async () => {},
    pruneWorktrees: async () => {},
    watchRepo: () => {
      throw new Error("not stubbed");
    },
  };
}
