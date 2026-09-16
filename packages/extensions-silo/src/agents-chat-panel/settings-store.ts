/**
 * The Chat panel's own settings — a tiny reactive store implementing the SDK's
 * `ReactiveService`, mirroring `silo.agents`' `settings-store.ts`.
 *
 * Persisted via `ctx.storage.global` (shared across workspaces — "do I want to
 * be asked before throwing a conversation away" is a general behavior
 * preference, not a per-project one) so it survives an app restart.
 * `initChatPanelSettings()` must be called once from `activate()`.
 *
 * Kept free of any *runtime* `@silo-code/sdk` import (types only) so this
 * module — and `settings-store.test.ts`, which exercises it directly — never
 * needs to load the SDK package at all. `settings.tsx` is the thin component
 * layer that adds the one runtime import (`useServiceState`).
 */

import type { ExtensionStorage, ReactiveService } from "@silo-code/sdk";

export interface ChatPanelSettings {
  /**
   * Whether **Clear Session** asks for confirmation before it runs.
   *
   * On by default: a session reset (RFC 0048) discards the transcript
   * journal, and for a `resume`-only or `journal-only` session that journal is
   * the only copy of the conversation. ADR 0046's carve-out for deleting user
   * data is an *explicit* choice at the moment of the action — the
   * confirmation is what makes the gesture explicit rather than a keystroke
   * away from a shortcut the user meant to press in a terminal.
   *
   * The confirmation's own "Don't ask again" checkbox turns this off, and this
   * setting (Settings → Agents → Chat) is how it comes back.
   */
  confirmBeforeClear: boolean;
}

const STORAGE_KEY_CONFIRM_BEFORE_CLEAR = "confirmBeforeClearSession";

export const DEFAULT_CONFIRM_BEFORE_CLEAR = true;

/** Guard against garbage in storage (or a value from a future version). */
function coerceConfirmBeforeClear(v: unknown): boolean {
  return typeof v === "boolean" ? v : DEFAULT_CONFIRM_BEFORE_CLEAR;
}

let settings: ChatPanelSettings = {
  confirmBeforeClear: DEFAULT_CONFIRM_BEFORE_CLEAR,
};
let backingStorage: ExtensionStorage | null = null;
const listeners = new Set<(s: ChatPanelSettings) => void>();

export const chatPanelSettingsService: ReactiveService<ChatPanelSettings> & {
  set(patch: Partial<ChatPanelSettings>): void;
} = {
  getState: () => settings,
  subscribe(listener) {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
  set(patch) {
    settings = { ...settings, ...patch };
    backingStorage?.set(
      STORAGE_KEY_CONFIRM_BEFORE_CLEAR,
      settings.confirmBeforeClear,
    );
    for (const l of listeners) l(settings);
  },
};

/**
 * Bind persisted storage to the settings service — call once from
 * `activate()`. Reads the persisted value immediately and re-reads on every
 * storage change, since `ctx.storage` hydrates asynchronously and a value
 * saved last session may not be present at the instant `activate` runs.
 */
export function initChatPanelSettings(storage: ExtensionStorage): {
  dispose(): void;
} {
  backingStorage = storage;
  function read() {
    const confirmBeforeClear = coerceConfirmBeforeClear(
      storage.get<boolean>(
        STORAGE_KEY_CONFIRM_BEFORE_CLEAR,
        settings.confirmBeforeClear,
      ),
    );
    if (confirmBeforeClear !== settings.confirmBeforeClear) {
      settings = { ...settings, confirmBeforeClear };
      for (const l of listeners) l(settings);
    }
  }
  read();
  const sub = storage.subscribe(read);
  return { dispose: () => sub.dispose() };
}

export function clearChatPanelSettingsListeners(): void {
  listeners.clear();
}
