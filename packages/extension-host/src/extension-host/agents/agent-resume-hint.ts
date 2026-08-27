import {
  agentByLeader,
  leaderBasename,
  type AgentDefinition,
} from "./agent-catalog";

// Resume-hint resolution for `ctx.agents` (RFC 0018). There are exactly two
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
// one that is sometimes secretly wrong. See RFC 0018 "Rejected: cwd + recency
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

/** Generic resume hint when the catalog agent is already known — e.g. a
 * node-wrapped foreground whose argv0 is `node` but whose full command line
 * identified pi. */
export function catalogResumeHint(
  agent: AgentDefinition,
  cwd: string,
): ResumeHint {
  return {
    resumeCommand: cwd
      ? `was running ${agent.displayName} in ${cwd}`
      : `was running ${agent.displayName}`,
    agentName: agent.displayName,
    agentId: agent.id,
  };
}

/**
 * Extract an exact session id from an agent's command line when it was launched
 * to **resume** a session (`--resume <id>` / `--resume=<id>` / `-r <id>`).
 *
 * This is how a *resumed* terminal gets its exact resume identity: resuming a
 * session does not necessarily re-fire the SessionStart hook (confirmed for
 * Cursor — it fires only on a new session's first keystroke, never on
 * `--resume`), so there's no hook event to correlate. But the id is right there
 * in the agent's own argv, which Silo already reads for foreground tracking.
 *
 * Only **UUID-shaped** values are treated as ids: every supported agent's
 * `--resume` accepts either an id or a title, and a non-UUID value is a title/
 * prefix, not a resumable id (per Grok/Cursor `--resume` help — "UUID-shaped
 * values are always ids"). Returns `null` when the agent wasn't launched with a
 * resume id (e.g. a fresh session, where the hook is the right source).
 */
export function parseResumeSessionIdFromArgv(argv: string): string | null {
  const m = argv.match(
    /(?:^|\s)(?:--resume|-r)[=\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=\s|$)/i,
  );
  return m ? m[1] : null;
}
