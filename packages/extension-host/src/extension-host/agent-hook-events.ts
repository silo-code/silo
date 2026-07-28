import { invoke } from "@tauri-apps/api/core";
import type { ProcessExecResult } from "@silo-code/sdk";
import { agentsChannel } from "./agent-resume-hint";

/**
 * Reads the events file Silo's opt-in `SessionStart` hook writes to (see
 * `packages/extensions-core/src/agents-settings`) and matches each event's
 * reported pid against a terminal's own current foreground pgid — exact,
 * with no directory/recency inference at all. This is the *only* source of an
 * exact session id; without a hook match, a terminal gets the honest,
 * session-id-less generic hint in `agent-resume-hint.ts` instead. See RFC
 * 0017's hook-based resolution addendum.
 *
 * Fixed, app-identity-agnostic path (not under `~/.config/silo[-dev]`) so it
 * works the same regardless of which Silo build/identity is running — the
 * hook itself has no way to know that at install time.
 */
const EVENTS_PATH_EXPR = "$HOME/.silo/agent-hooks/events.jsonl";

/**
 * How long an event is retried against tracked terminals before being given
 * up on as orphaned — the bound `agents-service.ts`'s poll loop uses to
 * expire its own pending-unmatched buffer (`pendingHookEvents`).
 *
 * This is deliberately **not** a freshness gate applied at ingestion (it
 * used to be, and that was a real bug — see RFC 0017's "restart-staleness
 * gap" correction): a long-running session's hook event is just as valid
 * hours later as it was the moment it was written, and gating on wall-clock
 * age at read time discarded a perfectly correlatable event every time Silo
 * restarted more than this long after a still-running session began. The
 * actual protection against pid reuse is the *match itself* — an event's pid
 * has to equal a **currently tracked, currently alive** terminal's foreground
 * pgid (independently re-verified by Silo's own foreground-tracking, not
 * just trusted from the hook's self-report), which is a far stronger signal
 * than any wall-clock cutoff. This bound only governs how long an event that
 * *never* matches anything is kept around retrying, so the pending buffer
 * doesn't grow unboundedly from genuinely orphaned events (a closed
 * terminal, a session in a different, no-longer-open workspace).
 */
export const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

export interface HookEvent {
  pid: number;
  sessionId: string;
  cwd: string;
  agent: string;
  timestamp: string;
}

function parseLine(line: string): HookEvent | null {
  if (!line.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(line);
    if (typeof parsed !== "object" || parsed === null) return null;
    const rec = parsed as Record<string, unknown>;
    if (
      typeof rec.pid !== "number" ||
      typeof rec.sessionId !== "string" ||
      !rec.sessionId ||
      typeof rec.timestamp !== "string"
    ) {
      return null;
    }
    return {
      pid: rec.pid,
      sessionId: rec.sessionId,
      cwd: typeof rec.cwd === "string" ? rec.cwd : "",
      agent: typeof rec.agent === "string" ? rec.agent : "claude",
      timestamp: rec.timestamp,
    };
  } catch {
    return null;
  }
}

export interface TrackedTerminalPgid {
  terminalId: string;
  /** The terminal's last-known foreground pgid, or `null` if never seen —
   * a `null` pgid can never match any event's pid. */
  pgid: number | null;
}

export interface HookEventMatch {
  terminalId: string;
  event: HookEvent;
}

/**
 * Pure correlator: for each hook event, find the tracked terminal whose
 * current foreground pgid equals the event's reported pid. Exact match, no
 * inference — this is what lets the hook path resolve an exact session id
 * where the generic hint in `agent-resume-hint.ts` can only be honestly
 * vague. Extracted as a pure function (not inlined in `agents-service.ts`'s
 * stateful `Map`) specifically so the matching rule itself is unit-testable
 * without needing to drive the full session-tracking machinery.
 */
export function matchHookEventsToTerminals(
  events: HookEvent[],
  terminals: TrackedTerminalPgid[],
): HookEventMatch[] {
  const matches: HookEventMatch[] = [];
  for (const event of events) {
    const terminal = terminals.find(
      (t) => t.pgid !== null && t.pgid === event.pid,
    );
    if (terminal) matches.push({ terminalId: terminal.terminalId, event });
  }
  return matches;
}

/**
 * From a poll's full candidate list (this tick's newly-read events plus
 * whatever was left over, unmatched, from prior polls) and the matches that
 * were just found, return the events to carry forward to the *next* poll:
 * anything not just matched, and not yet too old to bother with.
 *
 * This exists because `readNewHookEvents()` is a one-time checkpoint — each
 * line is returned exactly once, ever — so on its own, an event that doesn't
 * match on the single poll it happens to be read on is lost forever. That's
 * a real, confirmed race: a hook can fire (and get read) *before* Silo's own
 * foreground-tracking has caught up to the terminal's new pgid, since the
 * two run on independent timers (see `agents-service.ts`'s `pollHookEvents`,
 * which feeds this function's output back in as next poll's candidates via
 * `pendingHookEvents`). Retrying for a bounded window turns "must land in the
 * same ~tick" into "eventually consistent within `MAX_EVENT_AGE_MS`."
 */
export function pruneUnmatchedEvents(
  candidates: HookEvent[],
  matches: HookEventMatch[],
  now: number,
): HookEvent[] {
  const matchedEvents = new Set(matches.map((m) => m.event));
  return candidates.filter(
    (ev) =>
      !matchedEvents.has(ev) &&
      now - Date.parse(ev.timestamp) < MAX_EVENT_AGE_MS,
  );
}

// Line-count checkpoint, in-memory only. Resets on app restart, at which
// point the entire file is read as "new" once — a normal restart onto
// still-running sessions is exactly the case this needs to handle well
// (see MAX_EVENT_AGE_MS's doc comment for why there's no age filtering here
// to lose those events to).
let linesProcessed = 0;

/** Read any hook-event lines written since the last call, parsed and
 * returned as-is — no staleness filtering (see `MAX_EVENT_AGE_MS`). Returns
 * `[]` if the events file doesn't exist yet (hook never fired, or isn't
 * installed) — not an error. A line with an unparseable/missing timestamp is
 * dropped (data corruption, not staleness — `parseLine` already requires a
 * `timestamp` string, but doesn't validate it parses to a real date). */
export async function readNewHookEvents(): Promise<HookEvent[]> {
  let result: ProcessExecResult;
  try {
    result = await invoke<ProcessExecResult>("process_exec", {
      command: "sh",
      args: ["-c", `cat "${EVENTS_PATH_EXPR}" 2>/dev/null`],
    });
  } catch (err) {
    agentsChannel.warn("Reading agent-hook events threw.", err);
    return [];
  }
  if (result.code !== 0 || !result.stdout) return [];

  const lines = result.stdout.split("\n");
  const newLines = lines.slice(linesProcessed);
  linesProcessed = lines.length;

  const events: HookEvent[] = [];
  for (const line of newLines) {
    const event = parseLine(line);
    if (!event) continue;
    if (Number.isNaN(Date.parse(event.timestamp))) {
      agentsChannel.debug(
        `Ignoring hook event for pid ${event.pid} — unparseable timestamp "${event.timestamp}".`,
      );
      continue;
    }
    events.push(event);
  }
  return events;
}
