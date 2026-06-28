// The public domain types (workspace / terminal / editor-record / theme shapes)
// are owned by the SDK leaf — the single source of truth. The host re-exports
// them here so app code keeps importing them from "state/types" unchanged.
export type {
  TerminalKind,
  TerminalRecord,
  EditorMode,
  EditorRecord,
  SidePanelSlot,
  Workspace,
  ThemeBase,
  ThemeVars,
  CustomTheme,
  ThemeExport,
} from "@silo-code/sdk";

import type { Workspace, SidePanelSlot, CustomTheme } from "@silo-code/sdk";

// ── Host-only state types (not part of the public surface) ──

export interface AppState {
  workspaces: Record<string, Workspace>;
  workspaceOrder: string[];
  activeWorkspaceId: string | null;
  hydrated: boolean;
  uiFontSize: number;
  activeThemeId: string;
  /** Global editor (Monaco) preferences. Read via getEditorSettings(). */
  editorSettings: EditorSettings;
  /** Global terminal preferences. Read via getTerminalSettings(). */
  terminalSettings: TerminalSettings;
  /** Loaded from disk at startup; not persisted in the Tauri store. */
  customThemes: CustomTheme[];
  /**
   * User-chosen slot overrides, keyed by side-panel id.
   * Possible values: "left" | "right" | "left-bottom" | "right-bottom".
   * If a key is absent the panel renders at its registered default location.
   */
  sidePanelLocations: Record<string, SidePanelSlot>;
  /**
   * Sort order within each slot, keyed by side-panel id.
   * Lower numbers appear first. Missing entries sort as 0.
   */
  sidePanelOrder: Record<string, number>;
  /**
   * Last-active panel id per slot, keyed by SidePanelSlot string.
   * Restored on reload so the same tab is visible after restart.
   */
  activeSidePanelTabs: Record<string, string>;
  /**
   * Scroll positions for side panels, keyed by panel id.
   * Stores the scrollTop of the panel's content area.
   */
  sidePanelScrollPositions: Record<string, number>;
  /**
   * Per-extension/side-panel namespaced state, keyed first by panel id then
   * by key. This is the **workspace** scope: it is snapshotted into the active
   * workspace and swapped when the active workspace changes. Backs
   * `SidePanelProps.storage` (keyed by panel id) and `ctx.storage.workspace`
   * (keyed by extension id).
   */
  extensionState: Record<string, Record<string, unknown>>;
  /**
   * Per-extension namespaced state shared across **all** workspaces. This is
   * the **global** scope (`ctx.storage.global`), keyed first by extension id
   * then by key. Persisted in the global index, not per-workspace.
   */
  globalExtensionState: Record<string, Record<string, unknown>>;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  /**
   * Global side-panel visibility, keyed by panel id. Shared across workspaces.
   * Absent = visible (default); only an explicit `false` (hidden) is stored.
   */
  sidePanelVisibility: Record<string, boolean>;
  /**
   * Set to `true` after `ExtensionManager.loadInstalled()` resolves. The dock
   * gates `fromJSON` layout restore behind this flag so external extensions
   * (which activate during loadInstalled) have time to register their
   * `DockPanelKind`s before saved panel types are deserialized.
   */
  extensionsReady: boolean;
}

export const DEFAULT_UI_FONT_SIZE = 13;
export const MIN_UI_FONT_SIZE = 9;
export const MAX_UI_FONT_SIZE = 24;

export type RenderWhitespace =
  | "none"
  | "boundary"
  | "selection"
  | "trailing"
  | "all";
export type RenderLineHighlight = "none" | "gutter" | "line" | "all";

/**
 * User-facing editor (Monaco) preferences. Currently a single global tier; the
 * resolver in `editor-settings.ts` is the only read path, so a later
 * per-workspace / project-config (.editorconfig, .prettierrc) override layer
 * can be merged there without touching call sites. See getEditorSettings().
 */
