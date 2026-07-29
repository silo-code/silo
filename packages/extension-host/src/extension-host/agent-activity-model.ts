/**
 * The per-terminal agent-activity state machine backing `ctx.agents` — the
 * pure, unit-tested core of the host implementation (RFC 0018). Ported from
 * `silo-extensions/agent-monitor`'s private `agent-status.ts`, which proved
 * this model out first; the rules below are the same ones, centralized.
 *
 * - A terminal is an **agent** if it was created as one (kind `"claude"`/`"pi"`)
 *   or an agent-specific signal fires in it (covers typing `claude` into a
 *   plain shell).
 * - While working, `workingSince` stamps when so elapsed time can render.
 * - When work stops, `activity` becomes `"idle"` — this is purely a fact
 *   about the agent, the same regardless of who's watching.
 *   `needsAttention` is the *separate*, viewer-dependent fact: set only if
 *   the terminal wasn't the active one the instant the agent went idle, and
 *   cleared only by an explicit `"activated"` event (`ctx.agents.acknowledge`).
 *   Watching a terminal live when its agent goes idle never sets
 *   `needsAttention` in the first place — no acknowledgment is needed for
 *   something you already saw happen. (Earlier design: `activity` itself
 *   flipped between `"waiting"`/`"done"` depending on viewer state at that
 *   instant — dropped once it turned out `needsAttention` already carried
 *   that exact information on its own.)
 * - `stale` is soft and self-clearing: a restored `working`/`needsAttention`
 *   duration after a long-enough gap can't be fully trusted, but the next
 *   live signal clears it automatically.
 * - `"dead"` is hard and terminal: the backend was confirmed gone after an
 *   unclean shutdown. Nothing will arrive to resolve it on its own — only a
 *   `"dead"` event sets it, and once set, only a fresh `"reset"` (a brand-new
 *   session taking over the same terminal id) clears it.
 */

import type { AgentActivity, TerminalKind } from "@silo-code/sdk";

export type EventSource = "agent" | "shell" | "timer";

export interface AgentActivityState {
  readonly kind: TerminalKind;
  readonly isAgent: boolean;
  readonly activity: AgentActivity;
  readonly needsAttention: boolean;
  readonly attentionSince: string | null;
  readonly workingSince: string | null;
  /** Which source last set activity to "working"; gates timer-source demotion. */
  readonly workingSource: "agent" | "shell" | null;
  readonly stale: boolean;
  readonly sessionId: string | null;
  readonly resumeCommand: string | null;
  readonly agentName: string | null;
  /** Stable catalog key (e.g. `"claude"`, `"codex"`) — unlike `agentName`
   * (a display string), safe for an extension to switch/compare on without
   * breaking if the display string is ever reworded. Same lifecycle as
   * `agentName`: populated together, cleared together on demotion. */
  readonly agentId: string | null;
}

export type AgentActivityEvent =
  | {
      type: "detected";
      status: "working" | "idle" | "error";
      source: EventSource;
      isActiveTerminal: boolean;
      now: string;
    }
  | { type: "activated" }
  | {
      /** The terminal's backend was confirmed gone (unclean shutdown). Fired
       * once, at the moment `TerminalPanel` observes SESSION_GONE on reattach. */
      type: "dead";
      sessionId?: string;
      resumeCommand?: string;
      agentName?: string;
      agentId?: string;
    }
  | {
      /** A brand-new session has taken over this terminal id (after "dead" +
       * auto-recreate). Clears "dead" back to a fresh, unstarted state. */
      type: "reset";
    }
  | {
      /**
       * The agent process is confirmed gone (shell reclaimed the TTY, or a
       * session-file agent's registry dropped our sticky pgid). Force-demotes
       * a promoted shell even when `needsAttention` is set — unlike a
       * shell-sourced `"detected"` idle, which gates demotion so a stray
       * OSC 133 doesn't wipe an unread idle badge.
       */
      type: "exited";
    };

export function isLiveSignal(
  ev: AgentActivityEvent,
): ev is Extract<AgentActivityEvent, { type: "detected" }> {
  return ev.type === "detected" && ev.source !== "timer";
}

export function initialState(kind: TerminalKind): AgentActivityState {
  return {
    kind,
    isAgent: kind !== "shell",
    activity: "none",
    needsAttention: false,
    attentionSince: null,
    workingSince: null,
    workingSource: null,
    stale: false,
    sessionId: null,
    resumeCommand: null,
    agentName: null,
    agentId: null,
  };
}

/** A restored duration older than this can't be trusted — long enough that
 * it's plausibly a full app-closed gap rather than a quick reload. */
export const STALE_THRESHOLD_MS = 60_000;

/**
 * Rebuild state at activation from persisted data (if any) plus the
 * terminal's current `kind`. `gapMs` is `now - lastLiveAt`; a restored
 * `working`/`needsAttention` duration exceeding {@link STALE_THRESHOLD_MS} is
 * marked `stale` until the next live signal confirms it. A persisted
 * `"dead"` activity is never marked stale — it's already a hard, confirmed fact.
 */
