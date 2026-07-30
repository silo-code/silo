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

import type {
  Workspace,
  SidePanelSlot,
  CustomTheme,
  TerminalRecord,
  EditorRecord,
  AgentActivity,
} from "@silo-code/sdk";

/**
 * Host-internal workspace shape. Extends the public {@link Workspace} with the
 * layout, scroll, and panel-state fields the host reads and writes. Extensions
 * receive only the public `Workspace` type through `WorkspaceService`.
 *
 * Not exported from `@silo-code/sdk` — host-only.
 */
export interface WorkspaceInternal extends Workspace {
  terminals: TerminalRecord[];
  editors: EditorRecord[];
  dockLayout: unknown | null;
  editorScrollPositions?: Record<string, { top: number; left: number }>;
  editorViewStates?: Record<string, unknown>;
  /** Per-tab word-wrap/minimap overrides, toggled from the editor's context menu. */
  editorSettingsOverrides?: Record<string, EditorSettingsOverride>;
  sidePanelLocations?: Record<string, SidePanelSlot>;
  sidePanelOrder?: Record<string, number>;
  activeSidePanelTabs?: Record<string, string>;
  sidePanelScrollPositions?: Record<string, number>;
  /** Absent key = visible (default); only explicit `false` is stored. */
  sidePanelVisibility?: Record<string, boolean>;
  extensionState?: Record<string, Record<string, unknown>>;
  previewEditorId?: string | null;
  leftPanelCollapsed?: boolean;
  rightPanelCollapsed?: boolean;
}

// ── Host-only state types (not part of the public surface) ──

/**
 * A named, collapsible group in the Workspaces side panel. Purely
 * organizational — groups don't affect workspace activation or the public
 * WorkspaceService. Stored in `AppState.groups` keyed by id.
 *
 * Not to be confused with the SDK's `WorkspaceSectionProvider`: a *section* is
 * an extension-contributed component mounted inside a workspace row, whereas a
 * *group* is a user-created collapsible grouping of rows.
 */
export interface WorkspaceGroup {
  id: string; // "grp_<uuid>"
  name: string;
  collapsed: boolean;
  workspaceOrder: string[]; // workspace IDs in this group, in user-defined order
  color?: string; // optional accent color, e.g. "#e06c75"
  /** ISO timestamp when the group was closed via `closeGroup`; absent/null = open.
   *  Mirrors `Workspace.closedAt`. A closed group stays in `panelOrder` (position
   *  is preserved for restore) but is filtered out of rendering/nav. */
  closedAt?: string | null;
  /** Member ids that were open at close time — the exact set `restoreGroup`
   *  reopens. Present iff `closedAt` is set; a member closed before the group
   *  was closed is excluded and stays individually closed after restore. */
  closedMemberIds?: string[];
}

/**
 * Persisted subset of the SDK's `AgentInfo`, keyed by terminal id in
 * `AppState.agentState`. Excludes `kind` (re-read fresh from the terminal
 * record on restore) and `terminalId` (the map key). Written by the host's
 * `ctx.agents` implementation on every real transition; read back on restore
 * to compute `stale` from `lastLiveAt`. See RFC 0018.
 */
export interface PersistedAgentInfo {
  workspaceId: string;
  isAgent: boolean;
  activity: AgentActivity;
  needsAttention: boolean;
  attentionSince?: string;
  workingSince?: string;
  /** Which source last set activity to "working"; gates timer-source
   *  demotion after restore the same way it does live — see
   *  `agent-activity-model.ts`'s `reduce()`. */
  workingSource: "agent" | "shell" | null;
  sessionId?: string;
  resumeCommand?: string;
  agentName?: string;
  /** Stable catalog key, e.g. "claude" — see AgentInfo.agentId's doc comment. */
  agentId?: string;
  /** ISO timestamp of the last live (non-stale-restore) update — the
   *  reference point for computing the gap against the stale threshold. */
  lastLiveAt: string;
}

