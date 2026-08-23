import { invoke } from "@tauri-apps/api/core";
import { subscribe } from "valtio";
import { store } from "../state/store";
import { getTerminalService } from "./terminal-service";
import { onTerminalForeground } from "./terminal-foreground";
import type { TerminalForeground } from "./terminal-foreground";
import {
  genericHint,
  catalogResumeHint,
  isKnownAgentLeader,
  parseResumeSessionIdFromArgv,
  type ResumeHint,
} from "./agent-resume-hint";
import { agentsChannel } from "./agents-channel";
import {
  detectFromOsc,
  detectIdleAfterWorking,
  detectFromOutput,
  agentById,
  agentByLeader,
  agentByProcessArgs,
  leaderBasename,
  type AgentDefinition,
} from "./agent-catalog";
import {
  shouldAcceptHookSessionId,
  hookEventCompatibleWithStickyAgent,
  type HookEvent,
} from "./agent-hook-events";
import { createSessionFileResumeRuntime } from "./agent-session-file-resume";
import { createHookRuntime } from "./agent-hook-runtime";
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
// @silo-code/sdk (agents-service.ts). See RFC 0018. Detection and
// resume-hint resolution are both sealed here — no registration API.
//
// Architecture: mirrors processes-service.ts (host-computed, shared,
// cached-snapshot pattern). One entry per tracked terminal, fed by the
// existing OSC dispatch (getTerminalService().subscribeOsc — the same
// shared oscListeners pipeline `ctx.terminals.subscribeOsc` uses) and the
// existing foreground stream (onTerminalForeground), which also triggers
// live resume-hint resolution the first time a known agent leader appears.

type TrackedAgent = {
  info: AgentInfo;
  state: AgentActivityState;
  lastLiveAt: string;
  resumeHintResolved: boolean;
  /** Last-known foreground pgid, updated on every foreground tick — used to
   * correlate an opt-in hook event's reported pid against this terminal
   * specifically (see agent-hook-events.ts). `null` until the first tick. */
  currentPgid: number | null;
  /**
   * Sticky pgid of the most recently observed known-agent foreground leader.
   * Survives tool-use pgid drift so SessionStart hook correlation still works
   * while a bash/zsh tool subprocess owns the foreground. Cleared on demotion
   * / reset. `null` until a known agent leader has been seen.
   */
  agentPgid: number | null;
  /**
   * Sticky catalog id (`"claude"`, `"grok"`, …) of the leader that set
   * {@link agentPgid}. Used to reject foreign SessionStart hooks that share a
   * pid (Grok imports Claude's `~/.claude/settings.json` and re-fires Silo's
   * Claude hook against Grok's own process). Cleared with `agentPgid`.
   */
  agentCatalogId: string | null;
  /**
   * Timestamp of the hook event that produced {@link AgentActivityState.sessionId}.
   * Used so an earlier SessionStart can replace a wrongly restored/probed id,
   * while a later probe cannot. `null` until a hook match stamps it (including
   * after restore from disk — null lets the backlog correct a bad persist).
   */
  hookSessionTimestamp: string | null;
  /**
   * One-shot restart guard: when we restore an already-acknowledged idle agent,
   * the first live working→idle (reattach redraw / OSC title refresh) must not
   * re-raise `needsAttention` — the user already cleared it. Consumed on that
   * first working→idle so a later real turn still flags attention normally.
   */
  suppressNextAttention: boolean;
  /**
   * PTY session id the foreground stream ({@link cleanupFg}) is currently
   * subscribed to. Unlike the OSC/output subscriptions (keyed by the stable
   * terminal id), `onTerminalForeground` is keyed by the *PTY* session id,
   * which changes when a dead terminal is recreated (e.g. after a reboot).
   * Tracking it lets {@link attachSession} notice the id changed under an
   * already-tracked terminal and re-bind the stream to the new session — so a
   * resumed agent's foreground leader is still detected. `null` before the
   * first bind.
   */
  fgSessionId: string | null;
  cleanupOsc: () => void;
  cleanupFg: () => void;
  /** Raw-PTY-output subscription, for agents whose status isn't reliably
   * exposed via OSC at all (Cursor Agent's spinner fallback). */
  cleanupOutput: () => void;
};

