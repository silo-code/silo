import { createHostChannel } from "./output-store";
import { agentByLeader, leaderBasename } from "./agent-catalog";

/** Output-panel channel for `ctx.agents` diagnostics — visible in Silo's own
 * Output window, not the devtools console. */
export const agentsChannel = createHostChannel("silo:agents", "Agents");

// Resume-hint resolution for `ctx.agents` (RFC 0017). There are exactly two
// possible outcomes, and neither one guesses:
//
//   - **Exact** — the opt-in `SessionStart` hook reported this terminal's own
//     session id, PID-correlated against the terminal's foreground process
//     (see `agent-hook-events.ts`). Produces an exact `claude --resume <id>`.
//   - **Generic** — no hook installed/fired. Produces an honest,
//     session-id-less "was running <agent> in <cwd>" note.
//
// There is deliberately **no directory/recency inference** of a session id.
// A guess keyed on cwd + recency cannot tell two concurrent same-directory
// sessions apart and — worse — returns a *confidently wrong* id when it
// misses (a `claude --resume <id>` that fails with "No conversation found").
// The earlier `continues`-based inference tier was removed for exactly that
// reason: a feature that is either exact or honestly vague is stronger than
// one that is sometimes secretly wrong. See RFC 0017 "Rejected: cwd + recency
// inference".

/** Whether `leader` is a known coding agent (per `AGENT_CATALOG`) worth
 * attaching a resume hint to. Gates the generic-hint attachment so a plain
 * shell or unrecognized program never gets one. */
export function isKnownAgentLeader(leader: string): boolean {
  return agentByLeader(leader) !== undefined;
}

export interface ResumeHint {
  /** Only present on an exact (hook-resolved) hint. */
  sessionId?: string;
  resumeCommand: string;
  agentName?: string;
  /** Stable catalog key (e.g. `"claude"`), populated alongside `agentName` —
   * see `AgentActivityState.agentId`'s doc comment for why this exists
   * separately from the display name. */
  agentId?: string;
}

/** Honest, session-id-less hint used whenever the exact hook path hasn't
 * resolved a real session id. Promises nothing it can't back up, so it is
 * never wrong — the worst it can be is unhelpfully vague. `agentName`/
 * `agentId` are populated here too (not just on exact resolution) — *which*
 * CLI is running is known the moment a leader is recognized at all (that's
 * exactly what `isKnownAgentLeader`/`agentByLeader` already determined to
 * get here), independent of whether an exact session id was ever captured,
 * so neither field should wait on that to be useful. */
export function genericHint(leader: string, cwd: string): ResumeHint {
  const name = leaderBasename(leader);
  const agent = agentByLeader(leader);
  return {
    resumeCommand: cwd
      ? `was running ${name} in ${cwd}`
      : `was running ${name}`,
    agentName: agent?.displayName,
    agentId: agent?.id,
  };
}
