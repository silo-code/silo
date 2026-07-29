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
  agentByLeader,
  sessionFileAgents,
  type AgentDefinition,
  type AgentSessionFileResume,
} from "./agent-catalog";
import { homeDir } from "./platform";
import {
  readNewHookEvents,
  matchHookEventsToTerminals,
  pickEarliestMatchPerTerminal,
  pruneUnmatchedEvents,
  pruneAgentHooksEventsFile,
  stampNewHookEvents,
  resetHookEventsCheckpoint,
  disposeHookEventsRuntime,
  resolveAgentHooksDir,
  shouldAcceptHookSessionId,
  hookEventCompatibleWithStickyAgent,
  type HookEvent,
  type PendingHookEvent,
} from "./agent-hook-events";
import { startWatch, stopWatch, onFileChange } from "../services/tauri-watch";
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

type SessionEntry = {
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
  let next = resetOnDemotion(entry.state, reduced);

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
    clearSessionFileTimersFor(terminalId);
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

// ---- session-file resume resolution (e.g. Grok) ---------------------------
//
// Some agents (Grok) keep their OWN live `{ pid → session_id }` registry of
// active sessions, so exact resume needs no hook: read the agent's file and
// match the terminal's sticky agent pgid against the recorded pid (the agent
// runs as a process-group leader, so pgid == pid).
//
// Timing matters: Grok does **not** write a session entry at process start —
// only after the first character is typed in the TUI. Short retries after the
// foreground is first seen cover a write that lands within a few seconds; a
// file watch on the registry's parent dir covers the common case where the
// user types much later (or after Silo's short retries have already finished
// empty). Reload "fixes" it only because attach re-reads a file that now has
// the entry — the watch makes that happen live.

/** Delays (ms after a session-file agent is first seen in the foreground) at
 * which to (re)read its session registry — covers a write that races the
 * first foreground tick. Not a substitute for the file watch: Grok may not
 * create the session until the first typed character, minutes later. */
const SESSION_FILE_READ_DELAYS_MS = [0, 600, 1500, 3000];
/** Per-terminal session-file retry timers. Cleared on demotion/reset so a
 * late retry cannot re-stamp identity onto a plain shell after the agent
 * exited. Global clear remains for HMR dispose. */
const sessionFileTimersByTerminal = new Map<
  string,
  Set<ReturnType<typeof setTimeout>>
>();

function clearSessionFileTimersFor(terminalId: string) {
  const timers = sessionFileTimersByTerminal.get(terminalId);
  if (!timers) return;
  for (const h of timers) clearTimeout(h);
  sessionFileTimersByTerminal.delete(terminalId);
}

function clearAllSessionFileTimers() {
  for (const terminalId of [...sessionFileTimersByTerminal.keys()]) {
    clearSessionFileTimersFor(terminalId);
  }
}

/** Read a session-file agent's registry and, if its entry for `pgid` is
 * present, attach the exact session id + resume command. Idempotent when
 * this agent's exact identity is already correct for that id. If a *foreign*
 * hook already stamped a session id (Grok importing Claude's SessionStart
 * hook is the known case — same pid/session, wrong `agent: "claude"` tag),
 * this still corrects the identity to the session-file agent. Silently
 * returns on a missing/unreadable file (a later retry or file-watch event
 * may still find it). */
async function resolveSessionFileId(
  terminalId: string,
  agent: AgentDefinition,
  resume: AgentSessionFileResume,
  pgid: number,
) {
  const entry = sessions.get(terminalId);
  // Demotion / reset clears sticky catalog id + pgid and cancels timers; a
  // timer that already fired must still no-op so we never re-stamp identity.
  if (!entry || entry.agentCatalogId !== agent.id || entry.agentPgid !== pgid) {
    return;
  }

  let text: string;
  try {
    const base = (await homeDir()).replace(/\/+$/, "");
    text = await invoke<string>("fs_read_text", {
      path: `${base}/${resume.sessionFilePath}`,
    });
  } catch {
    return; // missing/unreadable — a scheduled retry / watch may still catch it
  }

  // The terminal (and its live sticky identity) may have gone away during await.
  const live = sessions.get(terminalId);
  if (!live || live.agentCatalogId !== agent.id || live.agentPgid !== pgid) {
    return;
  }

  const sessionId = resume.resolveSessionId(text, pgid);
  if (!sessionId) {
    // Had an exact session that disappeared from the registry → the agent
    // exited (or closed the session). Demote so the inspector doesn't keep
    // showing a live Grok after `exit`. Only when we previously resolved —
    // Grok doesn't write a session until the first typed character, so a
    // missing entry right after launch must not demote.
    if (live.state.agentId === agent.id && live.state.sessionId) {
      demotePromotedShell(terminalId);
    }
    return;
  }

  const resumeCommand = resume.buildResumeCommand(sessionId);
  if (
    live.state.sessionId === sessionId &&
    live.state.agentId === agent.id &&
    live.state.resumeCommand === resumeCommand
  ) {
    return;
  }

  applyResumeHint(terminalId, {
    sessionId,
    resumeCommand,
    agentName: agent.displayName,
    agentId: agent.id,
  });
  agentsChannel.info(
    `Resolved ${agent.displayName} session ${sessionId} for terminal ${terminalId} ` +
      `from ${resume.sessionFilePath} (pgid ${pgid}).`,
  );
}

/** Re-read every tracked session-file agent's registry against its sticky
 * agent pgid. Driven by the session-file watch (and boot), so a session
 * written long after the foreground was first detected still resolves. */
function resolveAllSessionFileAgents() {
  for (const [terminalId, entry] of sessions) {
    if (entry.agentPgid == null || entry.agentCatalogId == null) continue;
    const agent = agentById(entry.agentCatalogId);
    if (agent?.resume.kind !== "session-file") continue;
    void resolveSessionFileId(terminalId, agent, agent.resume, entry.agentPgid);
  }
}

/** Schedule the first + short-retry reads of a session-file agent's registry
 * after it's first seen in a terminal's foreground. Also ensures the parent
 * dir is watched so a later first-message write still resolves. */
function scheduleSessionFileReads(
  terminalId: string,
  agent: AgentDefinition,
  resume: AgentSessionFileResume,
  pgid: number,
) {
  void ensureSessionFileWatches();
  // Replace any prior retry schedule for this terminal (re-foreground).
  clearSessionFileTimersFor(terminalId);
  const timers = new Set<ReturnType<typeof setTimeout>>();
  sessionFileTimersByTerminal.set(terminalId, timers);
  for (const ms of SESSION_FILE_READ_DELAYS_MS) {
    if (ms === 0) {
      void resolveSessionFileId(terminalId, agent, resume, pgid);
      continue;
    }
    const h = setTimeout(() => {
      timers.delete(h);
      if (timers.size === 0) sessionFileTimersByTerminal.delete(terminalId);
      void resolveSessionFileId(terminalId, agent, resume, pgid);
    }, ms);
    timers.add(h);
  }
}

const SESSION_FILE_WATCH_PREFIX = "silo-agent-session-file:";
const sessionFileWatchIds = new Set<string>();
let unlistenSessionFileWatch: (() => void) | null = null;
/** True once at least one session-file parent dir is watched. Stays false when
 * the dir doesn't exist yet (Grok never installed / first launch) so the next
 * foreground can retry. */
let sessionFileWatchReady = false;

/** Parent directory of a `$HOME`-relative session file path. */
function sessionFileParentDir(home: string, sessionFilePath: string): string {
  const idx = sessionFilePath.lastIndexOf("/");
  return idx >= 0 ? `${home}/${sessionFilePath.slice(0, idx)}` : home;
}

/**
 * Watch each session-file agent's registry parent dir (e.g. `~/.grok`) so a
 * write that happens after Silo's short post-foreground retries — typical for
 * Grok, which only creates a session on the first typed character — still
 * resolves live. Directory watch (not the jsonl/json file alone) so the
 * watcher survives the file being absent at boot and created on first use.
 * Idempotent; retries later if no dir could be watched yet.
 */
async function ensureSessionFileWatches() {
  if (sessionFileWatchReady) return;
  const agents = sessionFileAgents();
  if (agents.length === 0) return;

  try {
    const home = (await homeDir()).replace(/\/+$/, "");
    const dirs = [
      ...new Set(
        agents.map((a) => sessionFileParentDir(home, a.resume.sessionFilePath)),
      ),
    ];
    for (const dir of dirs) {
      const watchId = `${SESSION_FILE_WATCH_PREFIX}${dir}`;
      if (sessionFileWatchIds.has(watchId)) continue;
      try {
        await startWatch(watchId, dir);
        sessionFileWatchIds.add(watchId);
      } catch (err) {
        // Dir may not exist yet (first-ever Grok install). Retry on the next
        // session-file foreground.
        agentsChannel.debug(
          `Session-file watch not started for ${dir} (will retry).`,
          err,
        );
      }
    }
    if (sessionFileWatchIds.size === 0) return;

    if (!unlistenSessionFileWatch) {
      unlistenSessionFileWatch = await onFileChange((evt) => {
        if (!sessionFileWatchIds.has(evt.watchId)) return;
        void resolveAllSessionFileAgents();
      });
    }
    sessionFileWatchReady = true;
    agentsChannel.info(
      `Session-file watch started on ${[...sessionFileWatchIds].join(", ")} ` +
        `(resolve on write — covers agents that create a session after start).`,
    );
    // Catch a write that landed while we were still wiring the watch.
    resolveAllSessionFileAgents();
  } catch (err) {
    agentsChannel.warn(
      "Could not start session-file watch; short post-foreground retries only.",
      err,
    );
  }
}

void ensureSessionFileWatches();

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
  const entry = sessions.get(terminalId);
  if (!entry || !atPrompt) return;
  if (!entry.state.isAgent || entry.state.kind !== "shell") return;
  demotePromotedShell(terminalId);
}

