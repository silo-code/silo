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

import { defaultTrees, type SideDockTrees } from "./side-dock-tree";
import type { ColumnWidthsByMode } from "./column-widths";
import type {
  Workspace,
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
export interface WorkspaceInternal
  extends Workspace, Partial<PanelStateSnapshot> {
  terminals: TerminalRecord[];
  editors: EditorRecord[];
  dockLayout: unknown | null;
  editorScrollPositions?: Record<string, { top: number; left: number }>;
  editorViewStates?: Record<string, unknown>;
  /** Per-tab word-wrap/minimap overrides, toggled from the editor's context menu. */
  editorSettingsOverrides?: Record<string, EditorSettingsOverride>;
  previewEditorId?: string | null;
}

/** Collapse state of the two side columns, as one value — the unit both layout
 * modes (normal / small-screen) are remembered in. */
export interface SideCollapseState {
  left: boolean;
  right: boolean;
}

/**
 * The per-workspace panel fields the live store and a workspace record hold
 * **under the same name and shape** — declared once here so adding one adds it
 * to both {@link AppState} (required, always present) and
 * {@link WorkspaceInternal} (optional, absent in older records).
 *
 * The mapping between the two lives in `state/panel-state.ts`. Anything whose
 * live shape *differs* from its stored shape stays out of here and is handled
 * explicitly there — today that's the collapse state, which the store keys by
 * which layout mode is on screen and the record keys by which mode it is (see
 * `extension-host/small-screen-mode.ts`).
 */
export interface SharedPanelState {
  /**
   * The geometry of both side docks: how each one is divided into panes and in
   * what proportions (RFC 0027). Membership — which panel is in which pane —
   * stays in {@link sidePanelLocations}; this says only where the panes are.
   *
   * **One copy, shared by both layout modes**, unlike collapse state and column
   * widths (ADR 0033). A tree decides which pane *ids exist*, and
   * `sidePanelLocations` is itself single-copy, so forking the tree per mode
   * would let a panel's recorded pane exist in one mode and not the other —
   * membership can't follow a fork that its own map has no way to express. What
   * genuinely needs to differ on a narrow window is how wide a dock is and
   * whether it's open, and both of those already are per-mode.
   */
  sideDockTrees: SideDockTrees;
  /**
   * User-chosen placement overrides, keyed by side-panel id. The value is a
   * **pane id** — opaque, and meaningful only against {@link sideDockTrees}.
   * Absent means the panel renders in the dock it registered with, and so does
   * an id no longer present in the tree (see `layout/side-panel-slots.ts`).
   */
  sidePanelLocations: Record<string, string>;
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
   * Side-panel visibility, keyed by panel id. Absent = visible (default); only
   * an explicit `false` (hidden) is stored.
   */
  sidePanelVisibility: Record<string, boolean>;
  /**
   * Per-extension/side-panel namespaced state, keyed first by panel id then
   * by key. This is the **workspace** scope: it is snapshotted into the active
   * workspace and swapped when the active workspace changes. Backs
   * `SidePanelProps.storage` (keyed by panel id) and `ctx.storage.workspace`
   * (keyed by extension id).
   */
  extensionState: Record<string, Record<string, unknown>>;
}

/** What every {@link SharedPanelState} field starts as — spread into the store's
 * initial value, so a new field needs no separate edit there. */
export const DEFAULT_PANEL_STATE: SharedPanelState = {
  sideDockTrees: defaultTrees(),
  sidePanelLocations: {},
  sidePanelOrder: {},
  activeSidePanelTabs: {},
  sidePanelScrollPositions: {},
  sidePanelVisibility: {},
  extensionState: {},
};

/**
 * A workspace's complete panel state: the shared fields plus both layout
 * modes' collapse state. This is exactly the set of panel fields a workspace
 * record carries, which is what lets the record merge be a plain spread (see
 * `withActivePanelState`).
 */
export interface PanelStateSnapshot extends SharedPanelState {
  /**
   * This workspace's own side-dock widths, both layout modes' worth.
   *
   * Present only while {@link AppState.sharedColumnWidthsEnabled} is **off** —
   * with it on, widths are global and a record's copy is left frozen exactly as
   * ADR 0035 freezes a workspace's arrangement, so turning the flag back off
   * restores what the user last had. Absent on a workspace that has never been
   * width-customized, which then starts from whatever is live.
   */
  columnWidths?: ColumnWidthsByMode;
  /** The normal-width layout's collapse state... */
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  /** ...and small-screen mode's own. Absent until that mode has applied to
   * this workspace. */
  smallScreenCollapsed?: SideCollapseState;
}

/**
 * The shared "Global Side Panel Layout" record — the same arrangement fields
 * a workspace normally owns for itself (`PanelStateSnapshot`), minus the
 * fields that stay per-workspace even when the flag is on:
 * `activeSidePanelTabs` (has its own dependent opt-in, see
 * `globalActiveTabEnabled`), `sidePanelScrollPositions`, and `extensionState`
 * (a panel's own instance data, not its arrangement). Applies to both layout
 * modes, mirroring `PanelStateSnapshot`'s own normal/small-screen split — see
 * ADR 0035.
 */
export interface GlobalPanelLayout {
  /** Absent in an index written before RFC 0027 — `applyGlobalPanelLayout`
   * then derives the trees from `sidePanelLocations`, like a workspace record
   * that predates them. */
  sideDockTrees?: SideDockTrees;
  sidePanelLocations: Record<string, string>;
  sidePanelOrder: Record<string, number>;
  sidePanelVisibility: Record<string, boolean>;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  smallScreenCollapsed?: SideCollapseState;
}

/** What {@link GlobalPanelLayout} starts as before the flag has ever been
 * enabled. */
export const DEFAULT_GLOBAL_PANEL_LAYOUT: GlobalPanelLayout = {
  sideDockTrees: defaultTrees(),
  sidePanelLocations: {},
  sidePanelOrder: {},
  sidePanelVisibility: {},
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
};

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

/**
 * A named, user-authored recipe for starting a coding agent in a terminal
 * (RFC 0033). Host-owned global state. **Not** part of the public SDK surface
 * in phase 1 — it rides `@silo-code/extension-host/internal`; it becomes public
 * when `ctx.agents.profiles` does (phase 5).
 */
export interface AgentProfile {
  /**
   * Short, user-authored, editable, unique id matching `^[a-z0-9][a-z0-9-]*$`.
   * Prefilled by slugifying {@link AgentProfile.label}. This is the value a
   * human types at `silo agent run --profile <id>` (phase 2), which is why it
   * is chosen and editable rather than derived-from-the-label and frozen.
   */
  id: string;
  /** Shown in the `+` menu and the Profiles list. Freely editable. */
  label: string;
  /**
   * The shell command line, typed into the terminal's interactive shell
   * exactly as a user would type it — a **string**, not an argv array, so an
   * alias (`claude-work`), shell function, or version-manager shim resolves.
   * Silo launches agents by writing into an interactive login shell, never by
   * `exec`, and this field's type encodes that.
   */
  command: string;
  /**
   * Absolute path to an agent config directory, for agents that declare a
   * `configDirEnvVar`. `~` is expanded at save time, never at launch. Prefixed
   * onto the launch line as `<VAR>='<path>' <command>`.
   */
  configDir?: string;
  /**
   * Which sealed catalog agent the user *asserts* this launches — matched from
   * the command text, overridable in the editor. Named `assumed…` deliberately:
   * it is a user assertion, where `AgentInfo.agentId` is a proven observation
   * (ADR 0028). It selects the `+` menu icon and the config-dir variable and is
   * **never** written into `AgentInfo.agentId` or used to seed
   * `AgentInfo.isAgent`.
   */
  assumedAgentId?: string;
  /**
   * Marks this as the profile a launch that names none should use — the
   * generic `core.newAgent` command and a bare `silo agent run` (RFC 0033
   * phase 2). **At most one** profile carries it: {@link setDefaultAgentProfile}
   * clears it from every other in the same mutation. Set only by an explicit
   * gesture on the Profiles tab — never inferred, never assigned on first
   * creation or on delete of the current default (ADR 0046's converse).
   */
  default?: boolean;
}

export interface AppState extends SharedPanelState {
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
  /**
   * User-defined Agent Profiles (RFC 0033), in menu / settings-list order.
   * Global (not per-workspace) — the same list appears in every workspace.
   * Silo ships zero and writes none automatically; every entry is an explicit
   * user action. Persisted in the global index, not per-workspace. Hydrated
   * before extensions activate so the deprecated-`TerminalKind` mapping can
   * resolve against a populated list.
   */
  agentProfiles: AgentProfile[];
  /**
   * The **live** (on-screen) collapse state — small-screen mode's own layout
   * while it's active, the normal-width one otherwise. Which is which is
   * `smallScreenActive` below; the other mode's pair sits in
   * `inactiveModeCollapsed`. (A workspace record keys the same two pairs by
   * *mode* instead — see `PanelStateSnapshot`.)
   */
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
   * True while small-screen mode is actually applying — the feature is on *and*
   * the window is inside the small band. Ephemeral (re-derived from the window
   * width on launch), never persisted.
   *
   * It selects which of the **two layout modes** is on screen. Each side of the
   * app keeps both: `leftPanelCollapsed`/`rightPanelCollapsed` above are the
   * *live* pair and `inactiveModeCollapsed` below is the other one; the column
   * *widths* work the same way (`layout/column-widths.ts`). Switching
   * modes swaps them, so what the user does to the side columns on a narrow
   * window is remembered for the next narrow window and never disturbs the
   * normal-width layout.
   */
  smallScreenActive: boolean;
  /**
   * The collapse state of the layout mode that is *not* on screen: the
   * normal-width one while small-screen mode is active, the small-screen one
   * while it isn't. `null` when that mode has nothing recorded yet (a workspace
   * that has never been narrow). Swapped in on every mode change, loaded and
   * saved per-workspace alongside the live pair. Ephemeral itself — the
   * *persisted* copy is `WorkspaceInternal.smallScreenCollapsed`.
   */
  inactiveModeCollapsed: SideCollapseState | null;
  /**
   * True while a collapsed side panel is temporarily revealed by an edge-hover
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
   * either layout mode's column width, since it's a separate sizing the user
   * tunes by dragging the peek's own resize handle. Persisted in the global
   * index, like `smallScreenThresholdPx`. (The `smallScreen` prefix is
   * historical: peek started out small-screen-only and now works at any window
   * size — see `small-screen-mode.ts`.)
   */
  smallScreenPeekWidthLeftPx: number;
  smallScreenPeekWidthRightPx: number;
  /**
   * The live side-dock widths — the pair the on-screen layout mode is using,
   * plus the other mode's (see {@link ColumnWidthsByMode}). Seeded
   * synchronously from localStorage at store creation so the very first paint
   * already has the right columns; see `state/column-widths.ts`.
   */
  columnWidths: ColumnWidthsByMode;
  /**
   * Whether side-dock **widths** are shared across workspaces. On by default,
   * which is how widths have always behaved.
   *
   * Separate from {@link globalPanelLayoutEnabled}, and deliberately so: a
   * workspace that splits its right dock into two columns needs that dock much
   * wider, and forcing every other workspace to the same width to get it is the
   * whole reason this exists. Sharing the *arrangement* and not the widths (or
   * the reverse) are both coherent, so the two flags are independent.
   */
  sharedColumnWidthsEnabled: boolean;
  /**
   * "Global Side Panel Layout" (ADR 0035): opt-in, off by default. When true,
   * side-panel arrangement (`sidePanelLocations`/`sidePanelOrder`/
   * `sidePanelVisibility`/collapse, for both layout modes) is shared across
   * every workspace instead of per-workspace — the live fields above read
   * from and write to {@link globalPanelLayout} rather than being
   * captured/applied per workspace. Each workspace's own arrangement is
   * frozen (untouched) while this is on, and restored exactly when it's
   * turned back off. See `setGlobalPanelLayoutEnabled` in `workspaces.ts`.
   */
  globalPanelLayoutEnabled: boolean;
  /**
   * Dependent sub-setting of {@link globalPanelLayoutEnabled}: also share
   * `activeSidePanelTabs` globally (via {@link globalActiveSidePanelTabs}).
   * Meaningless while the main flag is off — the settings page disables its
   * control in that state — but its own stored value survives the main flag
   * being toggled off, so re-enabling brings it back as the user left it.
   * Off by default.
   */
  globalActiveTabEnabled: boolean;
  /** The shared arrangement itself, live while {@link globalPanelLayoutEnabled}
   * is on. Frozen (last known value) while it's off. */
  globalPanelLayout: GlobalPanelLayout;
  /** The shared active-tab-per-slot map, live while
   * {@link globalActiveTabEnabled} is on. */
  globalActiveSidePanelTabs: Record<string, string>;
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

/** Side-dock widths start out shared across workspaces — the only behavior
 * they had before the setting existed, so an upgrade changes nothing. */
export const DEFAULT_SHARED_COLUMN_WIDTHS = true;

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

/** What a workspace's small-screen layout starts as, the first time the window
 * is narrow: both side columns out of the way. From then on the workspace
 * remembers whatever the user leaves it in on a narrow window. */
export const DEFAULT_SMALL_SCREEN_COLLAPSE: SideCollapseState = {
  left: true,
  right: true,
};

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
  /**
   * Strip agent status markers (Claude's `◐`/`✳`, Codex's braille spinner and
   * `[ ! ]`, Cursor's ` - Working …` suffix) out of a terminal's title, so the
   * tab shows just the conversation name. The status itself is not lost — it's
   * what drives the tab's activity dot and the Workspaces status row, which is
   * exactly why repeating it as a glyph is noise. Off shows titles verbatim.
   *
   * A terminal-display setting, but surfaced on the **Agents** settings page,
   * since that's where a user looks for agent presentation. Applies to the tab
   * title and {@link TerminalRecord.title}; agent *detection* reads the raw OSC
   * stream and is unaffected either way.
   */
  hideAgentStatusGlyphs: boolean;
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
  hideAgentStatusGlyphs: true,
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
