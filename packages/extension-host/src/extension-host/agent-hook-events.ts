import { invoke } from "@tauri-apps/api/core";
import { agentsChannel } from "./agent-resume-hint";
import { homeDir } from "./platform";

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
 *
 * Delivery is watch-driven (`agents-service.ts` watches the hooks directory);
 * this module only tails new lines when asked.
 */
const HOOKS_DIR_REL = ".silo/agent-hooks";

/**
 * How long an unmatched event is retried against tracked terminals before
 * being given up on as orphaned — the bound `agents-service.ts` uses to
 * expire its pending-unmatched buffer (`pendingHookEvents`).
 *
 * This is deliberately **not** a freshness gate on the hook event's own
 * timestamp (it used to be, and that was a real bug — see RFC 0018's
 * "restart-staleness gap" correction, then the follow-on where the same
 * mistake was reintroduced at the retry-buffer layer): a long-running
 * session's hook event is just as valid hours later as it was the moment it
 * was written. Gating retries on wall-clock age of `event.timestamp` discarded
 * a perfectly correlatable event whenever Silo restarted more than this long
 * after a still-running session began *and* the first consume missed (seed
 * still in flight, or the agent mid-tool-use with a foreign pgid). The retry
 * TTL is measured from {@link PendingHookEvent.firstSeenAt} — when *we*
 * started trying to match — not from when the hook fired. The actual
 * protection against pid reuse is the *match itself* — an event's pid has to
 * equal a currently tracked terminal's current pgid or sticky agent pgid
 * (independently re-verified by Silo's own foreground-tracking).
 */
export const MAX_EVENT_AGE_MS = 10 * 60 * 1000;

/**
 * How long a freshly-seen unmatched event is kept even when its pid is not
 * yet among live terminal pgids. Covers the Cursor shebang race: the hook
 * can fire (and be read) while the foreground leader is still cached as
 * `bash` and before `agentPgid` sticks — dropping on `livePids` immediately
 * permanently loses the session id because the jsonl offset already advanced.
 */
export const HOOK_PID_GRACE_MS = 30_000;

export interface HookEvent {
  pid: number;
  sessionId: string;
  cwd: string;
  agent: string;
  timestamp: string;
}

/** An unmatched hook event held for retry, with the wall-clock moment we
 * first observed it (not the hook's own `timestamp`). */
export interface PendingHookEvent {
  event: HookEvent;
  firstSeenAt: number;
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
   * a `null` pgid can never match any event's pid on its own. */
  pgid: number | null;
  /**
   * Sticky pgid of the most recently observed known-agent foreground leader
   * for this terminal. Survives tool-use pgid drift (a `bash`/`zsh` tool
   * subprocess becomes the foreground group while Claude/Codex stays alive)
   * so a SessionStart hook's `os.getppid()` can still correlate. `null` until
   * a known agent leader has been seen.
   */
  agentPgid?: number | null;
}

export interface HookEventMatch {
  terminalId: string;
  event: HookEvent;
}

function terminalMatchesPid(t: TrackedTerminalPgid, pid: number): boolean {
  if (t.pgid !== null && t.pgid === pid) return true;
  if (t.agentPgid != null && t.agentPgid === pid) return true;
  return false;
}

/**
 * Pure correlator: for each hook event, find the tracked terminal whose
 * current foreground pgid — or sticky agent pgid — equals the event's
 * reported pid. Exact match, no inference — this is what lets the hook path
 * resolve an exact session id where the generic hint in
 * `agent-resume-hint.ts` can only be honestly vague. Extracted as a pure
 * function (not inlined in `agents-service.ts`'s stateful `Map`) specifically
 * so the matching rule itself is unit-testable without needing to drive the
 * full session-tracking machinery.
 */
export function matchHookEventsToTerminals(
  events: HookEvent[],
  terminals: TrackedTerminalPgid[],
): HookEventMatch[] {
  const matches: HookEventMatch[] = [];
  for (const event of events) {
    const terminal = terminals.find((t) => terminalMatchesPid(t, event.pid));
    if (terminal) matches.push({ terminalId: terminal.terminalId, event });
  }
  return matches;
}

/**
 * When several hook lines match the same live terminal (common after a
 * restart re-reads the whole backlog — real SessionStart plus later probe
 * lines for the same pid), keep the earliest event so a probe never wins
 * within a single consume.
 */
