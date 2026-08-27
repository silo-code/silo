/**
 * The extension's own settings — a tiny reactive store implementing the SDK's
 * ReactiveService, mirroring the pattern used by the clock-extension example
 * (and, for the host's own settings pages, the terminal/editor settings
 * stores). `index.tsx` reads `settingsService.getState()` when deciding what
 * focusing a terminal does to its status (whether to `ctx.agents.acknowledge`
 * it, and whether to hide its row).
 *
 * Persisted via `ctx.storage.global` (shared across workspaces — this is a
 * general behavior preference, not per-project) so it survives an app
 * restart. `initSettings()` must be called once from `activate()`.
 *
 * Kept free of any *runtime* `@silo-code/sdk` import (types only) so this
 * module — and `settings.test.ts`, which exercises it directly — never needs
 * to load the SDK package at all. `settings.tsx` is the thin component layer
 * that adds the one runtime import (`useServiceState`).
 */

import type { ExtensionStorage, ReactiveService } from "@silo-code/sdk";
import { sounds, type SoundName } from "./synth";

/**
 * What focusing an agent's terminal does to its status.
 *
 * - `"clear"` (default): viewing a finished terminal acknowledges the run —
 *   the green check and green status dot become the neutral grey "done" dot.
 * - `"hide"`: as `"clear"`, and additionally the workspace status row is
 *   hidden entirely for whichever terminal is currently focused.
 * - `"none"`: focus never changes status — the green finished indicator
 *   stays until the agent starts its next run.
 */
export type FocusBehavior = "clear" | "hide" | "none";

/** Whether/how the Agents panel shows each row's agent brand icon —
 * `"none"`, the official brand color, or a single monotone color. */
export type IconMode = "none" | "color" | "monotone";

/**
 * Which axis the Agents view sections its rows by. Until SDK 0.34 these were
 * two separately registered Navigator views ("Agents" and "Agents by
 * workspace"); they are one view and one persisted preference now, flipped
 * from the "View by" control in the Navigator's header. `"age"` is labeled
 * "Recent" in that control — the setting value keeps the shorter internal
 * name.
 */
export type GroupMode = "status" | "workspace" | "age";

export interface AgentMonitorSettings {
  focusBehavior: FocusBehavior;
  /** Whether a sound plays when an agent transitions working → waiting. */
  soundEnabled: boolean;
  /** Which synthesized sound to play. */
  soundId: SoundName;
  /** How the Agents panel shows each row's agent icon. */
  iconMode: IconMode;
  /** Which axis the Agents view groups its rows by. */
  groupBy: GroupMode;
  /** Whether `silo.agents` contributes per-terminal agent status rows to the
   * Navigator's workspace rows. Off = the workspace rows stay quiet even while
   * agents are working; the Agents view and tab badges are unaffected. */
  showWorkspaceStatusRows: boolean;
  /** Whether the Agents panel segments long-done agents out of the Done
   * heading into a collapsible "N+ hours old" one at all. */
  staleDoneEnabled: boolean;
  /** How long a "done" row sits before the Agents panel moves it out of the
   * Done heading into its own "N+ hours old" one. Whole hours, minimum 1.
   * Only takes effect while {@link staleDoneEnabled} is on. */
  staleDoneHours: number;
}

// Keys renamed on each shape change ("hideStatusWhenFocused" → "clearOnFocus"
// → this) so stale persisted values from older versions are simply ignored
// and the new default applies.
const STORAGE_KEY_FOCUS = "focusBehavior";
const STORAGE_KEY_SOUND_ENABLED = "soundEnabled";
const STORAGE_KEY_SOUND_ID = "soundId";
const STORAGE_KEY_ICON_MODE = "agentsIconMode";
const STORAGE_KEY_GROUP_BY = "agentsGroupBy";
const STORAGE_KEY_SHOW_WS_STATUS_ROWS = "agentsShowWorkspaceStatusRows";
const STORAGE_KEY_STALE_DONE_ENABLED = "agentsStaleDoneEnabled";
const STORAGE_KEY_STALE_DONE_HOURS = "agentsStaleDoneHours";

