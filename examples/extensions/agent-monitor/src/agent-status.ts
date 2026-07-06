/**
 * The per-terminal agent-status state machine — the pure, unit-tested core of
 * the extension. `index.tsx` feeds it events (OSC detections, terminal
 * activations) and renders the derived row/badge; all the rules live here.
 *
 * The model it implements:
 *
 * - A terminal is an **agent** if it was created as one (kind `"claude"`/`"pi"`)
 *   or an agent-specific OSC detector fires in it (covers typing `claude` into
 *   a plain shell). Plain shell-integration traffic (OSC 133) on a kind-`"shell"`
 *   terminal demotes it again once the agent process is gone.
 * - While an agent is **working** it shows a busy row (with a start timestamp
 *   so the host renders elapsed time).
 * - When work stops (working → waiting/done) the terminal **needs attention**
 *   — sticky until the user views it — unless it was already the active tab.
 * - **Activation** (the user views the terminal) clears needs-attention.
 *
 * Non-agent terminals derive no row and no badge, whatever their activity.
 */

import type { TerminalKind } from "@silo-code/sdk";

/** Detected activity for a terminal. `"none"` = nothing observed yet. */
export type Activity = "none" | "working" | "waiting" | "done" | "error";

/** Which class of source produced a detection — see `osc-detectors.ts`. */
export type EventSource = "agent" | "shell" | "timer";

export interface TerminalAgentState {
  /** The terminal record's kind at registration time. */
  kind: TerminalKind;
  /** Whether this terminal currently hosts an agent (see module doc). */
  isAgent: boolean;
  /** Last observed activity. */
  activity: Activity;
  /** Sticky "finished, go look" flag — cleared by the `activated` event. */
  needsAttention: boolean;
  /** ISO timestamp of when the current work started; null when not working. */
  workingSince: string | null;
}

export type AgentEvent =
  | {
      type: "detected";
      status: Activity;
      /**
       * `"agent"`/`"shell"` from the matching detector; `"timer"` for the
       * idle-debounce fallback (neutral: never promotes or demotes).
       */
      source: EventSource;
      /** Whether this terminal was the active tab when the event arrived. */
      isActiveTerminal: boolean;
      /** ISO timestamp for the event (stamps `workingSince`). */
      now: string;
    }
  | { type: "activated" };

export function initialState(kind: TerminalKind): TerminalAgentState {
  return {
    kind,
    isAgent: kind !== "shell",
    activity: "none",
    needsAttention: false,
    workingSince: null,
  };
}

/**
 * Apply one event. Returns `prev` **by identity** when nothing changed — the
 * caller uses that to skip invalidations, which matters because Claude Code's
 * braille spinner emits an OSC 0 per animation frame.
 */
export function reduce(
  prev: TerminalAgentState,
  ev: AgentEvent,
): TerminalAgentState {
  if (ev.type === "activated") {
    return prev.needsAttention ? { ...prev, needsAttention: false } : prev;
  }

  // Promotion first: an agent-specific detector marks this terminal as an
  // agent whatever its kind, and before the activity transition so the
  // transition sees the promoted flag.
  let isAgent = prev.isAgent || ev.source === "agent";

  let { activity, needsAttention, workingSince } = prev;
  if (ev.status !== activity) {
    // Born-agent terminals (kind !== "shell") use agent-source or timer events
    // as the authoritative signal. Shell events can promote them to "working"
    // (needed for pi's OSC 133;C steps), but cannot pull them back out of
    // "working" — that prevents subprocess shell-integration OSC 133;A/D
    // (emitted inside Claude Code's bash tool calls) from causing flicker.
    const blockShellDemotion =
      ev.source === "shell" && prev.kind !== "shell" && ev.status !== "working";
    if (!blockShellDemotion) {
      if (ev.status === "working") {
        workingSince = ev.now;
        needsAttention = false;
      } else {
        if (
          activity === "working" &&
          (ev.status === "waiting" || ev.status === "done")
        ) {
          // Work just stopped: flag for attention unless the user is already
          // looking at this terminal.
          needsAttention = isAgent && !ev.isActiveTerminal;
        }
        workingSince = null;
      }
      activity = ev.status;
    }
  }

  // Demotion last: plain shell-integration traffic on a kind-"shell" terminal
  // means the agent process is gone (we're back at the zsh/bash prompt).
  // Deferred while attention is pending so an unseen "agent finished" — set
  // just above when the agent's exit ended a working phase — isn't lost; the
  // next shell event after the user views it completes the demotion.
  if (ev.source === "shell" && prev.kind === "shell" && !needsAttention) {
    isAgent = false;
  }

  if (
    isAgent === prev.isAgent &&
    activity === prev.activity &&
    needsAttention === prev.needsAttention &&
    workingSince === prev.workingSince
  ) {
    return prev;
  }
  return { ...prev, isAgent, activity, needsAttention, workingSince };
}

/**
 * The Workspaces-panel row for a terminal, or `null` for no row.
 * Only agents get rows, and only while working or needing attention.
 */
export function deriveStatusRow(
  s: TerminalAgentState,
): { status: "busy" | "warn"; startedAt?: string } | null {
  if (!s.isAgent) return null;
  if (s.activity === "working") {
    return { status: "busy", startedAt: s.workingSince ?? undefined };
  }
  if (s.needsAttention) return { status: "warn" };
  return null;
}

export type TabBadge = "working" | "attention" | "waiting" | "done" | "error";

/** The terminal-tab badge for a terminal, or `null` for none. Agents only. */
export function deriveTabBadge(s: TerminalAgentState): TabBadge | null {
  if (!s.isAgent) return null;
  if (s.activity === "working") return "working";
  if (s.needsAttention) return "attention";
  switch (s.activity) {
    case "waiting":
      return "waiting";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return null;
  }
}
