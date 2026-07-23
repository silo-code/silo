import { invoke } from "@tauri-apps/api/core";
import type { ProcessExecResult } from "@silo-code/sdk";
import { createHostChannel } from "./output-store";

/** Output-panel channel for `ctx.agents` diagnostics — visible in Silo's own
 * Output window, not the devtools console. */
export const agentsChannel = createHostChannel("silo:agents", "Agents");

// Resume-hint resolution for `ctx.agents` (RFC 0017). Host-internal — there
// is no registration API; this is the one place that knows how to ask
// https://github.com/yigitkonur/cli-continues for a session id. Resolved
// live, at agent-start detection, and persisted — never re-resolved at death
// time (see RFC 0017 "Design › Resume-hint resolution is host-internal").

/**
 * Pinned to an **exact** version, not a caret range — `npx` caches
 * aggressively and does not reliably re-check the registry for a newer
 * matching version on subsequent runs (see RFC 0017), so a range wouldn't
 * give reliable freshness anyway. Bumping this string is routine
 * maintenance: verify the JSON shape below still validates, then update.
 */
const CONTINUES_PINNED_VERSION = "4.1.1";

// Resolution fires the instant a terminal's leader is first detected as a
// known agent — essentially at process spawn, which is often *before* the
// agent has written its own session file at all (confirmed in testing: a
// single, genuinely new Claude session still resolved to an old pre-existing
// one sharing the same cwd, because nothing recent enough existed on disk
// yet at the moment of the first attempt). So this isn't a single exec —
// it's a bounded retry loop, each attempt rejecting matches older than
// roughly when resolution started (see CREATED_AT_GRACE_MS) and waiting
// before trying again if nothing recent enough turns up yet.
//
// The session file itself isn't written at process spawn — apparently only
// once the user's first real message exchange completes (confirmed in
// testing: a real second session found nothing at all within a ~25s budget,
// while a concurrent first session in the same directory resolved fine).
// There's no reliable upper bound on "how long until the user types
// something," so this is a generous-but-still-bounded budget, not an attempt
// to cover every case — an unusually slow first message still falls back to
// the generic hint.
const RETRY_INTERVAL_MS = 5_000;
const MAX_ATTEMPTS = 15;
/** Tolerance for a genuinely-new session's `createdAt` landing slightly
 * *before* our own reference timestamp — clock/detection skew between when
 * we noticed the leader and when the agent's own first message was
 * timestamped, not a window for accepting stale sessions. */
const CREATED_AT_GRACE_MS = 5_000;
// Overall budget: MAX_ATTEMPTS attempts, each itself costing a few seconds
// (--rebuild forces a fresh filesystem scan, not a cache hit), plus
// RETRY_INTERVAL_MS between them — sized generously above the loop's own
// worst case (15 × ~3s exec + 14 × 5s waits ≈ 115s) so this outer race
// timeout is a true "something is stuck" backstop, not a competing budget.
const EXEC_TIMEOUT_MS = 150_000;

/** Maps a detected agent leader/kind to `continues`'s `SessionSource` name.
 * Only agents this repo's detectors currently cover are listed — anything
 * else falls back to the generic hint without attempting resolution. */
const LEADER_TO_CONTINUES_SOURCE: Record<string, string> = {
  claude: "claude",
};

/** `leader` is observed to be a full path on at least some installs (e.g. a
 * Bun-compiled `claude` binary reports as `/Users/x/.local/bin/claude`, not
 * bare `claude`) — match on the basename, not the whole string. */
function leaderBasename(leader: string): string {
  const idx = leader.lastIndexOf("/");
  return idx >= 0 ? leader.slice(idx + 1) : leader;
}

/** Whether `leader` is a known agent worth attempting resume-hint
 * resolution for. Gates the (relatively expensive) `npx` exec so it's never
 * triggered for a plain shell or an unrecognized foreground program. */
export function isKnownAgentLeader(leader: string): boolean {
  return leaderBasename(leader) in LEADER_TO_CONTINUES_SOURCE;
}

export interface ResumeHint {
  sessionId?: string;
  resumeCommand: string;
  agentName?: string;
}

