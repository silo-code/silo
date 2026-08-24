import { proxy } from "valtio";

/**
 * Ephemeral open-state for **Settings** — app-shell host state, not persisted
 * and not part of the workspace model. The `SettingsSheet` component renders
 * from this proxy; extensions open/close Settings through the `settings.open` /
 * `settings.close` commands (registered by `core.menu`), so they never import
 * the app shell directly.
 *
 * Settings is a centered app **sheet** (see extension-host/Sheet.tsx), which
 * replaced the modal it used to be. The sheet primitive is still experimental
 * and host-internal — Settings is its first real consumer, not a public
 * blessing of the API.
 *
 * @internal
 */
export const settingsSheet = proxy<{ open: boolean; pageId: string | null }>({
  open: false,
  pageId: null,
});

/** @internal — backs the `settings.open` command. */
export function openSettings(pageId?: string): void {
  if (pageId) settingsSheet.pageId = pageId;
  settingsSheet.open = true;
}

/** @internal — backs the `settings.close` command. */
export function closeSettings(): void {
  settingsSheet.open = false;
}
