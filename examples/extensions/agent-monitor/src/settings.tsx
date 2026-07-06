/**
 * The extension's own settings — a tiny reactive store implementing the SDK's
 * ReactiveService, mirroring the pattern used by the clock-extension example
 * (and, for the host's own settings pages, the terminal/editor settings
 * stores). `index.tsx` reads `settingsService.getState()` when deciding
 * whether focus should suppress or clear a terminal's status.
 *
 * Persisted via `ctx.storage.global` (shared across workspaces — this is a
 * general behavior preference, not per-project) so it survives an app
 * restart. `initSettings()` must be called once from `activate()`.
 */

import type { ExtensionStorage, ReactiveService } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";

const STORAGE_KEY = "hideStatusWhenFocused";

export interface AgentMonitorSettings {
  /**
   * When true: a working/attention row is suppressed for whichever terminal
   * is currently focused, and viewing a terminal clears its pending attention
   * flag. When false (default): status is shown regardless of focus.
   */
  hideStatusWhenFocused: boolean;
}

let settings: AgentMonitorSettings = { hideStatusWhenFocused: false };
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
    backingStorage?.set(STORAGE_KEY, settings.hideStatusWhenFocused);
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
    const stored = storage.get<boolean>(
      STORAGE_KEY,
      settings.hideStatusWhenFocused,
    );
    if (stored !== settings.hideStatusWhenFocused) {
      settings = { ...settings, hideStatusWhenFocused: stored };
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

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="am-row">
      <div className="am-row-text">
        <span className="am-label">{label}</span>
        <span className="am-hint">{hint}</span>
      </div>
      <label className="am-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.currentTarget.checked)}
          aria-label={label}
        />
        <span className="am-switch-track" />
      </label>
    </div>
  );
}

export function AgentMonitorSettingsPage() {
  const s = useServiceState(settingsService);
  return (
    <div className="am-page">
      <div className="am-header">
        <h2>Agent Monitor</h2>
      </div>
      <div className="am-list">
        <ToggleRow
          label="Hide status when terminal is focused"
          hint="Suppress the working/attention row and tab badge for whichever terminal you're currently viewing."
          checked={s.hideStatusWhenFocused}
          onChange={(v) => settingsService.set({ hideStatusWhenFocused: v })}
        />
      </div>
    </div>
  );
}
