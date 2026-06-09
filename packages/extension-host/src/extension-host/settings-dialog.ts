import { proxy } from "valtio";

/**
 * Ephemeral open-state for the Settings modal — app-shell host state, not
 * persisted and not part of the workspace model. The `SettingsDialog` component
 * renders from this proxy; extensions open/close the dialog through the
 * `settings.open` / `settings.close` commands (registered by `core.menu`), so
 * they never import the app shell directly.
 *
 * @internal
 */
export const settingsDialog = proxy<{ open: boolean; pageId: string | null }>({
  open: false,
  pageId: null,
});

/** @internal — backs the `settings.open` command. */
export function openSettings(pageId?: string): void {
  if (pageId) settingsDialog.pageId = pageId;
  settingsDialog.open = true;
}

/** @internal — backs the `settings.close` command. */
export function closeSettings(): void {
  settingsDialog.open = false;
}
