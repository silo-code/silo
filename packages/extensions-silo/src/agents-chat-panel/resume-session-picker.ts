/**
 * Session Discovery (RFC 0051) — the pure logic behind the `/resume` picker:
 * which sessions to offer, how to filter and title them. Kept out of
 * `ResumeSessionDialog.tsx` so it is unit-tested independent of the `List`
 * it drives, the same split `command-palette.ts` makes for the `/` palette.
 */

import type { AgentSessionSummary } from "@silo-code/sdk";

/**
 * Sessions eligible for the picker: not this panel's own, and only ones
 * whose reported `cwd` matches this panel's current one. A session with no
 * reported `cwd` is excluded too — there is no way to confirm it matches,
 * and offering to resume it risks the agent resolving relative paths under
 * the wrong folder.
 */
export function resumableSessions(
  sessions: readonly AgentSessionSummary[],
  currentSessionId: string | undefined,
  cwd: string,
): readonly AgentSessionSummary[] {
  return sessions.filter(
    (s) => s.sessionId !== currentSessionId && s.cwd === cwd,
  );
}

/** Sessions matching `query` by title, cwd, or session id — case-insensitive,
 *  substring. Empty query matches everything. */
export function filterSessionSummaries(
  sessions: readonly AgentSessionSummary[],
  query: string,
): readonly AgentSessionSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return sessions;
  return sessions.filter((s) =>
    [s.title, s.cwd, s.sessionId].some((field) =>
      field?.toLowerCase().includes(q),
    ),
  );
}

/** Row title: the agent's own title, else the cwd's basename, else a
 *  truncated session id — always something, never blank. */
export function sessionSummaryTitle(summary: AgentSessionSummary): string {
  if (summary.title) return summary.title;
  if (summary.cwd) {
    const base = summary.cwd.split(/[\\/]/).filter(Boolean).pop();
    return base ?? summary.cwd;
  }
  return summary.sessionId.length > 8
    ? `${summary.sessionId.slice(0, 8)}…`
    : summary.sessionId;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * `updatedAt` as a short relative label — `"just now"`, `"5m ago"`,
 * `"3h ago"`, `"yesterday"`, or a plain date past a week old. `nowMs` is
 * injected for testability, the same convention {@link isDoubleEscape} uses.
 * `undefined` for a missing or unparsable timestamp, or one in the future.
 */
export function relativeUpdatedAt(
  iso: string | undefined,
  nowMs: number,
): string | undefined {
  if (!iso) return undefined;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return undefined;
  const deltaMs = nowMs - then;
  if (deltaMs < 0) return undefined;
  if (deltaMs < MINUTE_MS) return "just now";
  if (deltaMs < HOUR_MS) return `${Math.floor(deltaMs / MINUTE_MS)}m ago`;
  if (deltaMs < DAY_MS) return `${Math.floor(deltaMs / HOUR_MS)}h ago`;
  if (deltaMs < 2 * DAY_MS) return "yesterday";
  if (deltaMs < 7 * DAY_MS) return `${Math.floor(deltaMs / DAY_MS)}d ago`;
  return new Date(then).toLocaleDateString();
}
