import { invoke } from "@tauri-apps/api/core";
import { subscribe } from "valtio";
import { store } from "../state/store";
import { getTerminalService } from "./terminal-service";
import { onTerminalForeground } from "./terminal-foreground";
import type { TerminalForeground } from "./terminal-foreground";
import {
  resolveResumeHintWithTimeout,
  isKnownAgentLeader,
  agentsChannel,
} from "./agent-resume-hint";
import { detectFromOsc } from "./agent-osc-detectors";
import {
  readNewHookEvents,
  matchHookEventsToTerminals,
  type HookEvent,
} from "./agent-hook-events";
import {
  restoreState,
  reduce,
  clearResumeIdentityOnDemotion,
  type AgentActivityState,
  type AgentActivityEvent,
} from "./agent-activity-model";
import type { AgentInfo, AgentsService } from "@silo-code/sdk";
import type { PersistedAgentInfo } from "../state/types";

// `ctx.agents` — the host implementation. Public contract in
// @silo-code/sdk (agents-service.ts). See RFC 0017. Detection and
// resume-hint resolution are both sealed here — no registration API.
//
// Architecture: mirrors processes-service.ts (host-computed, shared,
// cached-snapshot pattern). One entry per tracked terminal, fed by the
// existing OSC dispatch (getTerminalService().subscribeOsc — the same
// shared oscListeners pipeline `ctx.terminals.subscribeOsc` uses) and the
// existing foreground stream (onTerminalForeground), which also triggers
// live resume-hint resolution the first time a known agent leader appears.

type SessionEntry = {
  info: AgentInfo;
  state: AgentActivityState;
  lastLiveAt: string;
  resumeHintResolved: boolean;
  /** Last-known foreground pgid, updated on every foreground tick — used to
   * correlate an opt-in hook event's reported pid against this terminal
   * specifically (see agent-hook-events.ts). `null` until the first tick. */
  currentPgid: number | null;
  /** True once a hook-confirmed (exact, tier-1) resume identity has been
   * set — once true, a same-terminal `continues`-based (inferred, tier-2)
   * resolution that resolves later must never overwrite it. */
  hookConfirmed: boolean;
  cleanupOsc: () => void;
  cleanupFg: () => void;
};

// Map<terminalId, SessionEntry>.
const sessions = new Map<string, SessionEntry>();

type ListenerEntry = {
  listener: (state: AgentInfo[]) => void;
  allWorkspaces: boolean;
};
const listeners = new Set<ListenerEntry>();

let cachedActiveSnapshot: AgentInfo[] = [];
let cachedAllSnapshot: AgentInfo[] = [];
let allSnapshotStale = true;

// ---- helpers ----------------------------------------------------------------

function findTerminalContext(terminalId: string) {
  for (const [wsId, ws] of Object.entries(store.workspaces)) {
    const rec = ws?.terminals.find((t) => t.id === terminalId);
    if (rec) return { rec, wsId };
  }
  return null;
}

function toAgentInfo(
  terminalId: string,
  workspaceId: string,
  state: AgentActivityState,
): AgentInfo {
  return {
    terminalId,
    workspaceId,
    kind: state.kind,
    isAgent: state.isAgent,
    activity: state.activity,
    needsAttention: state.needsAttention,
    attentionSince: state.attentionSince ?? undefined,
    workingSince: state.workingSince ?? undefined,
    stale: state.stale,
    sessionId: state.sessionId ?? undefined,
    resumeCommand: state.resumeCommand ?? undefined,
    agentName: state.agentName ?? undefined,
  };
}

function toPersisted(
  workspaceId: string,
  state: AgentActivityState,
  lastLiveAt: string,
): PersistedAgentInfo {
  return {
    workspaceId,
    isAgent: state.isAgent,
    activity: state.activity,
    needsAttention: state.needsAttention,
    attentionSince: state.attentionSince ?? undefined,
    workingSince: state.workingSince ?? undefined,
    workingSource: state.workingSource,
    sessionId: state.sessionId ?? undefined,
    resumeCommand: state.resumeCommand ?? undefined,
    agentName: state.agentName ?? undefined,
    lastLiveAt,
  };
}

function activeWorkspaceInfos(): AgentInfo[] {
  const wsId = store.activeWorkspaceId;
  if (!wsId) return [];
  return Array.from(sessions.values())
    .filter((e) => e.info.workspaceId === wsId)
    .map((e) => e.info);
}

function allWorkspaceInfos(): AgentInfo[] {
  return Array.from(sessions.values()).map((e) => e.info);
}

function sameByRef(a: AgentInfo[], b: AgentInfo[]): boolean {
  return a.length === b.length && a.every((p, i) => p === b[i]);
}

