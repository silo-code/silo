import { invoke } from "@tauri-apps/api/core";
import { subscribe } from "valtio";
import { store } from "../state/store";
import { getTerminalService } from "./terminal-service";
import { onTerminalForeground } from "./terminal-foreground";
import type { TerminalForeground } from "./terminal-foreground";
import {
  genericHint,
  isKnownAgentLeader,
  agentsChannel,
  type ResumeHint,
} from "./agent-resume-hint";
import {
  detectFromOsc,
  detectIdleAfterWorking,
  detectFromOutput,
  agentById,
} from "./agent-catalog";
import {
  readNewHookEvents,
  matchHookEventsToTerminals,
  pruneUnmatchedEvents,
  type HookEvent,
} from "./agent-hook-events";
import {
  planDetection,
  SHELL_IDLE_MS,
  AGENT_IDLE_DEBOUNCE_MS,
} from "./agent-detection-dispatch";
import type { DetectionResult } from "./agent-osc-detectors";
import {
  restoreState,
  reduce,
  resetOnDemotion,
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
  cleanupOsc: () => void;
  cleanupFg: () => void;
  /** Raw-PTY-output subscription, for agents whose status isn't reliably
   * exposed via OSC at all (Cursor Agent's spinner fallback). */
  cleanupOutput: () => void;
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
    agentId: state.agentId ?? undefined,
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
    agentId: state.agentId ?? undefined,
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
  const next = resetOnDemotion(entry.state, reduced);
  const isLiveTick =
    (ev.type === "detected" && ev.source !== "timer") ||
    ev.type === "dead" ||
    ev.type === "reset";

  // Re-arm resume-hint resolution on demotion, so a later agent invocation
  // in the same terminal gets its own fresh generic hint rather than being
  // permanently skipped by the earlier one.
  if (entry.state.isAgent && !reduced.isAgent) {
    entry.resumeHintResolved = false;
    // The terminal just demoted back to a plain shell — cancel any pending
    // agent-idle/shell-idle debounce timers armed while the agent was still
    // running. Without this, a timer armed by e.g. Claude's last "✳" idle
    // marker before exit can fire up to AGENT_IDLE_DEBOUNCE_MS later with
    // source: "agent" — and reduce()'s `isAgent = prev.isAgent ||
    // ev.source === "agent"` unconditionally re-promotes on that source,
    // regardless of status. That flips a correctly-demoted terminal's
    // isAgent back to true, with no further shell event ever coming along
    // to demote it again (confirmed live: exiting Claude/Codex would
    // briefly show isAgent: false, then flip back to true moments later).
    clearAgentIdleTimer(terminalId);
    clearShellIdleTimer(terminalId);
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

/** Stash a resolved {@link ResumeHint} onto a terminal's entry — updating its
 * `AgentInfo`, persisting it (so it survives a restart, which is exactly when
 * a resume hint is read back at death), and notifying subscribers. Shared by
 * both the generic-hint path ({@link maybeResolveResumeHint}) and the exact
 * hook path ({@link applyHookMatch}). A generic hint carries no `sessionId`,
 * so it never clobbers an exact id already set by a hook. */
function applyResumeHint(terminalId: string, hint: ResumeHint) {
  const entry = sessions.get(terminalId);
  if (!entry) return;
  entry.state = {
    ...entry.state,
    sessionId: hint.sessionId ?? entry.state.sessionId,
    resumeCommand: hint.resumeCommand,
    agentName: hint.agentName ?? entry.state.agentName,
    agentId: hint.agentId ?? entry.state.agentId,
  };
  const ctx = findTerminalContext(terminalId);
  const workspaceId = ctx?.wsId ?? entry.info.workspaceId;
  entry.info = toAgentInfo(terminalId, workspaceId, entry.state);
  store.agentState[terminalId] = toPersisted(
    workspaceId,
    entry.state,
    entry.lastLiveAt,
  );
  notify();
}

/** Attach a generic (honest, session-id-less) resume hint the first time a
 * known agent leader is observed for this terminal. If the opt-in hook later
 * reports this terminal's exact session id, {@link applyHookMatch} upgrades
 * this to an exact `claude --resume <id>`. There is no inference in between —
 * see `agent-resume-hint.ts`. */
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
      `Foreground leader "${leader}" for terminal ${terminalId} isn't a known agent — no resume hint attached.`,
    );
    return;
  }
  entry.resumeHintResolved = true;
  applyResumeHint(terminalId, genericHint(leader, cwd));
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
    status: "idle",
    source: "shell",
    isActiveTerminal: getTerminalService().getActive() === terminalId,
    now: new Date().toISOString(),
  });
}

