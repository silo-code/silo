/**
 * Pure logic for installing/uninstalling Silo's `SessionStart` hook into a
 * Claude Code `settings.json` object — merge-safe, since a real settings.json
 * commonly already has hooks from other tools (confirmed in this project's
 * own testing: an existing "Superset" integration hooks `SessionStart`,
 * `SessionEnd`, `UserPromptSubmit`, `Stop`). Install only ever *appends* a
 * new hook-group entry; uninstall only ever removes entries carrying Silo's
 * own marker, never touching anyone else's.
 *
 * The hook's job: read the `SessionStart` JSON payload Claude Code pipes to
 * it on stdin, extract `session_id`, capture `$PPID` (the hook's parent
 * process — Claude Code itself), and append one JSON line to a fixed,
 * app-identity-agnostic path (`~/.silo/agent-hooks/events.jsonl`) that the
 * host reads and correlates against each tracked terminal's own foreground
 * pid — giving an exact session id with no directory/recency inference at
 * all (see RFC 0017's hook-based resolution addendum).
 */

/** Tags every hook entry Silo installs, so uninstall can find (only) its
 * own entries without disturbing any other tool's hooks. */
export const SILO_HOOK_MARKER = "silo-managed-agent-hook";

/** A single-line, no-indentation Python script (no conditional blocks, so no
 * newlines are needed) — always writes a line, even with an empty
 * `sessionId`, and lets the host-side reader skip empty ones; simpler than
 * getting shell/JSON quoting right around a Python `if` block. */
export function buildHookCommand(): string {
  const script =
    "import json,sys,os,datetime;" +
    "d=json.load(sys.stdin);" +
    "sid=d.get('session_id') or d.get('sessionId') or '';" +
    "os.makedirs(os.path.expanduser('~/.silo/agent-hooks'),exist_ok=True);" +
    "open(os.path.expanduser('~/.silo/agent-hooks/events.jsonl'),'a').write(" +
    "json.dumps({'pid':os.getppid(),'sessionId':sid,'cwd':d.get('cwd',''),'agent':'claude','timestamp':datetime.datetime.utcnow().isoformat()+'Z'})" +
    "+chr(10))";
  return `python3 -c "${script}" # ${SILO_HOOK_MARKER}`;
}

interface HookEntry {
  type?: string;
  command?: string;
  [key: string]: unknown;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
  [key: string]: unknown;
}

/** Structural, not exhaustive — settings.json has many fields we never
 * touch; everything not explicitly modeled here just round-trips via the
 * `[key: string]: unknown` index signatures. */
export interface ClaudeSettings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

function isSiloEntry(entry: HookEntry): boolean {
  return (
    typeof entry.command === "string" &&
    entry.command.includes(SILO_HOOK_MARKER)
  );
}

/** Whether `settings` already has Silo's `SessionStart` hook installed. */
export function hasHookInstalled(settings: ClaudeSettings): boolean {
  const groups = settings.hooks?.SessionStart ?? [];
  return groups.some((g) => (g.hooks ?? []).some(isSiloEntry));
}

/** Return a **new** settings object with Silo's `SessionStart` hook
 * appended — idempotent (calling twice doesn't add a second copy) and
 * additive (never touches existing hook groups from other tools). */
export function withHookInstalled(settings: ClaudeSettings): ClaudeSettings {
  if (hasHookInstalled(settings)) return settings;
  const hooks = { ...(settings.hooks ?? {}) };
  const sessionStart = [...(hooks.SessionStart ?? [])];
  sessionStart.push({
    hooks: [{ type: "command", command: buildHookCommand() }],
  });
  hooks.SessionStart = sessionStart;
  return { ...settings, hooks };
}

/** Return a **new** settings object with only Silo's own `SessionStart`
 * hook entries removed — every other tool's hooks (e.g. an existing
 * "Superset" integration) are left exactly as they were. A hook group that
 * becomes empty after removing Silo's entry is dropped entirely rather than
 * left as inert litter. */
export function withHookUninstalled(settings: ClaudeSettings): ClaudeSettings {
  if (!settings.hooks?.SessionStart) return settings;
  const sessionStart = settings.hooks.SessionStart.map((g) => ({
    ...g,
    hooks: (g.hooks ?? []).filter((e) => !isSiloEntry(e)),
  })).filter((g) => (g.hooks?.length ?? 0) > 0);
  return {
    ...settings,
    hooks: { ...settings.hooks, SessionStart: sessionStart },
  };
}
