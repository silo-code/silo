/**
 * Pure, merge-safe logic for installing/uninstalling a Silo session hook into
 * a Claude-style `settings.json` object — a real settings.json commonly
 * already has hooks from other tools (confirmed in this project's own
 * testing: an existing "Superset" integration hooks `SessionStart`,
 * `SessionEnd`, `UserPromptSubmit`, `Stop`). Install only ever *appends* a
 * new hook-group entry; uninstall only ever removes entries carrying Silo's
 * own marker, never touching anyone else's.
 *
 * The per-agent facts (which event, the marker, the exact command) live in
 * the agent catalog (`@silo-code/extension-host/internal`), not here — this
 * file is just the settings.json merge algorithm, parameterized by a
 * {@link HookInstallSpec} the caller pulls off the catalog entry. That keeps
 * it dependency-free (and independently unit-testable) while staying the
 * single source of truth for the merge behavior.
 *
 * NOTE: the merge shape assumed here (`hooks.<Event>[].hooks[]`) is
 * Claude/Codex-style. Cursor and Copilot use different schemas and have
 * their own installers (`cursor-hook-installer.ts`,
 * `copilot-hook-installer.ts`), selected via `AgentHookResume.installStrategy`.
 */

/** The subset of an agent's hook descriptor this module needs — structurally
 * satisfied by the catalog's `AgentHookResume`, but declared locally so this
 * pure module imports nothing from the host. */
export interface HookInstallSpec {
  /** Lifecycle event to attach under, e.g. `"SessionStart"`. */
  hookEvent: string;
  /** Marker embedded in the command, used to find only Silo's own entries. */
  marker: string;
  /** Builds the single-line command string to install. */
  buildCommand: () => string;
  /** Optional human-readable label written onto the installed entry (e.g.
   * Codex's `statusMessage` field), for agents whose schema supports one and
   * whose review UI might surface it — identifying attribution beyond what's
   * visible in a (possibly truncated) command preview. Omitted entirely when
   * absent, not written as `undefined`, so agents without this field in their
   * schema get a clean entry with no stray key. */
  statusMessage?: string;
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

function isSiloEntry(entry: HookEntry, marker: string): boolean {
  return typeof entry.command === "string" && entry.command.includes(marker);
}

/** Whether `settings` already has Silo's hook installed for this spec's event. */
export function hasHookInstalled(
  settings: ClaudeSettings,
  spec: HookInstallSpec,
): boolean {
  const groups = settings.hooks?.[spec.hookEvent] ?? [];
  return groups.some((g) =>
    (g.hooks ?? []).some((e) => isSiloEntry(e, spec.marker)),
  );
}

/** Return a **new** settings object with Silo's hook under `spec.hookEvent`.
 * Idempotent on *presence* (never adds a second Silo entry) and additive
 * (never touches other tools' groups). If Silo's entry is already present
 * but its command body drifted (correlator fixes), refresh it in place. */
export function withHookInstalled(
  settings: ClaudeSettings,
  spec: HookInstallSpec,
): ClaudeSettings {
  const command = spec.buildCommand();
  const hooks = { ...(settings.hooks ?? {}) };
  const forEvent = [...(hooks[spec.hookEvent] ?? [])];

  if (hasHookInstalled(settings, spec)) {
    let changed = false;
    const refreshed = forEvent.map((g) => {
      const entries = (g.hooks ?? []).map((e) => {
        if (!isSiloEntry(e, spec.marker) || e.command === command) return e;
        changed = true;
        const next: HookEntry = { ...e, command };
        if (spec.statusMessage) next.statusMessage = spec.statusMessage;
        return next;
      });
      return { ...g, hooks: entries };
    });
    if (!changed) return settings;
    hooks[spec.hookEvent] = refreshed;
    return { ...settings, hooks };
  }

  const entry: HookEntry = { type: "command", command };
  if (spec.statusMessage) entry.statusMessage = spec.statusMessage;
  forEvent.push({ hooks: [entry] });
  hooks[spec.hookEvent] = forEvent;
  return { ...settings, hooks };
}

/** Return a **new** settings object with only Silo's own hook entries removed
 * from `spec.hookEvent` — every other tool's hooks (e.g. an existing
 * "Superset" integration) are left exactly as they were. A hook group that
 * becomes empty after removing Silo's entry is dropped entirely rather than
 * left as inert litter. */
export function withHookUninstalled(
  settings: ClaudeSettings,
  spec: HookInstallSpec,
): ClaudeSettings {
  if (!settings.hooks?.[spec.hookEvent]) return settings;
  const forEvent = settings.hooks[spec.hookEvent]
    .map((g) => ({
      ...g,
      hooks: (g.hooks ?? []).filter((e) => !isSiloEntry(e, spec.marker)),
    }))
    .filter((g) => (g.hooks?.length ?? 0) > 0);
  return {
    ...settings,
    hooks: { ...settings.hooks, [spec.hookEvent]: forEvent },
  };
}
