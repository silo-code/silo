import { invoke } from "@tauri-apps/api/core";
import { subscribe } from "valtio";
import { store } from "../state/store";
import { onTerminalForeground } from "./terminal-foreground";
import type { TerminalForeground } from "./terminal-foreground";
import type {
  ProcessesService,
  ProcessInfo,
  ProcessStats,
  ProcessTreeNode,
} from "@silo-code/sdk";
import type { PathScope } from "./security/resolve-path";

// `ctx.processes` — workspace process observability. The host implementation.
// The public contract lives in @silo-code/sdk (processes-service.ts).
//
// Architecture: the pty-host daemon emits `terminal_foreground:<sessionId>`
// events every ~750 ms whenever the foreground process changes. This service
// subscribes to those events for every active terminal, joins with the terminal
// record (to populate terminalId/terminalTitle), and exposes the aggregated
// state to extensions. CPU/memory stats are opt-in (polled separately at
// ~1500 ms via the Tauri `process_get_stats` command).

type SessionEntry = {
  info: ProcessInfo;
  cleanupFg: () => void;
};

// Map<sessionId, SessionEntry> — all sessions across all workspaces, keyed by
// PTY session id. getState() filters this to the active workspace.
const sessions = new Map<string, SessionEntry>();
const listeners = new Set<(state: ProcessInfo[]) => void>();

// Stable snapshot for useSyncExternalStore: getState() must return the same
// reference when nothing changed, otherwise React re-renders in a loop.
// Updated in notify() only when the set of items (by reference) actually changes.
let cachedSnapshot: ProcessInfo[] = [];

// ---- helpers ----------------------------------------------------------------

function findTerminalRecord(sessionId: string) {
  for (const ws of Object.values(store.workspaces)) {
    const rec = ws?.terminals.find((t) => t.sessionId === sessionId);
    if (rec) return rec;
  }
  return null;
}

function activeWorkspaceInfos(): ProcessInfo[] {
  const wsId = store.activeWorkspaceId;
  if (!wsId) return [];
  const ws = store.workspaces[wsId];
  if (!ws) return [];
  const sessionIds = new Set(
    (ws.terminals ?? []).map((t) => t.sessionId).filter(Boolean),
  );
  return Array.from(sessions.values())
    .filter((e) => sessionIds.has(e.info.sessionId))
    .map((e) => e.info);
}

function notify() {
  const next = activeWorkspaceInfos();
  // ProcessInfo objects are replaced by value on every fg update, so reference
  // equality on each element is a sufficient change check — no deep compare needed.
  if (
    next.length === cachedSnapshot.length &&
    next.every((p, i) => p === cachedSnapshot[i])
  ) {
    return;
  }
  cachedSnapshot = next;
  for (const l of listeners) l(cachedSnapshot);
}

// ---- session tracking -------------------------------------------------------

function attachSession(sessionId: string) {
  if (sessions.has(sessionId)) return;

  const rec = findTerminalRecord(sessionId);
  const placeholder: ProcessInfo = {
    sessionId,
    terminalId: rec?.id,
    terminalTitle: rec?.customName ?? rec?.title,
    pgid: 0,
    leader: "",
    cwd: "",
    atPrompt: true,
  };

  const cleanupFg = onTerminalForeground(sessionId, (fg) => {
    const entry = sessions.get(sessionId);
    if (!entry) return;
    const termRec = findTerminalRecord(sessionId);
    entry.info = {
      ...entry.info,
      terminalId: termRec?.id ?? entry.info.terminalId,
      terminalTitle:
        termRec?.customName ?? termRec?.title ?? entry.info.terminalTitle,
      pgid: fg.pgid,
      leader: fg.leader,
      cwd: fg.cwd,
      atPrompt: fg.atPrompt,
    };
    notify();
  });

  sessions.set(sessionId, { info: placeholder, cleanupFg });

  // Seed the initial state from the Rust-side cache so the panel shows the
  // correct foreground immediately, rather than "idle" until the next change
  // event (which may be a long time away for a stable running process).
  void invoke<TerminalForeground | null>("terminal_foreground_snapshot", {
    sessionId,
  }).then((fg) => {
    if (!fg) return;
    const entry = sessions.get(sessionId);
    if (!entry || entry.info.pgid !== 0) return; // already got a real event
    const termRec = findTerminalRecord(sessionId);
    entry.info = {
      ...entry.info,
      terminalId: termRec?.id ?? entry.info.terminalId,
      terminalTitle:
        termRec?.customName ?? termRec?.title ?? entry.info.terminalTitle,
      pgid: fg.pgid,
      leader: fg.leader,
      cwd: fg.cwd,
      atPrompt: fg.atPrompt,
    };
    notify();
  });
}