const DEFAULT_BEHAVIOR: FocusBehavior = "clear";
const DEFAULT_SOUND_ENABLED = true;
const DEFAULT_SOUND_ID: SoundName = "chime";
const DEFAULT_ICON_MODE: IconMode = "color";
const DEFAULT_GROUP_BY: GroupMode = "age";
export const DEFAULT_SHOW_WS_STATUS_ROWS = true;
export const DEFAULT_STALE_DONE_ENABLED = true;
export const DEFAULT_STALE_DONE_HOURS = 4;
export const MIN_STALE_DONE_HOURS = 1;

const VALID_BEHAVIORS: readonly FocusBehavior[] = ["clear", "hide", "none"];
const VALID_ICON_MODES: readonly IconMode[] = ["none", "color", "monotone"];
const VALID_GROUP_MODES: readonly GroupMode[] = ["status", "workspace", "age"];
// The synth's raw UI-feedback sounds (press/release/toggle) read as click
// acknowledgements, not "come look at this" — excluded from the curated
// list offered here. Everything else is `sounds`' own names, reused
// directly rather than hand-copied, so the list can't drift from what
// `play()` actually accepts.
const EXCLUDED_SOUND_IDS: readonly SoundName[] = ["press", "release", "toggle"];
export const SOUND_IDS: readonly SoundName[] = sounds.filter(
  (name) => !EXCLUDED_SOUND_IDS.includes(name),
);

/** Guard against garbage in storage (or values from a future version). */
function coerceBehavior(v: unknown): FocusBehavior {
  return VALID_BEHAVIORS.includes(v as FocusBehavior)
    ? (v as FocusBehavior)
    : DEFAULT_BEHAVIOR;
}

function coerceSoundEnabled(v: unknown): boolean {
  return typeof v === "boolean" ? v : DEFAULT_SOUND_ENABLED;
}

function coerceSoundId(v: unknown): SoundName {
  return SOUND_IDS.includes(v as SoundName)
    ? (v as SoundName)
    : DEFAULT_SOUND_ID;
}

function coerceIconMode(v: unknown): IconMode {
  return VALID_ICON_MODES.includes(v as IconMode)
    ? (v as IconMode)
    : DEFAULT_ICON_MODE;
}

function coerceGroupBy(v: unknown): GroupMode {
  return VALID_GROUP_MODES.includes(v as GroupMode)
    ? (v as GroupMode)
    : DEFAULT_GROUP_BY;
}

function coerceShowWorkspaceStatusRows(v: unknown): boolean {
  return typeof v === "boolean" ? v : DEFAULT_SHOW_WS_STATUS_ROWS;
}

function coerceStaleDoneEnabled(v: unknown): boolean {
  return typeof v === "boolean" ? v : DEFAULT_STALE_DONE_ENABLED;
}

/** Whole hours, at least {@link MIN_STALE_DONE_HOURS} — anything else
 * (garbage in storage, a fractional or sub-minimum value) falls back to the
 * default rather than being clamped, since a silently-clamped stored value
 * would drift from what the settings field displays. */
function coerceStaleDoneHours(v: unknown): number {
  return typeof v === "number" &&
    Number.isInteger(v) &&
    v >= MIN_STALE_DONE_HOURS
    ? v
    : DEFAULT_STALE_DONE_HOURS;
}

let settings: AgentMonitorSettings = {
  focusBehavior: DEFAULT_BEHAVIOR,
  soundEnabled: DEFAULT_SOUND_ENABLED,
  soundId: DEFAULT_SOUND_ID,
  iconMode: DEFAULT_ICON_MODE,
  groupBy: DEFAULT_GROUP_BY,
  showWorkspaceStatusRows: DEFAULT_SHOW_WS_STATUS_ROWS,
  staleDoneEnabled: DEFAULT_STALE_DONE_ENABLED,
  staleDoneHours: DEFAULT_STALE_DONE_HOURS,
};
let backingStorage: ExtensionStorage | null = null;
const listeners = new Set<(s: AgentMonitorSettings) => void>();

