/**
 * Pure, merge-safe logic for installing/uninstalling a Silo session hook into
 * Cursor's `~/.cursor/hooks.json` — a different schema than Claude/Codex's
 * `hooks.<Event>[].hooks[]` shape. Cursor uses:
 *
 * ```json
 * { "version": 1, "hooks": { "sessionStart": [{ "command": "..." }] } }
 * ```
 *
 * Install only ever *appends* a `{ command }` entry under the event; uninstall
 * only ever removes entries whose command carries Silo's marker. Existing
 * third-party hooks (e.g. Superset) are left untouched.
 *
 * Confirmed live (2026-07-28, cursor-agent 2026.07.23): CLI `sessionStart`
 * fires with `session_id` on stdin; parent-walk + getpgid correlates to the
 * agent process group (raw getppid misses Cursor workers that setpgrp).
 */

/** Structural subset of Cursor's hooks.json — everything else round-trips. */
export interface CursorHooksFile {
  version?: number;
  hooks?: Record<string, CursorHookEntry[]>;
  [key: string]: unknown;
}

export interface CursorHookEntry {
  command?: string;
  [key: string]: unknown;
}

export interface CursorHookInstallSpec {
  /** Lifecycle event, e.g. `"sessionStart"` (camelCase in Cursor's schema). */
  hookEvent: string;
  marker: string;
  buildCommand: () => string;
}

function isSiloEntry(entry: CursorHookEntry, marker: string): boolean {
  return typeof entry.command === "string" && entry.command.includes(marker);
}

/** Whether Silo's hook is already present under `spec.hookEvent`. */
export function hasCursorHookInstalled(
  file: CursorHooksFile,
  spec: CursorHookInstallSpec,
): boolean {
  const entries = file.hooks?.[spec.hookEvent] ?? [];
  return entries.some((e) => isSiloEntry(e, spec.marker));
}

/** Append Silo's `{ command }` under `spec.hookEvent` — idempotent on
 * presence, additive for third-party entries. Refreshes the command body
 * in place when Silo's correlator has changed since last install. */
export function withCursorHookInstalled(
  file: CursorHooksFile,
  spec: CursorHookInstallSpec,
): CursorHooksFile {
  const command = spec.buildCommand();
  const hooks = { ...(file.hooks ?? {}) };
  const forEvent = [...(hooks[spec.hookEvent] ?? [])];

  if (hasCursorHookInstalled(file, spec)) {
    let changed = false;
    const refreshed = forEvent.map((e) => {
      if (!isSiloEntry(e, spec.marker) || e.command === command) return e;
      changed = true;
      return { ...e, command };
    });
    if (!changed) return file;
    hooks[spec.hookEvent] = refreshed;
    return { ...file, version: file.version ?? 1, hooks };
  }

  forEvent.push({ command });
  hooks[spec.hookEvent] = forEvent;
  return {
    ...file,
    version: file.version ?? 1,
    hooks,
  };
}

/** Remove only Silo's own entries under `spec.hookEvent`. */
export function withCursorHookUninstalled(
  file: CursorHooksFile,
  spec: CursorHookInstallSpec,
): CursorHooksFile {
  if (!file.hooks?.[spec.hookEvent]) return file;
  const forEvent = file.hooks[spec.hookEvent].filter(
    (e) => !isSiloEntry(e, spec.marker),
  );
  return {
    ...file,
    hooks: { ...file.hooks, [spec.hookEvent]: forEvent },
  };
}
