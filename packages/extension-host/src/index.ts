/**
 * `@silo-code/extension-host` — the workbench host runtime.
 *
 * This barrel is the host's **public-to-the-app** surface: everything the
 * composition root (`apps/desktop`) needs to boot and drive the workbench —
 * the app shell + chrome components, the store/persistence bootstrap, the
 * extension activation entry point, and the handful of host services the
 * automation bridge talks to directly.
 *
 * The **privileged extension surface** lives on the separate `./internal`
 * subpath ({@link "@silo-code/extension-host/internal"}); it is consumed only by
 * bundled `core.*` extensions and is never published.
 */

// The host owns the workbench's global stylesheet (design tokens + base
// layout). Importing the barrel injects it, so the app doesn't need to know the
// path. Was `apps/desktop/src/main.tsx`'s first import before the cluster move.
import "./layout/theme.css";

// --- App shell + chrome (rendered by App.tsx) -------------------------------
export { AppShell } from "./layout/AppShell";
export { ThemeInjector } from "./layout/ThemeInjector";
export { reloadCustomThemes } from "./layout/ThemeLoader";
export { Shortcuts } from "./components/Shortcuts";
export { SettingsDialog } from "./components/SettingsDialog";
export { ModalHost } from "./components/ModalHost";
export { Toasts } from "./components/Toasts";
export { Menus } from "./components/Menus";

// --- Boot sequence (main.tsx) -----------------------------------------------
export { hydrate } from "./state/persistence";
export { userConfigDir } from "./services/user-config";
export { activateExtensions } from "./extension-host/host";
export { getExtensionManager } from "./extension-host/extension-manager";
export { initUserKeybindings } from "./extension-host/keymap";
export { checkForUpdatesOnLaunch } from "./services/updater";

// --- Host services the automation bridge drives directly --------------------
export { getThemeService } from "./extension-host/theme-service";
export { getProcessService } from "./extension-host/process-service";
export { getTerminalService } from "./extension-host/terminal-service";
export { executeCommand } from "./extension-host/commands";
export { contextKeys } from "./extension-host/context-keys";
export { sidePanelRegistry } from "./extension-host/side-panels";
export { ensureMonaco } from "./docked/monaco-setup";
// Test-driver only (the dev automation bridge uses it to set up a center split).
export { splitActivePanel } from "./docked/dock-api-registry";
export { store } from "./state/store";
export {
  createWorkspace,
  activateWorkspace,
  deleteWorkspace,
  openEditor,
  openDiff,
  openPreviewDiff,
} from "./state/workspaces";