interface ContinuesSession {
  originalPath: string;
  cwd: string;
  createdAt: string;
}

/** Defensive shape check — treated the same as an exec failure on mismatch,
 * so a future `continues` release that silently renames a field degrades to
 * the generic fallback instead of surfacing a wrong or garbled hint. */
function isValidContinuesSession(value: unknown): value is ContinuesSession {
  if (typeof value !== "object" || value === null) return false;
  const rec = value as Record<string, unknown>;
  return (
    typeof rec.originalPath === "string" &&
    rec.originalPath.endsWith(".jsonl") &&
    typeof rec.cwd === "string" &&
    typeof rec.createdAt === "string"
  );
}

/** Strip a leading `/private` so `/private/tmp/x` and `/tmp/x` compare equal
 * — macOS's `/tmp` is a symlink to `/private/tmp`, and different layers
 * (shell $PWD vs. a resolved-path lookup) can report either form. */
function normalizePath(path: string): string {
  return path.replace(/^\/private(?=\/)/, "");
}

/**
 * Find the session matching `cwd` among `sessions`, most-recently-updated
 * first (the array is already sorted that way by `continues`), **and**
 * created no earlier than `minCreatedAtMs` (minus a small grace window).
 * Client-side, not `continues`'s own filtering — see the module doc for why.
 *
 * The recency floor matters as much as the cwd match: without it, a brand
 * new session that hasn't written anything yet is indistinguishable from
 * "no new session" — the query would just confidently return the most
 * recent *pre-existing* session sharing that cwd instead, which is wrong,
 * not merely stale (confirmed in testing). Passing `minCreatedAtMs` (roughly
 * "when we started looking") is what lets the caller retry until something
 * actually new enough shows up, rather than accepting an old match on the
 * first try.
 */
function findSessionForCwd(
  sessions: unknown[],
  cwd: string,
  minCreatedAtMs: number,
): ContinuesSession | null {
  const target = normalizePath(cwd);
  const floor = minCreatedAtMs - CREATED_AT_GRACE_MS;
  for (const s of sessions) {
    if (!isValidContinuesSession(s) || normalizePath(s.cwd) !== target)
      continue;
    const createdAtMs = Date.parse(s.createdAt);
    if (Number.isNaN(createdAtMs) || createdAtMs < floor) continue;
    return s;
  }
  return null;
}

/** Derive the resumable session id from the matched session's own file path
 * rather than trusting `continues`'s `id` field directly. `continues`
 * prefers an internal `sessionId` recorded *inside* a session's JSONL
 * messages over the file's own name — for compacted/chained conversations
 * that recorded id can reference a different (sometimes since-deleted)
 * session than the file actually found, producing a `claude --resume <id>`
 * that fails with "No conversation found." The file that was matched is,
 * by construction, the one that actually exists and is resumable. */
function sessionIdFromOriginalPath(originalPath: string): string | null {
  const basename = originalPath.split("/").pop() ?? "";
  const id = basename.replace(/\.jsonl$/, "");
  return id.length > 0 ? id : null;
}