// ---- OSC detection dispatch (debounce timers) --------------------------------
//
// Ported from silo-extensions/agent-monitor's terminal-tracker.ts. Two
// per-terminal debounce timers exist, for two different problems — see
// agent-detection-dispatch.ts's module doc for the full rationale:
//
//   - shell-idle (SHELL_IDLE_MS): the fallback for a shell-integration-only
//     agent (e.g. pi) that emits OSC 133;C per step but never explicitly
//     signals "idle".
//   - agent-idle (AGENT_IDLE_DEBOUNCE_MS): debounces Claude/Codex's braille
//     idle marker (fired briefly between tool calls) so it doesn't flicker to
//     "idle" and immediately back; also Cursor's raw-output spinner
//     fallback's *only* "idle" signal (silence after the last frame).
//
// planDetection() is the pure decision (what to do with each timer, whether
// to dispatch); this section is just the stateful glue driving real timers.

function detectedEvent(
  terminalId: string,
  status: "working" | "idle" | "error",
  source: "agent" | "shell" | "timer",
): AgentActivityEvent {
  return {
    type: "detected",
    status,
    source,
    isActiveTerminal: getTerminalService().getActive() === terminalId,
    now: new Date().toISOString(),
  };
}

const shellIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
const agentIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearShellIdleTimer(terminalId: string) {
  const t = shellIdleTimers.get(terminalId);
  if (t !== undefined) {
    clearTimeout(t);
    shellIdleTimers.delete(terminalId);
  }
}

function scheduleShellIdle(terminalId: string) {
  clearShellIdleTimer(terminalId);
  shellIdleTimers.set(
    terminalId,
    setTimeout(() => {
      shellIdleTimers.delete(terminalId);
      applyEvent(terminalId, detectedEvent(terminalId, "idle", "timer"));
    }, SHELL_IDLE_MS),
  );
}

function clearAgentIdleTimer(terminalId: string) {
  const t = agentIdleTimers.get(terminalId);
  if (t !== undefined) {
    clearTimeout(t);
    agentIdleTimers.delete(terminalId);
  }
}

function scheduleAgentIdle(terminalId: string) {
  clearAgentIdleTimer(terminalId);
  agentIdleTimers.set(
    terminalId,
    setTimeout(() => {
      agentIdleTimers.delete(terminalId);
      applyEvent(terminalId, detectedEvent(terminalId, "idle", "agent"));
    }, AGENT_IDLE_DEBOUNCE_MS),
  );
}

/** Act on one {@link DetectionResult}: touch the two debounce timers per
 * `planDetection`'s decision, then dispatch a `"detected"` event if the plan
 * calls for one now (a debounced "idle" only dispatches once its timer
 * actually fires, via scheduleAgentIdle above). */
