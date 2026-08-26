/**
 * The pure, unit-tested projection layer: turns a host-computed
 * {@link AgentInfo} (from `ctx.agents`) into the Workspaces-panel status row
 * and terminal-tab badge this extension renders. Since Silo 0.39 the host
 * owns *all* detection, persistence, stale-gap tracking, and reboot recovery —
 * so this module carries none of that; it only decides how the shared agent
 * state should *look*.
 *
 * The visual vocabulary it maps onto:
 *
 * - **working** → a working Activity row (with `workingSince` so the host
 *   renders elapsed time) and a spinner tab badge.
 * - **idle + needsAttention** → the "finished, unseen" state: a green `ready`
 *   row + check tab badge, sticky until the user views the terminal (at which
 *   point the host clears `needsAttention` via `ctx.agents.acknowledge`).
 * - **idle + acknowledged** → a neutral/grey row (no activity glyph) and no
 *   tab badge — the run finished and has been seen.
 * - **error** → a red `error` row + badge.
 * - **dead** → a `warn` row + badge: the terminal's backend was confirmed gone
 *   after an unclean shutdown (new in `ctx.agents`). The tab tooltip surfaces
 *   the agent's `resumeCommand` when the host resolved one.
 * - **none** (never ran, or a plain non-agent shell) → no row, no badge.
 */

import type { AgentInfo, Activity } from "@silo-code/sdk";

/** The Workspaces-panel row for a terminal, or `null` for no row. An empty
 * object is a row with no activity glyph — the host's neutral/grey "done"
 * fallback (ADR 0030). */
export type StatusRowView = { activity?: Activity; startedAt?: string };

/**
 * `forcedAttentionSince` keeps an idle agent green even though the host cleared
 * (or never raised) `needsAttention`: the "Keep it until the next run" focus
 * mode wants a finish to stay flagged even when you were *watching* the
 * terminal — a case the host deliberately treats as already-seen. When present,
 * it's the timestamp of that finish, so the row still renders elapsed time.
 * `index.tsx` supplies it only in that mode; host `needsAttention` always wins
 * when both are set. See {@link stoppedWorking}.
 */
export function deriveStatusRow(
  a: AgentInfo,
  forcedAttentionSince?: string,
): StatusRowView | null {
  if (!a.isAgent) return null;
  switch (a.activity) {
    case "working":
      return { activity: "working", startedAt: a.workingSince };
    case "error":
      return { activity: "error" };
    case "dead":
      return { activity: "warn" };
    case "idle":
      // Finished-unseen shows the green "go look" row; once acknowledged
      // (needsAttention cleared, and not force-held) it settles into the
      // neutral grey row — which never disappears while the agent terminal is
      // open, only greys out.
      if (a.needsAttention)
        return { activity: "ready", startedAt: a.attentionSince };
      if (forcedAttentionSince !== undefined)
        return { activity: "ready", startedAt: forcedAttentionSince };
      return {};
    case "none":
    default:
      return null;
  }
}

/** The terminal-tab badge (Activity glyph + tooltip) for a terminal, or `null`
 * for none. Acknowledged-idle and never-ran agents show nothing. */
export interface TabView {
  activity: Activity;
  tooltip: string;
}

/** `forceAttention` mirrors {@link deriveStatusRow}'s `forcedAttentionSince`:
 * hold the "Finished" badge on an idle agent whose finish should stay flagged
 * even though the host cleared/never raised `needsAttention`. */
export function deriveTab(
  a: AgentInfo,
  forceAttention = false,
): TabView | null {
  if (!a.isAgent) return null;
  switch (a.activity) {
    case "working":
      return { activity: "working", tooltip: withStale(a, "Agent working") };
    case "error":
      return { activity: "error", tooltip: withStale(a, "Agent error") };
    case "dead":
      return {
        activity: "warn",
        tooltip: a.resumeCommand
          ? `Agent session ended — ${a.resumeCommand}`
          : "Agent session ended",
      };
    case "idle":
      return a.needsAttention || forceAttention
        ? { activity: "ready", tooltip: withStale(a, "Finished") }
        : null;
    case "none":
    default:
      return null;
  }
}

/**
 * Whether this snapshot represents an agent that just *stopped working* —
 * the working → idle transition the notification chime fires on. Compares the
 * previous {@link AgentInfo} for the same terminal against the next; `undefined`
 * `prev` (a terminal seen for the first time) never counts, so seeding the
 * initial snapshot can't ring. Error/dead deliberately don't chime here — they
 * mirror the pre-`ctx.agents` behavior, which only sounded on a clean finish.
 */
export function stoppedWorking(
  prev: AgentInfo | undefined,
  next: AgentInfo,
): boolean {
  return (
    next.isAgent && prev?.activity === "working" && next.activity === "idle"
  );
}

/**
 * The "(unconfirmed…)" suffix appended to a status-row label or tab tooltip
 * when {@link AgentInfo.stale} is set — a restored busy/attention state that
 * followed a long-enough gap that the agent may have finished unobserved.
 * `variant` picks the wording: the row label is terse; the tooltip has room.
 */
export function staleSuffix(
  stale: boolean,
  variant: "label" | "tooltip",
): string {
  if (!stale) return "";
  return variant === "label"
    ? " (unconfirmed)"
    : " (unconfirmed since restart)";
}

function withStale(a: AgentInfo, base: string): string {
  return `${base}${staleSuffix(a.stale, "tooltip")}`;
}

// Matches a leading agent-status glyph an OSC title may carry: the Claude/
// Codex braille spinner (U+2800-U+28FF), Claude's ✳ idle signal, or Codex's
// "[ ! ]"/"[ . ]" action-required marker — plus any following whitespace.
const LEADING_MARKER_RE = /^(?:[⠀-⣿]|✳|\[ [!.] \])\s*/;

// Cursor Agent encodes status as a trailing " - <emoji?> <status>" segment
// (optionally with a worktree suffix on the full title). Strip that so the
// row label is just the chat/agent name.
const CURSOR_STATUS_SUFFIX_RE =
  / - (?:[📤📂🔄⌨️🧭⏳📋❓🔐📝✅]\s*)?(?:Moving to cloud|Loading conversation|Reconnecting|Running shell command|Planning|Working.*|Queued|Reviewing changes|Waiting for you|Waiting for confirmation|Ready)(?: \([^)]+\))?$/;

/**
 * Strip agent-status glyphs/suffixes from a terminal title before showing it
 * as a Workspaces-panel status-row label. The host detects agent activity from
 * these markers, but they're redundant — and visually noisy — next to the
 * row's own status dot. (The tab title keeps them, paired with its spinner.)
 */
export function stripStatusMarker(title: string): string {
  const withoutCursor = title.replace(CURSOR_STATUS_SUFFIX_RE, "");
  return withoutCursor.replace(LEADING_MARKER_RE, "");
}