// Map<terminalId, TrackedAgent>.
const trackedAgents = new Map<string, TrackedAgent>();

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
  return Array.from(trackedAgents.values())
    .filter((e) => e.info.workspaceId === wsId)
    .map((e) => e.info);
}

function allWorkspaceInfos(): AgentInfo[] {
  return Array.from(trackedAgents.values()).map((e) => e.info);
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
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;

  const reduced = reduce(entry.state, ev);
  // A "process-gone" demotion (session-file registry drop) deliberately keeps
  // the resolved resume identity — reduce() already spreads it through, so
  // skip resetOnDemotion, which would clear it. Every other demotion (a live
  // shell reclaiming the prompt / a shell-sourced idle) runs through
  // resetOnDemotion, which wipes the now-stale hint.
  let next =
    ev.type === "process-gone"
      ? reduced
      : resetOnDemotion(entry.state, reduced);

  // Restored acknowledged-idle: swallow the first working→idle so a reattach
  // OSC redraw doesn't look like a brand-new finished turn (confirmed live:
  // Claude/Codex/Copilot all flipped needsAttention on restart with identical
  // attentionSince while the focused Cursor tab stayed clear).
  if (
    entry.suppressNextAttention &&
    entry.state.activity === "working" &&
    next.activity === "idle"
  ) {
    entry.suppressNextAttention = false;
    if (next.needsAttention) {
      next = { ...next, needsAttention: false, attentionSince: null };
    }
  }

  const isLiveTick =
    (ev.type === "detected" && ev.source !== "timer") ||
    ev.type === "dead" ||
    ev.type === "reset" ||
    ev.type === "exited";

  // Re-arm resume-hint resolution on demotion, so a later agent invocation
  // in the same terminal gets its own fresh generic hint rather than being
  // permanently skipped by the earlier one.
  if (entry.state.isAgent && !reduced.isAgent) {
    entry.resumeHintResolved = false;
    // Drop the sticky agent pgid on demotion so a later agent in this same
    // terminal can't be correlated against the previous one's SessionStart
    // hook pid. (Matching still uses currentPgid, so a still-running agent
    // that simply went idle is unaffected — demotion only fires when the
    // shell reclaims the prompt.)
    entry.agentPgid = null;
    entry.agentCatalogId = null;
    entry.hookSessionTimestamp = null;
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
    // Pending session-file retries (Grok first-char write) must not fire after
    // demotion and re-stamp an exact id onto a plain shell.
    sessionFileResume.clearSessionFileTimersFor(terminalId);
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
  const entry = trackedAgents.get(terminalId);
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
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;
  if (entry.resumeHintResolved) return;

  const stickyAgent = entry.agentCatalogId
    ? agentById(entry.agentCatalogId)
    : undefined;
  if (stickyAgent) {
    entry.resumeHintResolved = true;
    applyResumeHint(terminalId, catalogResumeHint(stickyAgent, cwd));
    return;
  }

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
 *
 * Pending `needsAttention` must not block this: a shell-sourced `"detected"`
 * idle gates demotion so a stray OSC 133 doesn't wipe an unread badge, but
 * an OS-level prompt reclaim means the agent process is gone — we fire
 * `"exited"` instead, which force-demotes.
 */
function checkPromptDemotion(terminalId: string, atPrompt: boolean) {
  const entry = trackedAgents.get(terminalId);
  if (!entry || !atPrompt) return;
  if (entry.state.kind !== "shell" || entry.state.activity === "dead") return;
  if (entry.state.isAgent) {
    demotePromotedShell(terminalId);
    return;
  }
  // Not (or no longer) an agent, yet a resume identity is still attached — a
  // prior `process-gone` demotion (session-file drop) preserved it. The shell
  // is now confirmed live at its prompt, so that hint is stale: clear it. (The
  // clean-exit path lands here; a reboot never delivers an at-prompt tick, so
  // the hint survives to markSessionDead there instead.)
  if (entry.state.resumeCommand || entry.state.sessionId) {
    clearStaleResume(terminalId);
  }
}

/**
 * Force-demote a promoted shell whose shell is confirmed live again (OS-level
 * at-prompt reclaim). Uses the `"exited"` activity event so demotion isn't
 * blocked by `needsAttention` the way a shell-sourced `"detected"` idle is
 * (that gate exists so a stray OSC 133 doesn't wipe an unread idle badge — but
 * an OS-level prompt reclaim means the agent is actually gone). The resolved
 * resume identity is cleared (the shell is alive, so the hint is stale).
 */
function demotePromotedShell(terminalId: string) {
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;
  if (!entry.state.isAgent || entry.state.kind !== "shell") return;
  applyEvent(terminalId, { type: "exited" });
}

/**
 * Demote a promoted shell whose agent *process* is gone (a session-file
 * registry drop) but whose shell liveness is unconfirmed. Unlike
 * {@link demotePromotedShell}, this **keeps** the resolved resume identity so
 * the reboot-resume box can still surface it (a reboot never delivers an
 * at-prompt reclaim to clear it — see the `"process-gone"` event doc).
 */
function notePromotedShellProcessGone(terminalId: string) {
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;
  if (!entry.state.isAgent || entry.state.kind !== "shell") return;
  applyEvent(terminalId, { type: "process-gone" });
}

/**
 * Clear a stale resume identity left on a demoted shell by an earlier
 * `process-gone` demotion, once the shell is confirmed live at its prompt.
 * Mirrors {@link applyResumeHint}'s persist/notify, but blanks the identity
 * fields instead of setting them.
 */
function clearStaleResume(terminalId: string) {
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;
  if (entry.state.resumeCommand == null && entry.state.sessionId == null)
    return;
  entry.state = {
    ...entry.state,
    sessionId: null,
    resumeCommand: null,
    agentName: null,
    agentId: null,
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

/** Apply an exact, hook-reported resume identity to a terminal — upgrading
 * whatever generic hint may already be attached to an exact resume command.
 * Both the command syntax and the display name come from the catalog entry
 * for `event.agent` (see agent-catalog.ts), so this is agent-agnostic; the
 * `${agent} --resume` form is only a defensive fallback for an event whose
 * agent id somehow isn't in the catalog. `resumeHintResolved` is set so the
 * generic path won't later re-stash a vague hint over this one. */
function applyHookMatch(terminalId: string, event: HookEvent) {
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;

  // Grok (and any future Claude-compat CLI) can re-fire Claude's installed
  // SessionStart hook against its own pid/session — reject when the sticky
  // foreground leader is a different catalog agent.
  if (!hookEventCompatibleWithStickyAgent(event.agent, entry.agentCatalogId)) {
    agentsChannel.info(
      `Ignoring ${event.agent} hook session ${event.sessionId} for terminal ${terminalId} — ` +
        `foreground agent is ${entry.agentCatalogId}.`,
    );
    return;
  }

  // Prefer the earliest SessionStart. A later probe must not overwrite a
  // live confirmation; a restart that restored a wrong id (no hook
  // timestamp yet) may still be corrected by the backlog's earliest event
  // (confirmed live: Codex showed `CODEX-PROBE-*` over `019fa9d2-…`).
  if (
    !shouldAcceptHookSessionId(
      entry.state.sessionId,
      entry.hookSessionTimestamp,
      event,
    )
  ) {
    agentsChannel.debug(
      `Ignoring later hook session ${event.sessionId} for terminal ${terminalId} — already confirmed ${entry.state.sessionId}.`,
    );
    return;
  }
  if (entry.state.sessionId === event.sessionId) {
    // Same id (e.g. restart re-read) — still stamp the timestamp so a
    // subsequent probe can't slip through the "restored, no timestamp" path.
    entry.hookSessionTimestamp = event.timestamp;
    return;
  }

  const agent = agentById(event.agent);
  const hook = agent?.resume.kind === "hook" ? agent.resume : undefined;

  entry.resumeHintResolved = true;
  entry.hookSessionTimestamp = event.timestamp;
  entry.agentPgid = event.pid;
  entry.agentCatalogId = event.agent;
  if (!entry.state.isAgent && entry.state.kind === "shell") {
    applyEvent(terminalId, detectedEvent(terminalId, "idle", "agent"));
  }
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

// Session-file exact resume + hook-events consume live in extracted runtimes
// (agent-session-file-resume.ts / agent-hook-runtime.ts). Host owns sticky
// identity + applyHookMatch; the runtimes own timers/watches/checkpoints.
const sessionFileResume = createSessionFileResumeRuntime({
  getSticky(terminalId) {
    const entry = trackedAgents.get(terminalId);
    if (!entry) return null;
    return {
      agentCatalogId: entry.agentCatalogId,
      agentPgid: entry.agentPgid,
      resolvedAgentId: entry.state.agentId ?? undefined,
      resolvedSessionId: entry.state.sessionId ?? undefined,
      resolvedResumeCommand: entry.state.resumeCommand ?? undefined,
    };
  },
  listSessionFileTargets() {
    const out: Array<{
      terminalId: string;
      agentCatalogId: string;
      agentPgid: number;
    }> = [];
    for (const [terminalId, entry] of trackedAgents) {
      if (entry.agentPgid == null || entry.agentCatalogId == null) continue;
      out.push({
        terminalId,
        agentCatalogId: entry.agentCatalogId,
        agentPgid: entry.agentPgid,
      });
    }
    return out;
  },
  applyResumeHint,
  notePromotedShellProcessGone,
});

const hookRuntime = createHookRuntime({
  listTerminals() {
    return Array.from(trackedAgents.entries()).map(([terminalId, entry]) => ({
      terminalId,
      pgid: entry.currentPgid,
      agentPgid: entry.agentPgid,
      agentCatalogId: entry.agentCatalogId,
    }));
  },
  applyHookMatch,
});

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
  // Pi (and any agent that stamps a catalog id) emits OSC 133 A/B/C around
  // *message zones*, not shell prompts — A at the start of each render, C at
  // the end. Treating those as shell idle/working flickers the tab through a
  // turn (working on submit → idle while thinking → working on tokens). Once
  // identified, ignore shell-integration OSC; agent detectors (e.g. pi's
  // OSC 9;4 progress) own working/idle. OS at-prompt reclaim still demotes.
  if (result.source === "shell") {
    const entry = trackedAgents.get(terminalId);
    if (entry?.state.agentId) return;
  }

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
  // Identity detectors (pi's title) carry a catalog id — stamp it so a later
  // OSC 133 from the same agent cannot demote this terminal (see reduce()).
  if (result.agentId) stampDetectedAgentIdentity(terminalId, result.agentId);
}

/** Attach catalog identity from an OSC identity signal. Does not invent a
 * session id — only names the agent so shell-integration noise can't wipe
 * the promotion. */
function stampDetectedAgentIdentity(terminalId: string, agentId: string) {
  const entry = trackedAgents.get(terminalId);
  const agent = agentById(agentId);
  if (!entry || !agent) return;
  entry.agentCatalogId = agent.id;
  // Drop any shell-idle timer armed by OSC 133 before we knew this was an
  // agent — otherwise it can still fire and flip activity after identity.
  clearShellIdleTimer(terminalId);
  // If shell zones already flipped us to working, roll back — those weren't
  // real turn signals (pi's message wrappers). Baseline is idle until an
  // agent detector (OSC 9;4) says otherwise.
  if (entry.state.workingSource === "shell") {
    applyEvent(terminalId, detectedEvent(terminalId, "idle", "agent"));
  }
  if (
    entry.state.agentId === agent.id &&
    entry.state.agentName === agent.displayName
  ) {
    return;
  }
  applyResumeHint(terminalId, {
    sessionId: entry.state.sessionId ?? undefined,
    resumeCommand:
      entry.state.resumeCommand ?? `was running ${agent.displayName}`,
    agentName: agent.displayName,
    agentId: agent.id,
  });
}

// ---- session tracking ---------------------------------------------------------

/** Update pgid / sticky agentPgid from a foreground snapshot and run the
 * resume-hint + demotion side effects. Shared by the live stream and the
 * one-shot seed so both paths keep the sticky pid in sync. */
/** A new agent process (a different foreground pgid) has taken over this
 * terminal — clear the *previous* run's resolved session identity so the new
 * session's hook/session-file id isn't rejected as a stale-but-newer duplicate,
 * and re-arm hint resolution so the fresh generic-then-exact hint re-attaches.
 * Keeps `isAgent`/`activity` (the terminal is still an agent, just a new run).
 * `agentName`/`agentId` are left in place — `maybeResolveResumeHint` (called
 * right after this in `noteForeground`, now re-armed) refreshes them from the
 * current leader, so there's no "unknown agent" flicker. */
function resetSessionIdentityForNewInstance(
  entry: TrackedAgent,
  terminalId: string,
) {
  entry.hookSessionTimestamp = null;
  entry.resumeHintResolved = false;
  if (entry.state.sessionId == null && entry.state.resumeCommand == null) {
    return; // nothing resolved yet — re-arming above is all that's needed
  }
  entry.state = { ...entry.state, sessionId: null, resumeCommand: null };
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

/** The agent's exact-resume command builder, if it has an exact-resume path
 * (hook or session-file). `null` for detection-only agents. */
function resumeCommandBuilder(
  agent: AgentDefinition,
): ((sessionId: string) => string) | null {
  const r = agent.resume;
  return r.kind === "hook" || r.kind === "session-file"
    ? r.buildResumeCommand
    : null;
}

/** Resolve a *resumed* session's id straight from the agent's `--resume <id>`
 * argv — the fallback for when resuming didn't re-fire the SessionStart hook
 * (confirmed for Cursor). Reads the agent process's command line via the same
 * `process_exec`/`ps` the rest of the host uses, so it needs no Rust change.
 * No-op once an id is resolved (a hook, if one fires, still wins), for
 * detection-only agents, or for a fresh (non-resume) launch. */
async function resolveResumeIdFromArgv(
  terminalId: string,
  agent: AgentDefinition,
  pgid: number,
) {
  const entry = trackedAgents.get(terminalId);
  if (!entry || entry.state.sessionId) return;
  const build = resumeCommandBuilder(agent);
  if (!build) return;

  let stdout: string;
  try {
    const res = await invoke<{ stdout?: string }>("process_exec", {
      command: "ps",
      args: ["-p", String(pgid), "-o", "args="],
    });
    stdout = res?.stdout ?? "";
  } catch {
    return;
  }

  const sessionId = parseResumeSessionIdFromArgv(stdout);
  if (!sessionId) return;

  // A hook (or session-file read) may have won the race during the await —
  // leave the authoritative id in place.
  const live = trackedAgents.get(terminalId);
  if (!live || live.state.sessionId) return;

  applyResumeHint(terminalId, {
    sessionId,
    resumeCommand: build(sessionId),
    agentName: agent.displayName,
    agentId: agent.id,
  });
  agentsChannel.info(
    `Resolved ${agent.displayName} resume session ${sessionId} for terminal ${terminalId} ` +
      `from its --resume argv (pgid ${pgid}).`,
  );
}

/** Sticky foreground-agent bookkeeping shared by argv0 and node-wrapped paths. */
function stickKnownAgentForeground(
  entry: TrackedAgent,
  terminalId: string,
  fg: TerminalForeground,
  agent: AgentDefinition,
) {
  const prevAgentPgid = entry.agentPgid;
  const becameAgent = prevAgentPgid !== fg.pgid;
  entry.agentPgid = fg.pgid;
  entry.agentCatalogId = agent.id;
  if (becameAgent) {
    if (prevAgentPgid != null) {
      resetSessionIdentityForNewInstance(entry, terminalId);
    }
    hookRuntime.scheduleHookCatchupReads();
    if (agent.resume.kind === "session-file") {
      sessionFileResume.scheduleSessionFileReads(
        terminalId,
        agent,
        agent.resume,
        fg.pgid,
      );
    }
    if (agent.resume.kind === "hook") {
      void resolveResumeIdFromArgv(terminalId, agent, fg.pgid);
    }
  }
}

/** Node-wrapped agents (pi, Claude, Copilot, …) often report argv0 as `node`.
 * Read the foreground pgid's full command line and match safely. */
async function resolveNodeWrappedAgent(
  entry: TrackedAgent,
  terminalId: string,
  fg: TerminalForeground,
) {
  if (fg.pgid <= 0) return;
  let stdout: string;
  try {
    const res = await invoke<{ stdout?: string }>("process_exec", {
      command: "ps",
      args: ["-p", String(fg.pgid), "-o", "args="],
    });
    stdout = res?.stdout ?? "";
  } catch {
    return;
  }
  const agent = agentByProcessArgs(stdout);
  if (!agent) return;

  const live = trackedAgents.get(terminalId);
  if (!live || live !== entry) return;

  stickKnownAgentForeground(live, terminalId, fg, agent);
  maybeResolveResumeHint(terminalId, fg.leader, fg.cwd);
  agentsChannel.debug(
    `terminal ${terminalId} foreground node-wrapped: pgid=${fg.pgid} resolved agent=${agent.id} argv="${stdout.trim()}"`,
  );
}

function noteForeground(
  entry: TrackedAgent,
  terminalId: string,
  fg: TerminalForeground,
  source: "tick" | "seed" = "tick",
) {
  entry.currentPgid = fg.pgid > 0 ? fg.pgid : null;
  // Only refresh the sticky agent pgid while a known agent is the foreground
  // leader — a tool subprocess (zsh/bash/npm) must not overwrite it, or the
  // SessionStart hook's Claude/Codex pid can no longer correlate.
  if (fg.pgid > 0 && isKnownAgentLeader(fg.leader)) {
    const agent = agentByLeader(fg.leader);
    if (agent) stickKnownAgentForeground(entry, terminalId, fg, agent);
  } else if (
    fg.pgid > 0 &&
    leaderBasename(fg.leader) === "node" &&
    !fg.atPrompt
  ) {
    void resolveNodeWrappedAgent(entry, terminalId, fg);
  }
  agentsChannel.debug(
    `terminal ${terminalId} foreground ${source}: pgid=${fg.pgid} agentPgid=${entry.agentPgid} leader="${fg.leader}" cwd=${fg.cwd}` +
      (source === "tick" ? ` atPrompt=${fg.atPrompt}` : ""),
  );
  maybeResolveResumeHint(terminalId, fg.leader, fg.cwd);
  checkPromptDemotion(terminalId, fg.atPrompt);
}

/**
 * (Re)bind the foreground stream for a terminal to `sessionId`, tearing down
 * any previous subscription first, then seed once from the Rust-side snapshot
 * (a foreground that was already stable before this bind fires no change event,
 * so the seed is how we catch it). Used both for the initial attach and to
 * follow a PTY session that was recreated under an already-tracked terminal.
 */
function bindForeground(
  entry: TrackedAgent,
  terminalId: string,
  sessionId: string,
) {
  entry.cleanupFg();
  entry.fgSessionId = sessionId;
  entry.cleanupFg = onTerminalForeground(sessionId, (fg) => {
    noteForeground(entry, terminalId, fg);
  });
  void invoke<TerminalForeground | null>("terminal_foreground_snapshot", {
    sessionId,
  }).then((fg) => {
    if (!fg) {
      agentsChannel.debug(
        `terminal ${terminalId} foreground seed: no snapshot available yet`,
      );
      return;
    }
    noteForeground(entry, terminalId, fg, "seed");
  });
}

function attachSession(terminalId: string) {
  const existing = trackedAgents.get(terminalId);
  if (existing) {
    // Already tracked — but the OSC/output subscriptions are keyed by the
    // stable terminal id while the foreground stream is keyed by the PTY
    // session id. A recreate (reboot, manual "Recreate terminal") swaps in a
    // new PTY session under the same terminal id; re-bind the foreground
    // stream to it so a resumed agent's leader is still detected. (Store
    // mutations, including this sessionId swap, re-run syncSessions → here.)
    const ctx = findTerminalContext(terminalId);
    if (ctx?.rec.sessionId && ctx.rec.sessionId !== existing.fgSessionId) {
      bindForeground(existing, terminalId, ctx.rec.sessionId);
    }
    return;
  }
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

  const entry: TrackedAgent = {
    state,
    info: toAgentInfo(terminalId, ctx.wsId, state),
    lastLiveAt: persisted?.lastLiveAt ?? nowIso,
    resumeHintResolved:
      state.sessionId !== null || state.resumeCommand !== null,
    currentPgid: null,
    agentPgid: null,
    agentCatalogId: null,
    hookSessionTimestamp: null,
    // Only suppress when restore says "idle and already seen" — a restored
    // needsAttention:true (never acked) or mid-working phase must still
    // surface attention on the next idle.
    suppressNextAttention: state.activity === "idle" && !state.needsAttention,
    fgSessionId: null,
    cleanupOsc: () => {},
    cleanupFg: () => {},
    cleanupOutput: () => {},
  };
  trackedAgents.set(terminalId, entry);

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

  // Bind the foreground stream (and seed it) to the current PTY session — a
  // terminal whose foreground was already stable *before* tracking started
  // (e.g. Claude already running when the extension loaded) may never fire
  // another change event, so the seed inside bindForeground is how that case
  // is caught. Mirrors processes-service.ts's identical seeding step.
  bindForeground(entry, terminalId, ctx.rec.sessionId);

  if (state.activity !== "none")
    store.agentState[terminalId] ??= toPersisted(
      ctx.wsId,
      state,
      entry.lastLiveAt,
    );
}

function detachSession(terminalId: string) {
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;
  entry.cleanupOsc();
  entry.cleanupFg();
  entry.cleanupOutput();
  clearShellIdleTimer(terminalId);
  clearAgentIdleTimer(terminalId);
  trackedAgents.delete(terminalId);
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
  for (const tid of trackedAgents.keys()) {
    if (!known.has(tid)) detachSession(tid);
  }
  notify();
}

syncSessions();
subscribe(store, syncSessions);

// ---- session-file / hook runtime boot ------------------------------------

void sessionFileResume.ensureSessionFileWatches();
void hookRuntime.startAgentHooksWatch();
// Still-running sessions' hook events are already on disk at boot/reload.
void hookRuntime.consumeHookEvents();

// Vite HMR: tear down watches + catch-up timers and reset the line checkpoint
// so the next module instance re-reads cleanly.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    sessionFileResume.dispose();
    hookRuntime.dispose();
  });
}

// ---- death detection -----------------------------------------------------

/**
 * Called by `TerminalPanel.tsx` the moment it observes a `SESSION_GONE` 404
 * on reattach — the confirmed, unclean-death signal (see RFC 0018's
 * "Testing the death transition" and the `TerminalPanel.tsx` integration
 * note). Fires the terminal's activity to `"dead"` using whatever resume
 * hint was already resolved live; if none was ever resolved (this terminal's
 * leader never matched a known agent), falls back to the generic hint using
 * the last-known `leader`/`cwd`.
 */
function markSessionDead(terminalId: string): void {
  const entry = trackedAgents.get(terminalId);
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
function resetSessionAfterRecreate(terminalId: string): void {
  const entry = trackedAgents.get(terminalId);
  if (!entry) return;
  entry.resumeHintResolved = false;
  entry.agentPgid = null;
  entry.agentCatalogId = null;
  entry.hookSessionTimestamp = null;
  sessionFileResume.clearSessionFileTimersFor(terminalId);
  applyEvent(terminalId, { type: "reset" });
}

/** Terminal lifecycle seam — `TerminalPanel` calls these when a PTY session
 * disappears (`SESSION_GONE`) or is replaced after recreate. */
export function notifyTerminalSessionGone(terminalId: string): void {
  markSessionDead(terminalId);
}
export function notifyTerminalSessionRecreated(terminalId: string): void {
  resetSessionAfterRecreate(terminalId);
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
      return trackedAgents.get(terminalId)?.info;
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
