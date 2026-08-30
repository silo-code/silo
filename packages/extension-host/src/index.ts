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
// The class contract for the @silo-code/sdk modal component kit (RFC 0016).
// Unused until the SDK components + bundled-modal migrations land (Phases
// 3-4); importing it now keeps the CSS reviewable as its own change.
import "./layout/components.css";

// --- App shell + chrome (rendered by App.tsx) -------------------------------
export { ErrorBoundary } from "./components/ErrorBoundary";
export { AppShell } from "./layout/AppShell";
export { ThemeInjector } from "./layout/ThemeInjector";
export { reloadCustomThemes } from "./layout/ThemeLoader";
export { Shortcuts } from "./components/Shortcuts";
// Settings, as a centered app sheet (it replaced the Settings modal).
export { SettingsSheet } from "./components/SettingsSheet";
export { ModalHost } from "./components/ModalHost";
export { SheetDialogHost } from "./components/SheetDialogHost";
export { Toasts } from "./components/Toasts";
export { Menus } from "./components/Menus";

// --- Boot sequence (main.tsx) -----------------------------------------------
export { hydrate, persistImmediately } from "./state/persistence";
export { flushEditorBackups } from "./state/editor-backups";
export { userConfigDir } from "./services/user-config";
export { initStorageRoot } from "./extension-host/extension-storage-dirs";
export { activateExtensions } from "./extension-host/host";
export { getExtensionManager } from "./extension-host/extension-manager";
export { initUserKeybindings } from "./extension-host/keymap";
export { initGlobalErrorCapture } from "./extension-host/global-error-capture";

// --- Host services the automation bridge drives directly --------------------
export { getThemeService } from "./extension-host/theme-service";
export { getProcessService } from "./extension-host/process-service";
export { getTerminalService } from "./extension-host/terminal-service";
export { getWorkspaceService } from "./extension-host/workspace-service";
export { executeCommand, commandRegistry } from "./extension-host/commands";
export { contextKeys } from "./extension-host/context-keys";
export { sidePanelRegistry } from "./extension-host/side-panels";
export { ensureMonaco } from "./docked/monaco-setup";
// Test-driver only (the dev automation bridge uses it to set up a center split,
// and to read which tab the center dock is actually showing).
export { splitActivePanel, getActiveDockApi } from "./docked/dock-api-registry";
// Test-driver only — lets the automation bridge simulate "window regained OS
// focus" (Tauri's onFocusChanged) without a real window blur/refocus, which
// automation can't drive.
export { restoreRegionFocus } from "./extension-host/focus-restore";
// Output log query — lets the automation bridge surface logs to external tools.
// `createHostChannel` is for app-owned diagnostics (e.g. the Dev UI freeze probe).
export {
  getOutputLogs,
  createHostChannel,
  type OutputLogsResult,
  type OutputLogEntry,
} from "./extension-host/output-store";

// Test-driver only — busy-status registry (RFC 0026 StatusBar slot).
export { setBusyStatus, clearBusyStatus } from "./extension-host/busy-status";

// Host startup StatusBar sequence (RFC 0026).
export {
  beginStartupStatus,
  markStartupHydrated,
  markStartupExtensionsReady,
  markStartupLayoutReady,
  isStartupStatusActive,
} from "./extension-host/startup-status";

export { store, setExtensionsReady } from "./state/store";
export {
  createWorkspace,
  activateWorkspace,
  deleteWorkspace,
  openEditor,
  openDiff,
  openPreviewDiff,
} from "./state/workspaces";