function detachSession(sessionId: string) {
  const entry = sessions.get(sessionId);
  if (!entry) return;
  entry.cleanupFg();
  sessions.delete(sessionId);
  notify();
}

function syncSessions() {
  const known = new Set<string>();
  for (const ws of Object.values(store.workspaces)) {
    for (const t of ws?.terminals ?? []) {
      if (t.sessionId) {
        known.add(t.sessionId);
        attachSession(t.sessionId);
      }
    }
  }
  for (const sid of sessions.keys()) {
    if (!known.has(sid)) detachSession(sid);
  }
  // Always notify after sync — the active workspace may have changed even if no
  // sessions were added or removed, which shifts which entries getState() returns.
  notify();
}

// Sync immediately (catch terminals already open on first mount) and again on
// every store mutation (new terminals, workspace switch, terminal removal).
syncSessions();
subscribe(store, syncSessions);

// ---- stats polling ----------------------------------------------------------

let statsRefcount = 0;
let treesRefcount = 0;
let statsInterval: ReturnType<typeof setInterval> | null = null;

// What process_get_stats returns; `tree` present only when requested.
type HostProcessStats = ProcessStats & { tree?: ProcessTreeNode };

function startStatsPolling() {
  if (statsInterval !== null) return;
  statsInterval = setInterval(() => {
    const pgids = Array.from(sessions.values())
      .map((e) => e.info.pgid)
      .filter((p) => p > 0);
    if (pgids.length === 0) return;

    void invoke<HostProcessStats[]>("process_get_stats", {
      pids: pgids,
      withTrees: treesRefcount > 0,
    })
      .then((results) => {
        let changed = false;
        for (const stat of results) {
          const entry = Array.from(sessions.values()).find(
            (e) => e.info.pgid === stat.pid,
          );
          if (entry) {
            const { tree, ...stats } = stat;
            entry.info = { ...entry.info, stats, tree };
            changed = true;
          }
        }
        if (changed) notify();
      })
      .catch(() => {
        // Stats failure is non-fatal; silent skip until next tick.
      });
  }, 1500);
}

function stopStatsPolling() {
  if (statsInterval === null) return;
  clearInterval(statsInterval);
  statsInterval = null;
  let changed = false;
  for (const entry of sessions.values()) {
    if (entry.info.stats !== undefined || entry.info.tree !== undefined) {
      entry.info = { ...entry.info, stats: undefined, tree: undefined };
      changed = true;
    }
  }
  if (changed) notify();
}

// ---- service ----------------------------------------------------------------

let processesService: ProcessesService | null = null;

/** @internal — host factory; extensions receive this as `ctx.processes`. */
export function getProcessesService(): ProcessesService {
  if (processesService) return processesService;
  processesService = {
    getState() {
      return cachedSnapshot;
    },
    getByTerminalId(terminalId) {
      for (const entry of sessions.values()) {
        if (entry.info.terminalId === terminalId && entry.info.pgid > 0) {
          return entry.info;
        }
      }
      return undefined;
    },
    subscribe(listener) {
      listeners.add(listener);
      return {
        dispose() {
          listeners.delete(listener);
        },
      };
    },
    async kill(pgid) {
      await invoke("process_kill_group", { pgid });
    },
    enableStats(options) {
      const withTrees = options?.trees === true;
      statsRefcount++;
      if (withTrees) treesRefcount++;
      if (statsRefcount === 1) startStatsPolling();
      let disposed = false;
      return {
        dispose() {
          // Guard double-dispose — it would corrupt the refcounts.
          if (disposed) return;
          disposed = true;
          statsRefcount = Math.max(0, statsRefcount - 1);
          if (withTrees) treesRefcount = Math.max(0, treesRefcount - 1);
          if (statsRefcount === 0) stopStatsPolling();
        },
      };
    },
  };
  return processesService;
}

/**
 * Wrap the processes service so `kill()` requires the `process` permission for
 * untrusted (third-party) extensions. The readable state (foreground info) is
 * not path-sensitive and is unrestricted. Trusted (built-in) extensions bypass
 * the guard and receive the base service unchanged.
 *
 * @internal
 */
export function getScopedProcessesService(scope: PathScope): ProcessesService {
  const base = getProcessesService();
  if (scope.trusted) return base;
  return {
    ...base,
    async kill(pgid) {
      if (!scope.permissions.has("process")) {
        throw new Error(
          'ctx.processes.kill() requires the "process" permission',
        );
      }
      return base.kill(pgid);
    },
  };
}