function hasAllWorkspacesListener(): boolean {
  for (const entry of listeners) if (entry.allWorkspaces) return true;
  return false;
}

function refreshAllSnapshot(): boolean {
  if (!allSnapshotStale) return false;
  allSnapshotStale = false;
  const nextAll = allWorkspaceInfos();
  const changed = !sameByRef(nextAll, cachedAllSnapshot);
  if (changed) cachedAllSnapshot = nextAll;
  return changed;
}

function notify() {
  const nextActive = activeWorkspaceInfos();
  const activeChanged = !sameByRef(nextActive, cachedActiveSnapshot);
  if (activeChanged) cachedActiveSnapshot = nextActive;

  allSnapshotStale = true;
  const allChanged = hasAllWorkspacesListener() ? refreshAllSnapshot() : false;

  if (!activeChanged && !allChanged) return;
  for (const entry of listeners) {
    if (entry.allWorkspaces) {
      if (allChanged) entry.listener(cachedAllSnapshot);
    } else if (activeChanged) {
      entry.listener(cachedActiveSnapshot);
    }
  }
}

// ---- event application -------------------------------------------------------

function applyEvent(terminalId: string, ev: AgentActivityEvent) {
  const entry = sessions.get(terminalId);
  if (!entry) return;

  const reduced = reduce(entry.state, ev);
  const next = clearResumeIdentityOnDemotion(entry.state, reduced);
  const isLiveTick =
    (ev.type === "detected" && ev.source !== "timer") ||
    ev.type === "dead" ||
    ev.type === "reset";

  // Re-arm resume-hint resolution on demotion, so a later agent invocation
  // in the same terminal gets its own fresh attempt rather than being
  // permanently skipped by the earlier one. Clearing hookConfirmed too
  // means that later invocation is free to accept a `continues`-based guess
  // if the hook happens not to fire for it (e.g. not installed for that
  // account) — the guard exists to protect one resolution, not forever.
  if (entry.state.isAgent && !reduced.isAgent) {
    entry.resumeHintResolved = false;
    entry.hookConfirmed = false;
  }

  if (next === entry.state) {
    if (isLiveTick) entry.lastLiveAt = new Date().toISOString();
    return;
  }

  entry.state = next;
  if (isLiveTick) entry.lastLiveAt = new Date().toISOString();

  const ctx = findTerminalContext(terminalId);
  const workspaceId = ctx?.wsId ?? entry.info.workspaceId;
  entry.info = toAgentInfo(terminalId, workspaceId, next);
  store.agentState[terminalId] = toPersisted(
    workspaceId,
    next,
    entry.lastLiveAt,
  );

  notify();
}

/** Kick off live resume-hint resolution once, the first time a known agent
 * leader is observed for this terminal. Persists the result immediately —
 * it is never re-resolved later, including at death. See RFC 0017. */
function maybeResolveResumeHint(
  terminalId: string,
  leader: string,
  cwd: string,
) {
  const entry = sessions.get(terminalId);
  if (!entry) return;
  if (entry.resumeHintResolved) return;
  if (!isKnownAgentLeader(leader)) {
    agentsChannel.debug(
      `Foreground leader "${leader}" for terminal ${terminalId} isn't a known agent — no resolution attempted.`,
    );
    return;
  }
  entry.resumeHintResolved = true;

  void resolveResumeHintWithTimeout(leader, cwd).then((hint) => {
    const current = sessions.get(terminalId);
    if (!current) return;
    // A hook-confirmed (exact) resolution can land while this `continues`
    // exec is still in flight — never let the slower, inferred result
    // overwrite the exact one, regardless of which started first.
    if (current.hookConfirmed) {
      agentsChannel.debug(
        `Discarding continues-based hint for terminal ${terminalId} — already hook-confirmed.`,
      );
      return;
    }
    // Stash on the entry's state directly (not via reduce/an event) — this
    // isn't an activity transition, just attaching resolved identity data
    // for markSessionDead to read back later. Persisted immediately so it
    // survives past this process, same as everything else in agentState.
    current.state = { ...current.state, ...hint };
    const ctx = findTerminalContext(terminalId);
    const workspaceId = ctx?.wsId ?? current.info.workspaceId;
    store.agentState[terminalId] = toPersisted(
      workspaceId,
      current.state,
      current.lastLiveAt,
    );
  });
}

/**
 * Demote a promoted-shell terminal back to a plain shell once the foreground
 * genuinely returns to the shell itself. `atPrompt` (from `tcgetpgrp` at the
 * OS level) is reliable regardless of whether the shell emits any OSC 133
 * shell-integration sequences at all — unlike a silence/debounce timer, it
 * can't mistake "the agent is idle at its own prompt" for "the agent process
 * exited," since a still-running agent's own foreground group is never the
 * shell's. Only applies to promoted shells (`kind === "shell"`); a
 * born-agent terminal's `isAgent` is permanent by design (see
 * `agent-activity-model.ts`'s `reduce()`).
 */