/**
 * Force-demote a promoted shell (agent process gone). Uses the `"exited"`
 * activity event so demotion isn't blocked by `needsAttention` the way a
 * shell-sourced `"detected"` idle is (that gate exists so a stray OSC 133
 * doesn't wipe an unread idle badge — but an OS-level prompt reclaim or a
 * session-file registry drop means the agent is actually gone).
 */
function demotePromotedShell(terminalId: string) {
  const entry = sessions.get(terminalId);
  if (!entry) return;
  if (!entry.state.isAgent || entry.state.kind !== "shell") return;
  applyEvent(terminalId, { type: "exited" });
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

/** Update pgid / sticky agentPgid from a foreground snapshot and run the
 * resume-hint + demotion side effects. Shared by the live stream and the
 * one-shot seed so both paths keep the sticky pid in sync. */
function noteForeground(
  entry: SessionEntry,
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
    const becameAgent = entry.agentPgid !== fg.pgid;
    entry.agentPgid = fg.pgid;
    entry.agentCatalogId = agent?.id ?? null;
    // SessionStart often lands *after* the first foreground tick (confirmed:
    // Claude #2 wrote events.jsonl ~2s after agentPgid was set; a single
    // immediate poll missed it and the regular 3s ticker then failed to
    // consume the new line until reload). Catch up a few times.
    if (becameAgent) {
      scheduleHookCatchupReads();
      // Session-file agents (Grok) resolve their exact id from their own
      // registry rather than a hook — read it now (and retry) against this
      // foreground pgid. Also re-reads when a foreign hook already stamped a
      // wrong agentId (Grok + Claude settings import).
      if (agent?.resume.kind === "session-file") {
        scheduleSessionFileReads(terminalId, agent, agent.resume, fg.pgid);
      }
    }
  }
  agentsChannel.debug(
    `terminal ${terminalId} foreground ${source}: pgid=${fg.pgid} agentPgid=${entry.agentPgid} leader="${fg.leader}" cwd=${fg.cwd}` +
      (source === "tick" ? ` atPrompt=${fg.atPrompt}` : ""),
  );
  maybeResolveResumeHint(terminalId, fg.leader, fg.cwd);
  checkPromptDemotion(terminalId, fg.atPrompt);
}

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
    agentPgid: null,
    agentCatalogId: null,
    hookSessionTimestamp: null,
    // Only suppress when restore says "idle and already seen" — a restored
    // needsAttention:true (never acked) or mid-working phase must still
    // surface attention on the next idle.
    suppressNextAttention: state.activity === "idle" && !state.needsAttention,
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
    noteForeground(entry, terminalId, fg);
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
    noteForeground(entry, terminalId, fg, "seed");
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

