import { store } from "./store";
import type { TerminalSettings } from "./types";

/**
 * Resolve the effective terminal settings. Single global tier today (mirrors
 * `editor-settings.ts`); kept as the one read path so a future per-workspace
 * layer can merge here without touching call sites.
 */
export function getTerminalSettings(): TerminalSettings {
  return store.terminalSettings;
}

/** Update a single global terminal setting. */
export function setTerminalSetting<K extends keyof TerminalSettings>(
  key: K,
  value: TerminalSettings[K],
): void {
  store.terminalSettings[key] = value;
}