function checkPromptDemotion(terminalId: string, atPrompt: boolean) {
  const entry = sessions.get(terminalId);
  if (!entry || !atPrompt) return;
  if (!entry.state.isAgent || entry.state.kind !== "shell") return;

  applyEvent(terminalId, {
    type: "detected",
    status: "waiting",
    source: "shell",
    isActiveTerminal: getTerminalService().getActive() === terminalId,
    now: new Date().toISOString(),
  });
}

// ---- session tracking ---------------------------------------------------------

function attachSession(terminalId: string) {
  if (sessions.has(terminalId)) return;
  const ctx = findTerminalContext(terminalId);
  if (!ctx?.rec.sessionId) return;

  const persisted = store.agentState[terminalId];
  const gapMs = persisted ? Date.now() - Date.parse(persisted.lastLiveAt) : 0;
  const state = restoreState(
    ctx.rec.kind,
    persisted
      ? {
          isAgent: persisted.isAgent,
          activity: persisted.activity,
          needsAttention: persisted.needsAttention,
          attentionSince: persisted.attentionSince ?? null,
          workingSince: persisted.workingSince ?? null,
          workingSource: persisted.workingSource,
          sessionId: persisted.sessionId ?? null,
          resumeCommand: persisted.resumeCommand ?? null,
          agentName: persisted.agentName ?? null,
        }
      : undefined,
    gapMs,
  );
  const nowIso = new Date().toISOString();

  const entry: SessionEntry = {
    state,
    info: toAgentInfo(terminalId, ctx.wsId, state),
    lastLiveAt: persisted?.lastLiveAt ?? nowIso,
    resumeHintResolved:
      state.sessionId !== null || state.resumeCommand !== null,
    currentPgid: null,
    hookConfirmed: false,
    cleanupOsc: () => {},
    cleanupFg: () => {},
  };
  sessions.set(terminalId, entry);

  entry.cleanupOsc = getTerminalService().subscribeOsc(
    terminalId,
    ({ code, payload }) => {
      const detected = detectFromOsc(code, payload);
      if (!detected) return;
      applyEvent(terminalId, {
        type: "detected",
        status: detected.status,
        source: detected.source,
        isActiveTerminal: getTerminalService().getActive() === terminalId,
        now: new Date().toISOString(),
      });
    },
  ).dispose;

  entry.cleanupFg = onTerminalForeground(ctx.rec.sessionId, (fg) => {
    entry.currentPgid = fg.pgid > 0 ? fg.pgid : null;
    maybeResolveResumeHint(terminalId, fg.leader, fg.cwd);
    checkPromptDemotion(terminalId, fg.atPrompt);
  });

  // Seed from the Rust-side cache immediately — a terminal whose foreground
  // was already stable *before* tracking started (e.g. Claude already
  // running when the extension loaded) may never fire another change event,
  // so onTerminalForeground alone would never trigger resume-hint
  // resolution for it. Mirrors processes-service.ts's identical seeding step.
  void invoke<TerminalForeground | null>("terminal_foreground_snapshot", {
    sessionId: ctx.rec.sessionId,
  }).then((fg) => {
    if (!fg) return;
    entry.currentPgid = fg.pgid > 0 ? fg.pgid : null;
    maybeResolveResumeHint(terminalId, fg.leader, fg.cwd);
    checkPromptDemotion(terminalId, fg.atPrompt);
  });

  if (state.activity !== "none")
    store.agentState[terminalId] ??= toPersisted(
      ctx.wsId,
      state,
      entry.lastLiveAt,
    );
}

function detachSession(terminalId: string) {
  const entry = sessions.get(terminalId);
  if (!entry) return;
  entry.cleanupOsc();
  entry.cleanupFg();
  sessions.delete(terminalId);
  notify();
}

function syncSessions() {
  const known = new Set<string>();
  for (const ws of Object.values(store.workspaces)) {
    for (const t of ws?.terminals ?? []) {
      known.add(t.id);
      attachSession(t.id);
    }
  }
  for (const tid of sessions.keys()) {
    if (!known.has(tid)) detachSession(tid);
  }
  notify();
}

syncSessions();
subscribe(store, syncSessions);

// ---- hook-based resolution (tier-1, exact) --------------------------------

/** Frequent enough that a hook-confirmed identity lands well within the
 * `continues`-based retry loop's own budget (see `agent-resume-hint.ts`), but
 * not so frequent it's polling a file on every render tick. */