export function pickEarliestMatchPerTerminal(
  matches: HookEventMatch[],
): HookEventMatch[] {
  const best = new Map<string, HookEventMatch>();
  for (const match of matches) {
    const prev = best.get(match.terminalId);
    if (
      !prev ||
      Date.parse(match.event.timestamp) < Date.parse(prev.event.timestamp)
    ) {
      best.set(match.terminalId, match);
    }
  }
  return [...best.values()];
}

/** Whether an incoming hook session id should replace what's already on the
 * terminal. Prefer the earliest SessionStart: a later probe must not win, but
 * a restart that restored a wrong id (no hook timestamp) may still be
 * corrected by the backlog's earliest event. */
export function shouldAcceptHookSessionId(
  existingSessionId: string | null | undefined,
  existingHookTimestamp: string | null | undefined,
  incoming: Pick<HookEvent, "sessionId" | "timestamp">,
): boolean {
  if (!existingSessionId) return true;
  if (existingSessionId === incoming.sessionId) return true;
  // Restored from disk without a hook timestamp — allow replacement so the
  // earliest backlog SessionStart can correct a wrongly persisted probe.
  if (!existingHookTimestamp) return true;
  return Date.parse(incoming.timestamp) < Date.parse(existingHookTimestamp);
}

/**
 * From a consume's full candidate list (newly-read events plus whatever was
 * left over, unmatched, from prior consumes) and the matches that were just
 * found, return the events to carry forward: anything not just matched, not
 * past the retry TTL measured from {@link PendingHookEvent.firstSeenAt}, and
 * — when `livePids` is non-empty — whose pid still appears among tracked
 * terminals' pgid/agentPgid, **unless** the event was first seen within
 * {@link HOOK_PID_GRACE_MS} (so a Cursor hook that fires before the
 * foreground name settles past `bash` can still match on a later consume).
 * Dead-session backlog lines from `events.jsonl` are dropped once past that
 * grace (otherwise they spam "still unmatched" for up to
 * {@link MAX_EVENT_AGE_MS} after every restart).
 */
export function pruneUnmatchedEvents(
  candidates: PendingHookEvent[],
  matches: HookEventMatch[],
  now: number,
  livePids?: ReadonlySet<number>,
): PendingHookEvent[] {
  const matchedEvents = new Set(matches.map((m) => m.event));
  const haveLive = livePids != null && livePids.size > 0;
  return candidates.filter((p) => {
    if (matchedEvents.has(p.event)) return false;
    if (now - p.firstSeenAt >= MAX_EVENT_AGE_MS) return false;
    if (
      haveLive &&
      !livePids.has(p.event.pid) &&
      now - p.firstSeenAt >= HOOK_PID_GRACE_MS
    ) {
      return false;
    }
    return true;
  });
}

/** How long a line may stay in `events.jsonl` before file prune drops it.
 * Longer than {@link MAX_EVENT_AGE_MS} so a still-running session that Silo
 * restarts into still has its SessionStart line on disk. */
export const EVENTS_FILE_RETAIN_MS = 24 * 60 * 60 * 1000;

/** Hard cap on lines kept in `events.jsonl` after prune (oldest dropped). */
export const EVENTS_FILE_MAX_LINES = 100;

/**
 * Pure selection of which raw jsonl lines to keep when rewriting the file.
 * Drops unparseable lines, lines whose `sessionId` is in `dropSessionIds`
 * (already applied to a terminal), and events older than `retainMs`, then
 * caps at `maxLines` (most recent).
 */
export function selectEventsJsonlLinesToKeep(
  rawLines: string[],
  now: number,
  retainMs: number = EVENTS_FILE_RETAIN_MS,
  maxLines: number = EVENTS_FILE_MAX_LINES,
  dropSessionIds?: ReadonlySet<string>,
): string[] {
  const kept: string[] = [];
  for (const line of rawLines) {
    if (!line.trim()) continue;
    const event = parseLine(line);
    if (!event) continue;
    if (dropSessionIds?.has(event.sessionId)) continue;
    const ts = Date.parse(event.timestamp);
    if (Number.isNaN(ts)) continue;
    if (now - ts > retainMs) continue;
    kept.push(line);
  }
  if (kept.length > maxLines) {
    return kept.slice(kept.length - maxLines);
  }
  return kept;
}

/** Wrap freshly-read hook events as pending entries stamped with `now`. */
export function stampNewHookEvents(
  events: HookEvent[],
  now: number,
): PendingHookEvent[] {
  return events.map((event) => ({ event, firstSeenAt: now }));
}

// Line-count checkpoint, in-memory only. Resets on app restart, at which
// point the entire file is read as "new" once — a normal restart onto
// still-running sessions is exactly the case this needs to handle well
// (see MAX_EVENT_AGE_MS's doc comment for why there's no age filtering here
// to lose those events to).
let linesProcessed = 0;
let cachedEventsPath: string | null = null;
let cachedHooksDir: string | null = null;