const AGENT_HOOKS_WATCH_ID = "silo-agent-hooks";

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
 * Events read but not yet matched to a terminal, retried on the next
 * consume rather than discarded. This matters because `readNewHookEvents()`
 * is a checkpoint — each line is returned exactly once, ever — but a hook
 * can fire (and the event line get read) *before* Silo's own
 * foreground-tracking has caught up to the terminal's new pgid. Without a
 * retry buffer, that single unlucky consume permanently loses an event that
 * would have matched correctly a few hundred milliseconds later. Pruned by
 * `MAX_EVENT_AGE_MS` measured from {@link PendingHookEvent.firstSeenAt}.
 */
let pendingHookEvents: PendingHookEvent[] = [];

/** Single-flight so rapid notify events / catch-up timers don't overlap
 * reads and race the shared `linesProcessed` checkpoint. A concurrent
 * request sets `consumeQueued` so we run once more after the in-flight
 * consume finishes (otherwise a write during an active read would be
 * missed until the next catch-up/watch event). */
let consumeInFlight = false;
let consumeQueued = false;

/**
 * Delays (ms) after a terminal's foreground first becomes a known agent.
 * Immediate read catches a SessionStart that already wrote; later ticks catch
 * the common case where the hook fires a second or two after `agentPgid` is
 * set (live: Claude #2's events.jsonl line landed ~2s after the foreground
 * tick). Codex may fire SessionStart on the first user message rather than
 * process start — catch-up still helps once the line appears around then.
 */
