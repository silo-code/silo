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
  /** ISO timestamp of when needsAttention was set; null when not pending. */
  attentionSince: string | null;
  /** ISO timestamp of when the current work started; null when not working. */
  workingSince: string | null;
  /**
   * Which source last set activity to "working"; null when not working.
   * Used to gate timer-source demotion: the idle-fallback timer should only
   * end a working phase that was established by a shell-source event (pi).
   * Agent-sourced working phases (Claude Code) must end via an agent-source
   * event — blocking the timer prevents a false "needs attention" when OSC
   * streaming pauses because the terminal tab goes to the background.
   */
  workingSource: "agent" | "shell" | null;
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
    attentionSince: null,
    workingSince: null,
    workingSource: null,
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
    return prev.needsAttention
      ? { ...prev, needsAttention: false, attentionSince: null }
      : prev;
  }

  // Promotion first: an agent-specific detector marks this terminal as an
  // agent whatever its kind, and before the activity transition so the
  // transition sees the promoted flag.
  let isAgent = prev.isAgent || ev.source === "agent";

  let {
    activity,
    needsAttention,
    attentionSince,
    workingSince,
    workingSource,
  } = prev;
  if (ev.status !== activity) {
    // Block demotion events that shouldn't end an agent's working phase:
    //   • Shell-source non-working on a born-agent: subprocess OSC 133;A/D from
    //     inside Claude's bash tool calls must not pull Claude back out of
    //     "working" (flicker). Only applies to born-agents (kind !== "shell")
    //     since promoted shell terminals legitimately see shell-source demotion.
    //   • Timer-source when working was agent-sourced: the shell idle timer is
    //     the fallback for pi (shell-sourced working). When the terminal tab goes
    //     to the background, OSC streaming pauses and the timer fires — but that
    //     must not produce a false "needs attention" for any terminal whose
    //     working phase was established by an agent-source event (the braille
    //     spinner). This covers both born-agent terminals (kind "claude") AND
    //     shell terminals running Claude Code (kind "shell", promoted). Only an
    //     agent-source event (the explicit ✳ idle signal) can end it.
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
      } else {
        if (
          activity === "working" &&
          (ev.status === "waiting" || ev.status === "done")
        ) {
          // Work just stopped: flag for attention unless the user is already
          // looking at this terminal. Stamp when it starts so the row can
          // show how long it's been waiting, same as the busy row's elapsed time.
          needsAttention = isAgent && !ev.isActiveTerminal;
          attentionSince = needsAttention ? ev.now : null;
        }
        workingSince = null;
        workingSource = null;
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
    attentionSince === prev.attentionSince &&
    workingSince === prev.workingSince &&
    workingSource === prev.workingSource
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
  };
}

// Matches a leading agent-status glyph an OSC title may carry: the Claude/
// Codex braille spinner (U+2800-U+28FF), Claude's ✳ idle signal, or Codex's
// "[ ! ]"/"[ . ]" action-required marker — plus any following whitespace.
const LEADING_MARKER_RE = /^(?:[⠀-⣿]|✳|\[ [!.] \])\s*/;

/**
 * Strip the leading agent-status glyph from a terminal title before showing
 * it as a Workspaces-panel status-row label. The glyph is meaningful in the
 * tab title (paired with the tab's own spinner/badge icon) but redundant —
 * and visually noisy — next to the row's own status dot.
 */
export function stripStatusMarker(title: string): string {
  return title.replace(LEADING_MARKER_RE, "");
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
  if (s.needsAttention) {
    return { status: "warn", startedAt: s.attentionSince ?? undefined };
  }
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