export function restoreState(
  kind: TerminalKind,
  persisted: Omit<AgentActivityState, "kind" | "stale"> | undefined,
  gapMs: number,
): AgentActivityState {
  if (!persisted) return initialState(kind);
  const showingDuration =
    persisted.activity === "working" || persisted.needsAttention;
  const stale =
    persisted.activity !== "dead" &&
    showingDuration &&
    gapMs > STALE_THRESHOLD_MS;
  return { ...persisted, kind, stale };
}

/**
 * Apply one event. Returns `prev` by identity when nothing changed, so
 * callers can skip invalidations on a no-op tick.
 */
export function reduce(
  prev: AgentActivityState,
  ev: AgentActivityEvent,
): AgentActivityState {
  if (ev.type === "reset") {
    if (prev.activity !== "dead") return prev;
    return initialState(prev.kind);
  }

  if (ev.type === "dead") {
    if (prev.activity === "dead") return prev;
    return {
      ...prev,
      activity: "dead",
      needsAttention: false,
      attentionSince: null,
      workingSince: null,
      workingSource: null,
      stale: false,
      sessionId: ev.sessionId ?? prev.sessionId,
      resumeCommand: ev.resumeCommand ?? prev.resumeCommand,
      agentName: ev.agentName ?? prev.agentName,
      agentId: ev.agentId ?? prev.agentId,
    };
  }

  if (ev.type === "activated") {
    if (!prev.needsAttention) return prev;
    return { ...prev, needsAttention: false, attentionSince: null };
  }

  if (ev.type === "exited") {
    // Confirmed agent-process exit (at-prompt reclaim / session-file drop).
    // Force-demote promoted shells; born-agents keep isAgent by design.
    if (!prev.isAgent || prev.kind !== "shell") return prev;
    return {
      ...prev,
      isAgent: false,
      activity: "idle",
      needsAttention: false,
      attentionSince: null,
      workingSince: null,
      workingSource: null,
      stale: false,
    };
  }

  // "dead" is terminal until a "reset" event — no detected signal reopens it.
  if (prev.activity === "dead") return prev;

  let isAgent = prev.isAgent || ev.source === "agent";
  let {
    activity,
    needsAttention,
    attentionSince,
    workingSince,
    workingSource,
    stale,
  } = prev;

  if (isLiveSignal(ev)) stale = false;

  if (ev.status !== activity) {
    const blockDemotion =
      ev.status !== "working" &&
      ((ev.source === "shell" && prev.kind !== "shell") ||
        (ev.source === "timer" && prev.workingSource === "agent"));

    if (!blockDemotion) {
      if (ev.status === "working") {
        workingSince = ev.now;
        workingSource = ev.source === "agent" ? "agent" : "shell";
        needsAttention = false;
        attentionSince = null;
        activity = ev.status;
      } else {
        // ev.status is "idle" or "error". Only an idle transition out of a
        // working phase is a viewer-dependent fact — "error" leaves
        // needsAttention untouched, same as before this rename.
        if (activity === "working" && ev.status === "idle") {
          needsAttention = isAgent && !ev.isActiveTerminal;
          attentionSince = needsAttention ? ev.now : null;
        }
        workingSince = null;
        workingSource = null;
        activity = ev.status;
      }
    }
  }

  if (ev.source === "shell" && prev.kind === "shell" && !needsAttention) {
    isAgent = false;
  }

  if (
    isAgent === prev.isAgent &&
    activity === prev.activity &&
    needsAttention === prev.needsAttention &&
    attentionSince === prev.attentionSince &&
    workingSince === prev.workingSince &&
    workingSource === prev.workingSource &&
    stale === prev.stale
  ) {
    return prev;
  }
  return {
    ...prev,
    isAgent,
    activity,
    needsAttention,
    attentionSince,
    workingSince,
    workingSource,
    stale,
  };
}

/**
 * Given the state just before and just after a `reduce()` call, reset a
 * terminal back to a clean, agent-free slate if this transition just demoted
 * a promoted-shell terminal back to non-agent (`isAgent` true → false). A
 * normal `exit` isn't a "session ended unexpectedly, here's how to resume"
 * situation — the shell is alive and fine — so the earlier resolved
 * resume-identity hint is no longer meaningful, and `activity` shouldn't keep
 * describing a turn state that no longer belongs to any agent: a demoted
 * terminal left at `activity: "idle"` would read as "an idle agent" to a
 * consumer, which is exactly backwards, since there's no agent here at all
 * anymore. `workingSince`/`workingSource` are reset alongside it for the same
 * reason (defensively — the demotion check in `reduce()` doesn't gate on
 * `ev.status`, so this doesn't rely on `activity` already having settled to
 * `"idle"` by the time demotion fires). Returns `next` unchanged (by
 * reference) when no demotion just happened, so callers can still rely on
 * reference equality to detect a real change.
 */
export function resetOnDemotion(
  prev: AgentActivityState,
  next: AgentActivityState,
): AgentActivityState {
  if (!prev.isAgent || next.isAgent) return next;
  if (
    next.activity === "none" &&
    next.workingSince === null &&
    next.workingSource === null &&
    next.sessionId === null &&
    next.resumeCommand === null &&
    next.agentName === null &&
    next.agentId === null
  ) {
    return next;
  }
  return {
    ...next,
    activity: "none",
    workingSince: null,
    workingSource: null,
    sessionId: null,
    resumeCommand: null,
    agentName: null,
    agentId: null,
  };
}