/** Absolute path to `~/.silo/agent-hooks` (creates nothing). */
export async function resolveAgentHooksDir(): Promise<string> {
  if (cachedHooksDir) return cachedHooksDir;
  const dir = `${(await homeDir()).replace(/\/+$/, "")}/${HOOKS_DIR_REL}`;
  cachedHooksDir = dir;
  return dir;
}

/** Absolute path to `events.jsonl`. */
export async function resolveAgentHooksEventsPath(): Promise<string> {
  if (cachedEventsPath) return cachedEventsPath;
  const path = `${await resolveAgentHooksDir()}/events.jsonl`;
  cachedEventsPath = path;
  return path;
}

/** Reset the line-count checkpoint. Used on Vite HMR dispose so a reloaded
 * `agents-service` module doesn't inherit a checkpoint that an orphaned
 * pre-HMR consumer already advanced past. Safe: re-reading applies
 * `applyHookMatch` idempotently. */
export function resetHookEventsCheckpoint(): void {
  linesProcessed = 0;
}

/** At most one `fs_read_text` in flight — overlapping reads race the shared
 * `linesProcessed` checkpoint. Check-and-set is synchronous so two callers
 * in the same turn share one invoke. */
let outstandingRead: Promise<string> | null = null;

function invokeReadText(path: string): Promise<string> {
  if (!outstandingRead) {
    outstandingRead = invoke<string>("fs_read_text", { path }).finally(() => {
      outstandingRead = null;
    });
  }
  return outstandingRead;
}

export async function readNewHookEvents(): Promise<HookEvent[]> {
  let stdout: string;
  try {
    const path = await resolveAgentHooksEventsPath();
    stdout = await invokeReadText(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Missing file is the normal "hook never fired" case — not an error.
    if (/no such file|not found|os error 2|ENOENT/i.test(msg)) return [];
    agentsChannel.warn("Reading agent-hook events threw.", err);
    return [];
  }
  if (!stdout) return [];

  // `split("\n")` yields a trailing "" when the file ends in a newline (the
  // normal case — the hook writes `…+chr(10)`). Counting that empty slot in
  // `linesProcessed` advances the checkpoint past the last real line, so the
  // next append is sliced away and never seen (confirmed live: Claude #2 /
  // Codex lines sat on disk until reload).
  const lines = stdout.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
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

/**
 * Rewrite `events.jsonl`: remove session ids that have already been applied
 * to a terminal, drop aged lines, cap length. Resets the line checkpoint to
 * the kept length. Shared by prod and Silo Dev — both use this path.
 */
export async function pruneAgentHooksEventsFile(
  now: number = Date.now(),
  dropSessionIds?: ReadonlySet<string>,
): Promise<{ before: number; after: number }> {
  const path = await resolveAgentHooksEventsPath();
  let stdout: string;
  try {
    stdout = await invokeReadText(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/no such file|not found|os error 2|ENOENT/i.test(msg)) {
      return { before: 0, after: 0 };
    }
    throw err;
  }
  const raw = stdout ? stdout.split("\n") : [];
  if (raw.length > 0 && raw[raw.length - 1] === "") raw.pop();
  const before = raw.filter((l) => l.trim()).length;
  const kept = selectEventsJsonlLinesToKeep(
    raw,
    now,
    EVENTS_FILE_RETAIN_MS,
    EVENTS_FILE_MAX_LINES,
    dropSessionIds,
  );
  if (kept.length === before) {
    linesProcessed = kept.length;
    return { before, after: before };
  }
  const body = kept.length > 0 ? `${kept.join("\n")}\n` : "";
  await invoke("fs_write_text", { path, content: body });
  linesProcessed = kept.length;
  agentsChannel.info(
    `Pruned agent-hooks events.jsonl: ${before} → ${kept.length} line(s)` +
      (dropSessionIds && dropSessionIds.size > 0
        ? ` (removed ${dropSessionIds.size} matched session id(s)).`
        : "."),
  );
  return { before, after: kept.length };
}

/** Eagerly resolve paths so the first consume doesn't pay homeDir IPC. */
void resolveAgentHooksEventsPath().catch(() => {
  /* first consume will retry */
});

/** Clear cached paths + single-flight state (HMR dispose / tests). */
export function disposeHookEventsRuntime(): void {
  outstandingRead = null;
  cachedEventsPath = null;
  cachedHooksDir = null;
}