export interface EditorSettings {
  /** Run "Format Document" before writing to disk on save. */
  formatOnSave: boolean;
  /** Auto-format as you type (provider permitting). */
  formatOnType: boolean;
  /** Auto-format pasted text (provider permitting). */
  formatOnPaste: boolean;
  tabSize: number;
  /** Insert spaces instead of tab characters when indenting. */
  insertSpaces: boolean;
  /** Soft-wrap long lines at the viewport edge. */
  wordWrap: boolean;
  /** Show the minimap overview on the right edge. */
  minimap: boolean;
  renderWhitespace: RenderWhitespace;
  renderLineHighlight: RenderLineHighlight;
  smoothScrolling: boolean;
  /** Show the path breadcrumb bar at the top of editors. */
  breadcrumbs: boolean;
}

/**
 * Defaults intentionally mirror the editor's previously-hardcoded options (see
 * git history of TextViewer) so shipping the settings page doesn't change
 * anyone's editor on upgrade. These differ from raw Monaco defaults — e.g.
 * Monaco defaults minimap on and tabSize to 4.
 */
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  formatOnSave: false,
  formatOnType: false,
  formatOnPaste: false,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: false,
  minimap: false,
  renderWhitespace: "selection",
  renderLineHighlight: "gutter",
  smoothScrolling: true,
  breadcrumbs: true,
};

export type TerminalCursorStyle = "block" | "bar" | "underline";

export const MIN_TERMINAL_FONT_SIZE_OFFSET = -4;
export const MAX_TERMINAL_FONT_SIZE_OFFSET = 10;

/** User-facing terminal preferences (global tier, mirrors EditorSettings). */
export interface TerminalSettings {
  /** Show the working-directory breadcrumb bar at the top of terminals. */
  breadcrumbs: boolean;
  /** xterm cursor shape. */
  cursorStyle: TerminalCursorStyle;
  /** Copy the selection to the clipboard as soon as it's made. */
  copyOnSelect: boolean;
  /** Right-click pastes the clipboard instead of opening the context menu. */
  pasteOnRightClick: boolean;
  /** Shell to launch; empty = the user's `$SHELL` (resolved in the daemon). */
  shell: string;
  /** Whitespace-separated args passed to the shell (default a login shell). */
  shellArgs: string;
  /**
   * Lines scrolled per mouse-wheel tick. Mirrors xterm's `scrollSensitivity`.
   * Higher = faster. Valid range: {@link MIN_TERMINAL_SCROLL_SENSITIVITY}–{@link MAX_TERMINAL_SCROLL_SENSITIVITY}.
   */
  scrollSensitivity: number;
  /**
   * Lines scrolled per tick while holding Alt/Option. Mirrors xterm's
   * `fastScrollSensitivity`. Valid range: {@link MIN_TERMINAL_SCROLL_SENSITIVITY}–{@link MAX_TERMINAL_FAST_SCROLL_SENSITIVITY}.
   */
  fastScrollSensitivity: number;
  /** Monospace font family. Empty string = platform-appropriate default stack. */
  fontFamily: string;
  /**
   * Signed px offset added to (uiFontSize + 0.5). 0 = original terminal feel
   * (the hardcoded default before this setting existed). Positive = larger,
   * negative = smaller. Zooms with the rest of the app when the user changes
   * the global UI font size.
   */
  fontSizeOffset: number;
}

export const MIN_TERMINAL_SCROLL_SENSITIVITY = 1;
export const MAX_TERMINAL_SCROLL_SENSITIVITY = 50;
export const DEFAULT_TERMINAL_SCROLL_SENSITIVITY = 3;
export const MAX_TERMINAL_FAST_SCROLL_SENSITIVITY = 50;
export const DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY = 5;

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  breadcrumbs: true,
  cursorStyle: "block",
  copyOnSelect: false,
  pasteOnRightClick: false,
  shell: "",
  shellArgs: "-l",
  scrollSensitivity: DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
  fastScrollSensitivity: DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY,
  fontFamily: "",
  fontSizeOffset: 0,
};