function applyDetection(terminalId: string, result: DetectionResult) {
  const plan = planDetection(result);
  if (plan.shellTimerAction === "schedule") scheduleShellIdle(terminalId);
  else if (plan.shellTimerAction === "clear") clearShellIdleTimer(terminalId);
  if (plan.agentTimerAction === "schedule") scheduleAgentIdle(terminalId);
  else if (plan.agentTimerAction === "clear") clearAgentIdleTimer(terminalId);
  if (plan.dispatch) {
    applyEvent(
      terminalId,
      detectedEvent(terminalId, plan.dispatch.status, plan.dispatch.source),
    );
  }
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
          agentId: persisted.agentId ?? null,
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
    cleanupOsc: () => {},
    cleanupFg: () => {},
    cleanupOutput: () => {},
  };
  sessions.set(terminalId, entry);

  entry.cleanupOsc = getTerminalService().subscribeOsc(
    terminalId,
    ({ code, payload }) => {
      const detected = detectFromOsc(code, payload);
      if (detected) {
        applyDetection(terminalId, detected);
        return;
      }
      // Contextual fallback (Codex's plain-title idle): only meaningful when
      // this terminal was already in an agent-sourced working state, so the
      // ordinary detectors above always get first refusal.
      const wasAgentWorking =
        entry.state.activity === "working" &&
        entry.state.workingSource === "agent";
      const idle = detectIdleAfterWorking(code, payload, wasAgentWorking);
      if (idle) applyDetection(terminalId, idle);
    },
  ).dispose;

  // Raw-PTY-output fallback (Cursor Agent's spinner, when its OSC status
  // titles are off — the upstream default). Independent of the OSC
  // subscription above; a separate stream entirely.
  entry.cleanupOutput = getTerminalService().subscribeOutput(
    terminalId,
    (chunk) => {
      const result = detectFromOutput(chunk);
      if (result) applyDetection(terminalId, result);
    },
  ).dispose;

  entry.cleanupFg = onTerminalForeground(ctx.rec.sessionId, (fg) => {
    entry.currentPgid = fg.pgid > 0 ? fg.pgid : null;
    agentsChannel.debug(
      `terminal ${terminalId} foreground tick: pgid=${fg.pgid} leader="${fg.leader}" cwd=${fg.cwd} atPrompt=${fg.atPrompt}`,
    );
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
    if (!fg) {
      agentsChannel.debug(
        `terminal ${terminalId} foreground seed: no snapshot available yet`,
      );
      return;
    }
    entry.currentPgid = fg.pgid > 0 ? fg.pgid : null;
    agentsChannel.debug(
      `terminal ${terminalId} foreground seed: pgid=${fg.pgid} leader="${fg.leader}" cwd=${fg.cwd}`,
    );
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
  entry.cleanupOutput();
  clearShellIdleTimer(terminalId);
  clearAgentIdleTimer(terminalId);
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

// ---- hook-based resolution (exact) ----------------------------------------

/** Frequent enough that a hook-reported session id lands promptly after the
 * agent starts (upgrading the generic hint that was attached synchronously at
 * detection), but not so frequent it's polling a file on every render tick. */
const HOOK_POLL_INTERVAL_MS = 3_000;

/** Apply an exact, hook-reported resume identity to a terminal — upgrading
 * whatever generic hint may already be attached to an exact resume command.
 * Both the command syntax and the display name come from the catalog entry
 * for `event.agent` (see agent-catalog.ts), so this is agent-agnostic; the
 * `${agent} --resume` form is only a defensive fallback for an event whose
 * agent id somehow isn't in the catalog. `resumeHintResolved` is set so the
 * generic path won't later re-stash a vague hint over this one. */
function applyHookMatch(terminalId: string, event: HookEvent) {
  const entry = sessions.get(terminalId);
  if (!entry) return;

  const agent = agentById(event.agent);
  const hook = agent?.resume.kind === "hook" ? agent.resume : undefined;

  entry.resumeHintResolved = true;
  applyResumeHint(terminalId, {
    sessionId: event.sessionId,
    resumeCommand: hook
      ? hook.buildResumeCommand(event.sessionId)
      : `${event.agent} --resume ${event.sessionId}`,
    agentName: agent?.displayName ?? event.agent,
    agentId: agent?.id ?? event.agent,
  });

  agentsChannel.info(
    `Hook-confirmed session ${event.sessionId} for terminal ${terminalId} (pid ${event.pid}).`,
  );
}

/**
 * Events read but not yet matched to a terminal, retried on the next poll
 * rather than discarded. This matters because `readNewHookEvents()` is a
 * checkpoint — each line is returned exactly once, ever — but a hook can fire
 * (and the event line get read) *before* Silo's own foreground-tracking has
 * caught up to the terminal's new pgid (confirmed in testing: a Codex
 * SessionStart hook fires near-instantly at launch, which can race ahead of
 * the foreground-poll tick that would've updated `currentPgid`). Without a
 * retry buffer, that single unlucky poll permanently loses an event that
 * would have matched correctly a few hundred milliseconds later. Pruned by
 * `MAX_EVENT_AGE_MS` (the same staleness bound `readNewHookEvents` itself
 * uses) so a genuinely orphaned event doesn't linger forever.
 */
let pendingHookEvents: HookEvent[] = [];

/**
 * Guards against overlapping ticks. `setInterval` never waits for the
 * previous callback to finish before scheduling the next one, and
 * `readNewHookEvents()` makes a real native subprocess round-trip every
 * call — if that round-trip ever takes longer than `HOOK_POLL_INTERVAL_MS`
 * (a spike in IPC/process-spawn latency, system load, anything), two ticks
 * can be in flight at once, each independently reading the file and racing
 * to update the shared `linesProcessed` checkpoint in `agent-hook-events.ts`.
 * Whichever resolves *last* wins and overwrites it with its own (possibly
 * smaller) line count — silently undoing a more-advanced checkpoint a
 * faster-resolving overlapping tick already set, or the reverse: a
 * genuinely new line landing in the gap between two overlapping reads never
 * gets seen as "new" by either. No error, no log, just a line that's gone.
 * A simple in-flight guard makes ticks strictly sequential instead of
 * relying on `setInterval`'s scheduling never overlapping in practice.
 */
let pollInFlight = false;

async function pollHookEvents() {
  if (pollInFlight) {
    agentsChannel.debug("Skipping poll tick — previous one still in flight.");
    return;
  }
  pollInFlight = true;

  // Nothing to correlate against — skip the exec entirely rather than firing
  // it into the void every tick (also keeps this a no-op in any context,
  // like tests, where no terminal is ever tracked). Still worth pruning the
  // pending buffer even with no sessions, so a stale event can't sit around
  // forever waiting for a terminal that will never reappear.
  if (sessions.size === 0) {
    pendingHookEvents = [];
    pollInFlight = false;
    return;
  }

  // Wrapped in try/catch so a thrown error is visible in the Output panel —
  // `setInterval(() => void pollHookEvents(), ...)` would otherwise silently
  // swallow a rejected promise as an unhandled rejection, giving zero
  // visibility into a tick that's failing every single time.
  try {
    const newEvents = await readNewHookEvents();
    const candidates =
      pendingHookEvents.length > 0
        ? [...pendingHookEvents, ...newEvents]
        : newEvents;
    if (candidates.length === 0) return;

    const terminals = Array.from(sessions.entries()).map(
      ([terminalId, entry]) => ({
        terminalId,
        pgid: entry.currentPgid,
      }),
    );
    const matches = matchHookEventsToTerminals(candidates, terminals);
    for (const match of matches) {
      applyHookMatch(match.terminalId, match.event);
    }
    if (newEvents.length > 0 && matches.length < candidates.length) {
      // Diagnostic: log unmatched pids against every tracked terminal's
      // current pgid, so a persistent mismatch (vs. a one-poll timing race)
      // is visible directly in the Output panel instead of requiring
      // guesswork.
      const matchedEvents = new Set(matches.map((m) => m.event));
      const unmatched = candidates.filter((ev) => !matchedEvents.has(ev));
      agentsChannel.debug(
        `${unmatched.length} hook event(s) still unmatched: ` +
          unmatched.map((e) => `pid=${e.pid}(${e.agent})`).join(", ") +
          ` — tracked terminal pgids: ` +
          terminals
            .map((t) => `${t.terminalId.slice(-8)}=${t.pgid}`)
            .join(", "),
      );
    }
    pendingHookEvents = pruneUnmatchedEvents(candidates, matches, Date.now());
  } catch (err) {
    agentsChannel.warn("pollHookEvents threw", err);
  } finally {
    pollInFlight = false;
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
      agentId: entry.state.agentId ?? undefined,
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
    acknowledge(terminalId) {
      // Deliberately not wired to any host-side focus subscription — see
      // AgentsService.acknowledge's public doc comment for why. Just
      // forwards into the same reducer path every other event goes
      // through; "activated" already no-ops when there's nothing pending
      // (see agent-activity-model.ts's reduce()).
      applyEvent(terminalId, { type: "activated" });
    },
  };
  return agentsService;
}