export interface AppState {
  workspaces: Record<string, WorkspaceInternal>;
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
  /**
   * Host-owned `ctx.agents` state, keyed by terminal id. Not extension-facing
   * (unlike `extensionState`/`globalExtensionState`) — no `ctx.storage`
   * surface exposes this; it backs `AgentsService` directly. Global, not
   * per-workspace-swapped, since a terminal id is already globally unique and
   * each `PersistedAgentInfo` carries its own `workspaceId`.
   */
  agentState: Record<string, PersistedAgentInfo>;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  /**
   * Small screen mode (RFC-less; see `small-screen-mode.ts`): global (not
   * per-workspace) on/off switch and the window-width threshold below which a
   * side panel that's currently open gets auto-collapsed. Persisted in the
   * global index, like `uiFontSize`.
   */
  smallScreenModeEnabled: boolean;
  smallScreenThresholdPx: number;
  /**
   * True while the respective side panel is collapsed *because* small-screen
   * mode hid it, as opposed to a manual collapse. Drives auto-restore on a
   * large screen, edge-hover peek eligibility, and Tab-order exclusion.
   * Ephemeral — recomputed on launch/resize, never persisted.
   */
  leftPanelAutoHidden: boolean;
  rightPanelAutoHidden: boolean;
  /**
   * True while an auto-hidden panel is temporarily revealed by an edge-hover
   * peek. Ephemeral UI state, never persisted.
   */
  leftPanelPeeking: boolean;
  rightPanelPeeking: boolean;
  /**
   * True while the user is actively dragging the peek overlay's resize
   * handle — keeps the peek open even if the cursor briefly moves outside
   * the overlay's (pre-drag) bounds while growing it. Ephemeral, never
   * persisted.
   */
  leftPanelPeekDragging: boolean;
  rightPanelPeekDragging: boolean;
  /**
   * The peek overlay's width — global (not per-workspace) and independent of
   * the panel's normal (large-screen) width, since it's a separate, small-
   * screen-only sizing the user tunes by dragging the peek's own resize
   * handle. Persisted in the global index, like `smallScreenThresholdPx`.
   */
  smallScreenPeekWidthLeftPx: number;
  smallScreenPeekWidthRightPx: number;
  /**
   * Side-panel visibility, keyed by panel id. Per-workspace: snapshotted into
   * the active workspace and swapped when the active workspace changes (like
   * the other panel-state fields). Absent = visible (default); only an explicit
   * `false` (hidden) is stored.
   */
  sidePanelVisibility: Record<string, boolean>;
  /**
   * Named collapsible groups in the Workspaces panel, keyed by group id. A
   * group's `workspaceOrder` is the single source of truth for membership — a
   * workspace belongs to the group whose `workspaceOrder` contains it. The
   * reverse lookup (workspace id → group id) is *derived* from this, never
   * stored, so the two can't drift; see `groupIdForWorkspace` /
   * `workspaceGroupMap` in `workspaces.ts`.
   */
  groups: Record<string, WorkspaceGroup>;
  /**
   * The single top-level order of the Workspaces panel: an interleaved list of
   * **ungrouped workspace ids** and **group ids**. Grouped workspaces are *not*
   * here (they live inside their group's `workspaceOrder`). This is what lets a
   * group be dragged anywhere in the list, including above loose workspaces.
   * (`workspaceOrder` above is the separate all-workspaces registry order that
   * backs the public WorkspaceService; `panelOrder` is panel presentation.)
   */
  panelOrder: string[];
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

/** Default small-screen-mode threshold — tuned for a MacBook's built-in
 * display once an external monitor is disconnected; user-adjustable in
 * Settings → Layout. */
export const DEFAULT_SMALL_SCREEN_THRESHOLD_PX = 1440;
export const MIN_SMALL_SCREEN_THRESHOLD_PX = 200;
/** Width above `threshold` a panel must regain before small-screen mode exits
 * — prevents hide/show flicker right at the boundary. */
export const SMALL_SCREEN_HYSTERESIS_PX = 80;

/** Default width for the small-screen peek overlay — independent of, and
 * usually narrower than, the panel's normal (large-screen) width. Drag the
 * peek's own resize handle to change it; adjustable range below. */
export const DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX = 400;
export const MIN_SMALL_SCREEN_PEEK_WIDTH_PX = 180;
export const MAX_SMALL_SCREEN_PEEK_WIDTH_PX = 600;

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

/**
 * A single tab's overrides of the global {@link EditorSettings} — only the
 * fields a per-instance context-menu toggle can flip. Absent keys fall
 * through to the global setting; see mergeEditorSettings() in
 * editor-settings.ts.
 */
export type EditorSettingsOverride = Partial<
  Pick<EditorSettings, "wordWrap" | "minimap">
>;

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
