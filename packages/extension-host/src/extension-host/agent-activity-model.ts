/**
 * The per-terminal agent-activity state machine backing `ctx.agents` — the
 * pure, unit-tested core of the host implementation (RFC 0017). Ported from
 * `silo-extensions/agent-monitor`'s private `agent-status.ts`, which proved
 * this model out first; the rules below are the same ones, centralized.
 *
 * - A terminal is an **agent** if it was created as one (kind `"claude"`/`"pi"`)
 *   or an agent-specific signal fires in it (covers typing `claude` into a
 *   plain shell).
 * - While working, `workingSince` stamps when so elapsed time can render.
 * - When work stops, the terminal is **finished, unseen** — sticky until viewed.
 * - Viewing a finished terminal acknowledges it: `waiting` → `done`.
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
}

export type AgentActivityEvent =
  | {
      type: "detected";
      status: "working" | "waiting" | "done" | "error";
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
    }
  | {
      /** A brand-new session has taken over this terminal id (after "dead" +
       * auto-recreate). Clears "dead" back to a fresh, unstarted state. */
      type: "reset";
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
    };
  }

  if (ev.type === "activated") {
    if (!prev.needsAttention) return prev;
    const activity =
      prev.activity === "waiting" ? ("done" as const) : prev.activity;
    return { ...prev, needsAttention: false, attentionSince: null, activity };
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
    const redundantIdle = activity === "done" && ev.status === "waiting";

    if (!blockDemotion && !redundantIdle) {
      if (ev.status === "working") {
        workingSince = ev.now;
        workingSource = ev.source === "agent" ? "agent" : "shell";
        needsAttention = false;
        attentionSince = null;
        activity = ev.status;
      } else {
        let nextActivity: AgentActivity = ev.status;
        if (
          activity === "working" &&
          (ev.status === "waiting" || ev.status === "done")
        ) {
          needsAttention = isAgent && !ev.isActiveTerminal;
          attentionSince = needsAttention ? ev.now : null;
          if (isAgent && ev.isActiveTerminal) nextActivity = "done";
        }
        workingSince = null;
        workingSource = null;
        activity = nextActivity;
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
 * Given the state just before and just after a `reduce()` call, clear the
 * resolved resume-identity fields if this transition just demoted a
 * promoted-shell terminal back to non-agent (`isAgent` true → false). A
 * normal `exit` isn't a "session ended unexpectedly, here's how to resume"
 * situation — the shell is alive and fine — so the earlier resolved hint is
 * no longer meaningful and would be misleading if left in place. Returns
 * `next` unchanged (by reference) when no demotion just happened, so callers
 * can still rely on reference equality to detect a real change.
 */
export function clearResumeIdentityOnDemotion(
  prev: AgentActivityState,
  next: AgentActivityState,
): AgentActivityState {
  if (!prev.isAgent || next.isAgent) return next;
  if (
    next.sessionId === null &&
    next.resumeCommand === null &&
    next.agentName === null
  ) {
    return next;
  }
  return { ...next, sessionId: null, resumeCommand: null, agentName: null };
}