const HOOK_CATCHUP_DELAYS_MS = [0, 500, 2_000] as const;
const hookCatchupTimers = new Set<ReturnType<typeof setTimeout>>();

function scheduleHookCatchupReads() {
  for (const ms of HOOK_CATCHUP_DELAYS_MS) {
    if (ms === 0) {
      void consumeHookEvents();
      continue;
    }
    const handle = setTimeout(() => {
      hookCatchupTimers.delete(handle);
      void consumeHookEvents();
    }, ms);
    hookCatchupTimers.add(handle);
  }
}

/** Tail `events.jsonl`, match new (+ pending) lines to tracked terminals,
 * apply exact session ids. Shared by the file watch and catch-up reads. */
async function consumeHookEvents() {
  if (consumeInFlight) {
    consumeQueued = true;
    return;
  }
  consumeInFlight = true;

  try {
    do {
      consumeQueued = false;
      if (sessions.size === 0) {
        pendingHookEvents = [];
        continue;
      }

      const now = Date.now();
      const newEvents = stampNewHookEvents(await readNewHookEvents(), now);

      if (newEvents.length > 0) {
        agentsChannel.debug(
          `Read ${newEvents.length} new hook event(s): ` +
            newEvents
              .map((e) => `pid=${e.event.pid}(${e.event.agent})`)
              .join(", "),
        );
      }

      const candidates =
        pendingHookEvents.length > 0
          ? [...pendingHookEvents, ...newEvents]
          : newEvents;
      if (candidates.length === 0) continue;

      const terminals = Array.from(sessions.entries()).map(
        ([terminalId, entry]) => ({
          terminalId,
          pgid: entry.currentPgid,
          agentPgid: entry.agentPgid,
        }),
      );
      const livePids = new Set<number>();
      for (const t of terminals) {
        if (t.pgid != null) livePids.add(t.pgid);
        if (t.agentPgid != null) livePids.add(t.agentPgid);
      }
      const matches = matchHookEventsToTerminals(
        candidates.map((c) => c.event),
        terminals,
      );
      // One terminal can match many backlog lines for the same live pid
      // (real SessionStart + later probes). Keep the earliest event so a
      // probe never wins the race within a single consume.
      const applied = pickEarliestMatchPerTerminal(matches);
      const matchedSessionIds = new Set<string>();
      for (const match of applied) {
        applyHookMatch(match.terminalId, match.event);
        matchedSessionIds.add(match.event.sessionId);
      }
      pendingHookEvents = pruneUnmatchedEvents(
        candidates,
        matches,
        now,
        livePids,
      );
      if (pendingHookEvents.length > 0) {
        agentsChannel.debug(
          `${pendingHookEvents.length} hook event(s) still unmatched: ` +
            pendingHookEvents
              .map((c) => `pid=${c.event.pid}(${c.event.agent})`)
              .join(", ") +
            ` — tracked terminal pgids: ` +
            terminals
              .map(
                (t) =>
                  `${t.terminalId.slice(-8)}=pgid:${t.pgid}/agent:${t.agentPgid}`,
              )
              .join(", "),
        );
      }
      // Remove applied session ids from the jsonl (identity now lives on
      // agentState) and drop aged leftovers so restarts stay quiet.
      try {
        await pruneAgentHooksEventsFile(
          now,
          matchedSessionIds.size > 0 ? matchedSessionIds : undefined,
        );
      } catch (err) {
        agentsChannel.warn("Pruning agent-hooks events.jsonl failed", err);
      }
    } while (consumeQueued);
  } catch (err) {
    agentsChannel.warn("consumeHookEvents threw", err);
  } finally {
    consumeInFlight = false;
    if (consumeQueued) {
      consumeQueued = false;
      void consumeHookEvents();
    }
  }
}

