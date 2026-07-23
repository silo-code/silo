import { invoke } from "@tauri-apps/api/core";
import type { ProcessExecResult } from "@silo-code/sdk";
import { agentsChannel } from "./agent-resume-hint";

/**
 * Reads the events file Silo's opt-in `SessionStart` hook writes to (see
 * `packages/extensions-core/src/agents-settings`) and matches each event's
 * reported pid against a terminal's own current foreground pgid — exact,
 * no directory/recency inference at all, unlike the `continues`-based path
 * in `agent-resume-hint.ts`. This is the tier-1 resolution source: when a
 * hook match exists, it's used instead of (and skips entirely) the
 * `continues` exec. See RFC 0017's hook-based resolution addendum.
 *
 * Fixed, app-identity-agnostic path (not under `~/.config/silo[-dev]`) so it
 * works the same regardless of which Silo build/identity is running — the
 * hook itself has no way to know that at install time.
 */
const EVENTS_PATH_EXPR = "$HOME/.silo/agent-hooks/events.jsonl";

/** Hook events older than this are never matched against a newly-tracked
 * terminal's pgid — guards against the (unlikely but real) case of the OS
 * reusing a pid long after the hook that reported it fired. */
const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

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
 * inference — this is what makes the hook path tier-1 over the
 * `continues`-based directory/recency guess in `agent-resume-hint.ts`.
 * Extracted as a pure function (not inlined in `agents-service.ts`'s
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

// Line-count checkpoint, in-memory only (resets on app restart — a restart
// re-reading a handful of old lines once is harmless; see MAX_EVENT_AGE_MS
// for why re-processing an old line can't wrongly match a new terminal).
let linesProcessed = 0;

/** Read any hook-event lines written since the last call. Returns `[]` if
 * the events file doesn't exist yet (hook never fired, or isn't installed)
 * — not an error. */
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

  const now = Date.now();
  const events: HookEvent[] = [];
  for (const line of newLines) {
    const event = parseLine(line);
    if (!event) continue;
    const age = now - Date.parse(event.timestamp);
    if (
      Number.isNaN(age) ||
      age > MAX_EVENT_AGE_MS ||
      age < -MAX_EVENT_AGE_MS
    ) {
      agentsChannel.debug(
        `Ignoring hook event for pid ${event.pid} — timestamp too far from now to trust.`,
      );
      continue;
    }
    events.push(event);
  }
  return events;
}
