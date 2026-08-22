/**
 * Pure merge logic for pi's global settings file (`~/.pi/agent/settings.json`).
 * Silo surfaces `terminal.showTerminalProgress` as a separate toggle on
 * Settings → Agents (independent of the session-hook install).
 */

/** Relative to `$HOME`. */
export const PI_AGENT_SETTINGS_REL = ".pi/agent/settings.json";

export interface PiAgentSettings {
  terminal?: {
    showTerminalProgress?: boolean;
  };
  [key: string]: unknown;
}

/** Whether pi will emit OSC 9;4 progress for Silo's working/idle detection. */
export function getTerminalProgress(settings: PiAgentSettings): boolean {
  return settings.terminal?.showTerminalProgress ?? false;
}

/** Return a new settings object with terminal progress on or off. */
export function withTerminalProgress(
  settings: PiAgentSettings,
  enabled: boolean,
): PiAgentSettings {
  return {
    ...settings,
    terminal: {
      ...(settings.terminal ?? {}),
      showTerminalProgress: enabled,
    },
  };
}