let unlistenHookWatch: (() => void) | null = null;

/** Watch `~/.silo/agent-hooks` and consume on create/modify. Directory watch
 * (not the jsonl file alone) so the watcher survives the file being absent
 * at boot and created on the first SessionStart. */
async function startAgentHooksWatch() {
  try {
    const dir = await resolveAgentHooksDir();
    await invoke("fs_create_dir", { path: dir });
    await startWatch(AGENT_HOOKS_WATCH_ID, dir);
    unlistenHookWatch = await onFileChange((evt) => {
      if (evt.watchId !== AGENT_HOOKS_WATCH_ID) return;
      // Any change under the hooks dir — typically events.jsonl append.
      void consumeHookEvents();
    });
    agentsChannel.info(
      `Hook-events watch started on ${dir} (consume on write, not polled).`,
    );
  } catch (err) {
    agentsChannel.warn(
      "Could not start agent-hooks file watch; catch-up reads only.",
      err,
    );
  }
}

void startAgentHooksWatch();
// Still-running sessions' hook events are already on disk at boot/reload.
void consumeHookEvents();

// Vite HMR: tear down the watch + catch-up timers and reset the line
// checkpoint so the next module instance re-reads cleanly.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const handle of hookCatchupTimers) clearTimeout(handle);
    hookCatchupTimers.clear();
    clearAllSessionFileTimers();
    unlistenHookWatch?.();
    unlistenHookWatch = null;
    void stopWatch(AGENT_HOOKS_WATCH_ID).catch(() => {});
    unlistenSessionFileWatch?.();
    unlistenSessionFileWatch = null;
    for (const id of sessionFileWatchIds) {
      void stopWatch(id).catch(() => {});
    }
    sessionFileWatchIds.clear();
    sessionFileWatchReady = false;
    pendingHookEvents = [];
    consumeInFlight = false;
    consumeQueued = false;
    resetHookEventsCheckpoint();
    disposeHookEventsRuntime();
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
  entry.agentPgid = null;
  entry.agentCatalogId = null;
  entry.hookSessionTimestamp = null;
  clearSessionFileTimersFor(terminalId);
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