function genericHint(leader: string, cwd: string): ResumeHint {
  const name = leaderBasename(leader);
  return {
    resumeCommand: cwd
      ? `was running ${name} in ${cwd}`
      : `was running ${name}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let cachedHomeDir: string | null = null;

/** `$HOME`, resolved via a tiny shell exec and cached **only on success** —
 * there's no `process.env` in this (webview, not Node) context, so this is
 * the only way to build an absolute path for the personal config dir below.
 * A transient failure here isn't cached, so it doesn't permanently disable
 * the personal-config-dir check for the rest of the app's lifetime; every
 * outcome (success, non-string, exec error) is logged, since silently
 * swallowing this would otherwise make "the personal config dir was never
 * even attempted" indistinguishable from "it was tried and found nothing." */
async function getHomeDir(): Promise<string | null> {
  if (cachedHomeDir) return cachedHomeDir;
  try {
    const r = await invoke<ProcessExecResult>("process_exec", {
      command: "sh",
      // printf, not `echo -n` — `-n` isn't a portable echo flag; depending
      // on which shell backs /bin/sh, it can print as literal text instead
      // of suppressing the newline, corrupting the resolved path (confirmed
      // in testing: $HOME came back as "-n /Users/dweaver").
      args: ["-c", "printf '%s' \"$HOME\""],
    });
    const home = r.code === 0 ? r.stdout.trim() : "";
    if (!home) {
      agentsChannel.warn(
        `Could not resolve $HOME (exec code ${r.code}) — the personal-config-dir check will be skipped this attempt.`,
        { stdout: r.stdout, stderr: r.stderr },
      );
      return null;
    }
    cachedHomeDir = home;
    return home;
  } catch (err) {
    agentsChannel.warn(
      "$HOME resolution threw — the personal-config-dir check will be skipped this attempt.",
      err,
    );
    return null;
  }
}

/**
 * Multiple Claude accounts (e.g. an enterprise account using the default
 * `~/.claude` and a personal one using a separate `CLAUDE_CONFIG_DIR`) are a
 * real, confirmed case — `continues` only ever reads `~/.claude` unless
 * `CLAUDE_CONFIG_DIR` is set in *its own* process environment, and spawning
 * it via `process_exec` doesn't inherit or replicate the shell-rc logic
 * that sets that variable for a real interactive terminal. Rather than try
 * to reproduce the user's shell environment exactly (risks interleaving
 * unrelated shell-startup output — e.g. nvm's own warnings, seen elsewhere
 * in this same environment — into the JSON this depends on parsing
 * cleanly), just query the known alternate location explicitly and merge.
 * Not a general "discover every possible config dir" solution — a known,
 * narrower fix for this specific, confirmed two-account case.
 */
async function candidateConfigDirs(): Promise<(string | undefined)[]> {
  const home = await getHomeDir();
  return [undefined, home ? `${home}/.claude-personal` : undefined].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
}

/** One `continues` query (against one `CLAUDE_CONFIG_DIR`) + client-side
 * cwd/recency filter. */
async function queryOneConfigDir(
  source: string,
  cwd: string,
  minCreatedAtMs: number,
  configDir: string | undefined,
): Promise<ContinuesSession | "error" | null> {
  const result = await invoke<ProcessExecResult>("process_exec", {
    command: "npx",
    args: [
      "--yes",
      `continues@${CONTINUES_PINNED_VERSION}`,
      "list",
      "--json",
      "-s",
      source,
      // Empirically, `continues@4.1.1`'s `list --json` does not scope to
      // the invoking process's cwd at all — it returns the globally
      // most-recently-active sessions regardless of directory. Passing
      // `cwd` to process_exec (below) does not change that. So: fetch a
      // wide batch (its own default ceiling) and filter for our directory
      // (and recency) ourselves — see findSessionForCwd.
      "-n",
      "50",
      // `continues` caches its own scanned session index with a 5-minute
      // TTL (~/.continues/sessions.jsonl). Without this, two agent-start
      // resolutions within that window (a very normal thing — starting a
      // second Claude terminal a minute after the first) can both read the
      // same stale, pre-existing index and resolve to the same wrong,
      // older session that happens to share the cwd — confirmed in
      // testing. --rebuild forces a fresh filesystem scan every time,
      // trading a slower exec for correctness on every attempt.
      "--rebuild",
    ],
    cwd,
    env: configDir ? { CLAUDE_CONFIG_DIR: configDir } : undefined,
    execId: `agent-resume-hint_${Date.now()}_${configDir ?? "default"}`,
  });

  if (result.code !== 0) {
    agentsChannel.warn(
      `"continues" exec failed (code ${result.code}) for ${cwd} (CLAUDE_CONFIG_DIR=${configDir ?? "default"}).`,
      { stderr: result.stderr },
    );
    return "error";
  }

  const parsed: unknown = JSON.parse(result.stdout);
  const sessions = Array.isArray(parsed) ? parsed : [];
  return findSessionForCwd(sessions, cwd, minCreatedAtMs);
}

/** One resolution attempt across every candidate config dir (see
 * `candidateConfigDirs`), returning the first real match found. Only
 * reports "error" if every candidate errored — one config dir simply not
 * existing/having no sessions isn't a failure. */
async function attemptResolve(
  source: string,
  cwd: string,
  minCreatedAtMs: number,
): Promise<ContinuesSession | "error" | null> {
  const configDirs = await candidateConfigDirs();
  agentsChannel.debug(
    `Trying ${configDirs.length} config dir(s): ${configDirs.map((d) => d ?? "default").join(", ")}`,
  );
  // Only "error" (abort the whole retry loop) if *every* candidate errored —
  // one config dir having a transient exec problem while another ran clean
  // and simply hasn't found anything *yet* is exactly the "keep retrying"
  // case, not a reason to give up.
  let anySucceeded = false;
  for (const configDir of configDirs) {
    const result = await queryOneConfigDir(
      source,
      cwd,
      minCreatedAtMs,
      configDir,
    );
    if (result === "error") continue;
    anySucceeded = true;
    if (result) return result;
  }
  return anySucceeded ? null : "error";
}

/**
 * Resolve a resume hint for a detected agent leader. Called once, at
 * agent-start detection — never re-called at death time. Retries for a
 * while (see MAX_ATTEMPTS/RETRY_INTERVAL_MS) if nothing recent enough for
 * `cwd` is found yet — the agent's own session file often doesn't exist at
 * the exact instant its leader is first detected (confirmed in testing: a
 * single, genuinely new session still resolved to an old pre-existing one
 * sharing the cwd on the first attempt). Falls back to a generic,
 * session-id-less hint if `continues` isn't installed, keeps erroring, or
 * nothing recent enough ever turns up within the retry budget.
 */
export async function resolveResumeHint(
  leader: string,
  cwd: string,
): Promise<ResumeHint> {
  const source = LEADER_TO_CONTINUES_SOURCE[leaderBasename(leader)];
  if (!source || !cwd) {
    agentsChannel.debug(
      `Skipping resolution for "${leader}" (cwd="${cwd}") — ${
        !source ? "not a known agent leader" : "no cwd available yet"
      }.`,
    );
    return genericHint(leader, cwd);
  }

  const startedAt = Date.now();
  agentsChannel.info(`Resolving resume hint for ${leader} in ${cwd}…`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const match = await attemptResolve(source, cwd, startedAt);
      if (match === "error") {
        // A real exec failure (continues missing, npx broken) — no point
        // retrying an environment problem; fall back immediately.
        return genericHint(leader, cwd);
      }
      if (match) {
        const sessionId = sessionIdFromOriginalPath(match.originalPath);
        if (!sessionId) {
          agentsChannel.warn(
            `Could not derive a session id from "continues"'s matched path for ${leader} in ${cwd}; falling back to generic hint.`,
            { originalPath: match.originalPath },
          );
          return genericHint(leader, cwd);
        }
        agentsChannel.info(
          `Resolved session ${sessionId} for ${leader} in ${cwd}.`,
        );
        return {
          sessionId,
          resumeCommand: `claude --resume ${sessionId}`,
          agentName: "Claude Code",
        };
      }
    } catch (err) {
      agentsChannel.warn(
        `Resume-hint resolution threw for ${leader} in ${cwd}; falling back to generic hint.`,
        err,
      );
      return genericHint(leader, cwd);
    }

    if (attempt < MAX_ATTEMPTS) {
      agentsChannel.debug(
        `No session recent enough for ${leader} in ${cwd} yet (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${RETRY_INTERVAL_MS}ms.`,
      );
      await sleep(RETRY_INTERVAL_MS);
    }
  }

  agentsChannel.warn(
    `No "continues" session ever matched cwd ${cwd} for ${leader} within the retry budget; falling back to generic hint.`,
  );
  return genericHint(leader, cwd);
}

/** Race `resolveResumeHint` against a timeout so a hung `npx` invocation
 * (e.g. a slow first-time download) can't stall agent-start detection
 * indefinitely. */
export function resolveResumeHintWithTimeout(
  leader: string,
  cwd: string,
): Promise<ResumeHint> {
  return Promise.race([
    resolveResumeHint(leader, cwd),
    new Promise<ResumeHint>((resolve) =>
      setTimeout(() => resolve(genericHint(leader, cwd)), EXEC_TIMEOUT_MS),
    ),
  ]);
}