export const settingsService: ReactiveService<AgentMonitorSettings> & {
  set(patch: Partial<AgentMonitorSettings>): void;
} = {
  getState: () => settings,
  subscribe(listener) {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
  set(patch) {
    settings = { ...settings, ...patch };
    backingStorage?.set(STORAGE_KEY_FOCUS, settings.focusBehavior);
    backingStorage?.set(STORAGE_KEY_SOUND_ENABLED, settings.soundEnabled);
    backingStorage?.set(STORAGE_KEY_SOUND_ID, settings.soundId);
    backingStorage?.set(STORAGE_KEY_ICON_MODE, settings.iconMode);
    backingStorage?.set(STORAGE_KEY_GROUP_BY, settings.groupBy);
    backingStorage?.set(
      STORAGE_KEY_SHOW_WS_STATUS_ROWS,
      settings.showWorkspaceStatusRows,
    );
    backingStorage?.set(
      STORAGE_KEY_STALE_DONE_ENABLED,
      settings.staleDoneEnabled,
    );
    backingStorage?.set(STORAGE_KEY_STALE_DONE_HOURS, settings.staleDoneHours);
    for (const l of listeners) l(settings);
  },
};

/**
 * Bind persisted storage to the settings service — call once from
 * `activate()`. Reads the persisted value immediately and re-reads on every
 * storage change, since `ctx.storage` hydrates asynchronously and a value
 * saved last session may not be present at the instant `activate` runs.
 */
export function initSettings(storage: ExtensionStorage): {
  dispose(): void;
} {
  backingStorage = storage;
  function read() {
    const focusBehavior = coerceBehavior(
      storage.get<string>(STORAGE_KEY_FOCUS, settings.focusBehavior),
    );
    const soundEnabled = coerceSoundEnabled(
      storage.get<boolean>(STORAGE_KEY_SOUND_ENABLED, settings.soundEnabled),
    );
    const soundId = coerceSoundId(
      storage.get<string>(STORAGE_KEY_SOUND_ID, settings.soundId),
    );
    const iconMode = coerceIconMode(
      storage.get<string>(STORAGE_KEY_ICON_MODE, settings.iconMode),
    );
    const groupBy = coerceGroupBy(
      storage.get<string>(STORAGE_KEY_GROUP_BY, settings.groupBy),
    );
    const showWorkspaceStatusRows = coerceShowWorkspaceStatusRows(
      storage.get<boolean>(
        STORAGE_KEY_SHOW_WS_STATUS_ROWS,
        settings.showWorkspaceStatusRows,
      ),
    );
    const staleDoneEnabled = coerceStaleDoneEnabled(
      storage.get<boolean>(
        STORAGE_KEY_STALE_DONE_ENABLED,
        settings.staleDoneEnabled,
      ),
    );
    const staleDoneHours = coerceStaleDoneHours(
      storage.get<number>(
        STORAGE_KEY_STALE_DONE_HOURS,
        settings.staleDoneHours,
      ),
    );
    if (
      focusBehavior !== settings.focusBehavior ||
      soundEnabled !== settings.soundEnabled ||
      soundId !== settings.soundId ||
      iconMode !== settings.iconMode ||
      groupBy !== settings.groupBy ||
      showWorkspaceStatusRows !== settings.showWorkspaceStatusRows ||
      staleDoneEnabled !== settings.staleDoneEnabled ||
      staleDoneHours !== settings.staleDoneHours
    ) {
      settings = {
        ...settings,
        focusBehavior,
        soundEnabled,
        soundId,
        iconMode,
        groupBy,
        showWorkspaceStatusRows,
        staleDoneEnabled,
        staleDoneHours,
      };
      for (const l of listeners) l(settings);
    }
  }
  read();
  const sub = storage.subscribe(read);
  return { dispose: () => sub.dispose() };
}

export function clearSettingsListeners(): void {
  listeners.clear();
}