const HOOK_POLL_INTERVAL_MS = 3_000;

const HOOK_AGENT_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude Code",
};

function friendlyAgentName(agent: string): string {
  return HOOK_AGENT_DISPLAY_NAMES[agent] ?? agent;
}

/** Apply an exact, hook-confirmed resume identity to a terminal. Unlike the
 * `continues`-based path (which only mutates `entry.state` and relies on the
 * next natural OSC tick to refresh `entry.info`/notify subscribers), this
 * updates both immediately — hook events are discrete, one-off occurrences
 * rather than a continuous tick stream, so there's no guarantee of a
 * follow-up tick to piggyback on. */
function applyHookMatch(terminalId: string, event: HookEvent) {
  const entry = sessions.get(terminalId);
  if (!entry) return;

  entry.hookConfirmed = true;
  entry.resumeHintResolved = true;
  entry.state = {
    ...entry.state,
    sessionId: event.sessionId,
    resumeCommand: `claude --resume ${event.sessionId}`,
    agentName: friendlyAgentName(event.agent),
  };

  const ctx = findTerminalContext(terminalId);
  const workspaceId = ctx?.wsId ?? entry.info.workspaceId;
  entry.info = toAgentInfo(terminalId, workspaceId, entry.state);
  store.agentState[terminalId] = toPersisted(
    workspaceId,
    entry.state,
    entry.lastLiveAt,
  );

  agentsChannel.info(
    `Hook-confirmed session ${event.sessionId} for terminal ${terminalId} (pid ${event.pid}).`,
  );
  notify();
}

async function pollHookEvents() {
  // Nothing to correlate against — skip the exec entirely rather than firing
  // it into the void every tick (also keeps this a no-op in any context,
  // like tests, where no terminal is ever tracked).
  if (sessions.size === 0) return;

  const events = await readNewHookEvents();
  if (events.length === 0) return;

  const terminals = Array.from(sessions.entries()).map(
    ([terminalId, entry]) => ({
      terminalId,
      pgid: entry.currentPgid,
    }),
  );
  for (const match of matchHookEventsToTerminals(events, terminals)) {
    applyHookMatch(match.terminalId, match.event);
  }
}

setInterval(() => void pollHookEvents(), HOOK_POLL_INTERVAL_MS);

// ---- death detection -----------------------------------------------------

/**
 * Called by `TerminalPanel.tsx` the moment it observes a `SESSION_GONE` 404
 * on reattach — the confirmed, unclean-death signal (see RFC 0017's
 * "Testing the death transition" and the `TerminalPanel.tsx` integration
 * note). Fires the terminal's activity to `"dead"` using whatever resume
 * hint was already resolved live; if none was ever resolved (this terminal's
 * leader never matched a known agent), falls back to the generic hint using
 * the last-known `leader`/`cwd`.
 */
export function markSessionDead(terminalId: string): void {
  const entry = sessions.get(terminalId);
  if (!entry) return;

  if (entry.state.resumeCommand || entry.state.sessionId) {
    applyEvent(terminalId, {
      type: "dead",
      sessionId: entry.state.sessionId ?? undefined,
      resumeCommand: entry.state.resumeCommand ?? undefined,
      agentName: entry.state.agentName ?? undefined,
    });
    return;
  }

  applyEvent(terminalId, { type: "dead" });
}

/** Called once a fresh session has been spawned for a terminal that was
 * `"dead"` (the auto-recreate path in `TerminalPanel.tsx`), clearing it back
 * to a fresh, unstarted state so agent tracking resumes normally. */
export function resetSessionAfterRecreate(terminalId: string): void {
  const entry = sessions.get(terminalId);
  if (!entry) return;
  entry.resumeHintResolved = false;
  entry.hookConfirmed = false;
  applyEvent(terminalId, { type: "reset" });
}

// ---- service ----------------------------------------------------------------

let agentsService: AgentsService | null = null;

/** @internal — host factory; extensions receive this as `ctx.agents`. Fully
 * unscoped (no Permission gating), matching `ctx.processes`'s precedent. */
export function getAgentsService(): AgentsService {
  if (agentsService) return agentsService;
  agentsService = {
    getState(options) {
      if (!options?.allWorkspaces) return cachedActiveSnapshot;
      refreshAllSnapshot();
      return cachedAllSnapshot;
    },
    getByTerminalId(terminalId) {
      return sessions.get(terminalId)?.info;
    },
    subscribe(listener, options) {
      const entry: ListenerEntry = {
        listener,
        allWorkspaces: options?.allWorkspaces === true,
      };
      listeners.add(entry);
      return {
        dispose() {
          listeners.delete(entry);
        },
      };
    },
  };
  return agentsService;
}
