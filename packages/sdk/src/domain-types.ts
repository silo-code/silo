/**
 * Public domain types shared across the `ctx` services. These describe the
 * persisted, user-facing shapes an extension sees through the consumer services
 * (e.g. {@link WorkspaceService}, {@link TerminalService}, {@link ThemeService}).
 * The host's internal state module re-exports these so app code names a single
 * source of truth.
 *
 * @packageDocumentation
 */

/**
 * The kind of a terminal session.
 *
 * @category Core Types
 * @public
 */
export type TerminalKind = "shell" | "claude" | "pi";

/**
 * A terminal tab record in a workspace.
 *
 * @category Core Types
 * @public
 */
export interface TerminalRecord {
  id: string;
  sessionId: string;
  kind: TerminalKind;
  title: string;
  /**
   * A user-assigned name (via the tab's "Rename…" menu). When set, it wins over
   * the PTY-derived {@link TerminalRecord.title} and stays put until the user
   * renames again or the terminal is closed. Cleared by renaming to an empty
   * string, which hands the title back to PTY auto-derivation.
   */
  customName?: string;
  /** Working directory override. Falls back to ws.folder when absent. */
  cwd?: string;
  /** ISO timestamp of the last output we observed; used to pick a workspace's "primary" terminal. */
  lastActiveAt?: string;
}

/**
 * The two modes of the one editor surface: a read-write text editor, or a
 * read-only two-model diff. Absent on a record means `"text"`.
 *
 * @category Core Types
 * @public
 */
export type EditorMode = "text" | "diff";

/**
 * An editor tab record in a workspace — a text editor or a diff.
 *
 * @category Core Types
 * @public
 */
export interface EditorRecord {
  id: string;
  /** null for an untitled buffer that hasn't been saved yet. */
  filePath: string | null;
  title: string;
  /** When true, the tab is a temporary preview that gets replaced by the next single-click open. */
  isPreview?: boolean;
  /**
   * Which mode this record renders in. Absent ⇒ `"text"`. A `"diff"` record
   * additionally carries {@link EditorRecord.providerId}/{@link EditorRecord.args}
   * and always has a non-null `filePath`.
   */
  mode?: EditorMode;
  /**
   * Diff mode only: which registered diff-content provider resolves the two
   * sides (e.g. "silo.git"). The diff is content-agnostic — the provider owns
   * what the two sides contain.
   */
  providerId?: string;
  /**
   * Diff mode only: serializable args the provider needs to (re)compute content
   * on mount / restart.
   */
  args?: Record<string, unknown>;
  /**
   * The chosen editor *view* for this tab, referencing an {@link Editor.id}
   * (e.g. `"text"`, `"silo.markdown-preview"`). Absent ⇒ the host renders the
   * highest-priority matching editor (the default). Honored only when the
   * referenced editor is still registered **and** still matches the file;
   * otherwise the host falls back to priority resolution (so a stale value left
   * by an uninstalled extension never breaks the tab). Orthogonal to
   * {@link EditorRecord.mode}: `viewType` selects among `"text"`-mode editors; a
   * `"diff"` record ignores it.
   */
  viewType?: string;
}

/**
 * Which slot a side panel renders in.
 *
 * @category Core Types
 * @public
 */
export type SidePanelSlot = "left" | "right" | "left-bottom" | "right-bottom";

/**
 * A workspace — the unit Silo switches between, keeping its terminals, editors,
 * and layout alive. Read via {@link WorkspaceService}.
 *
 * This is the public surface: it carries the fields an extension needs to read
 * (name, folder, open tabs). Layout, scroll, and panel-state fields are
 * host-internal (`WorkspaceInternal` in `@silo-code/extension-host`) and are
 * intentionally absent here.
 *
 * @category Core Types
 * @public
 */
export interface Workspace {
  id: string;
  name: string;
  folder: string;
  /** Additional folders beyond the primary one. */
  extraFolders?: string[];
  createdAt: string;
  lastOpenedAt: string;
  /**
   * ISO timestamp of when the workspace was soft-closed, or null/undefined
   * if the workspace is open. Closed workspaces are hidden from the main
   * list and surfaced in a "reopen" picker.
   */
  closedAt?: string | null;
  terminals: readonly TerminalRecord[];
  /** Editor tabs — text editors and diffs alike (a diff is a record with `mode: "diff"`). */
  editors: readonly EditorRecord[];
}

/**
 * Light or dark theme base.
 *
 * @category Core Types
 * @public
 */
export type ThemeBase = "dark" | "light";

/**
 * The full theme-override surface, in type form: every `--silo-*` token a theme
 * preset's `vars` may recolor. Per the theming contract it spans **the design
 * tokens' generic colors + font families** _and_ **all the component tokens**.
 * The keys are the literal CSS custom-property names; renaming a key here
 * renames the token in `theme.css` in lockstep. Font-sizes and the radius scale
 * are intentionally absent (not theme-overridable).
 *
 * @see docs/architecture-audit/theming-contract.md
 * @category Core Types
 * @public
 */
export interface ThemeVars {
  // ── Design tokens — generic colors (also consumable by extensions) ──
  "--silo-color-bg": string;
  "--silo-color-bg-hover": string;
  "--silo-color-bg-active": string;
  "--silo-color-text": string;
  "--silo-color-text-hi": string;
  "--silo-color-text-lo": string;
  "--silo-color-accent": string;
  "--silo-color-accent-2": string;
  "--silo-color-border": string;
  "--silo-color-border-strong": string;
  "--silo-color-ok": string;
  "--silo-color-warn": string;
  "--silo-color-err": string;
  "--silo-color-input-bg": string;
  "--silo-color-input-text": string;
  "--silo-color-button-bg": string;
  "--silo-color-button-text": string;
  // ── Design tokens — toolbar surface (panel header bars) ──
  "--silo-color-toolbar-bg": string;
  "--silo-color-toolbar-text": string;
  "--silo-color-toolbar-text-disabled": string;
  "--silo-color-toolbar-input-bg": string;
  // ── Design tokens — content viewport surface (editor, terminal, viewer panels) ──
  "--silo-color-content-bg": string;
  "--silo-color-content-text": string;
  // ── Design tokens — font families ──
  "--silo-font-ui"?: string;
  "--silo-font-mono"?: string;
  // ── Component tokens — content (editor / terminal / tabs) colors ──
  "--silo-content-text": string;
  "--silo-content-terminal-bg": string;
  "--silo-content-editor-bg": string;
  "--silo-content-editor-selection": string;
  "--silo-content-editor-selection-inactive": string;
  "--silo-content-editor-text-dim": string;
  "--silo-content-editor-text-faint": string;
  "--silo-content-tab-bg": string;
  "--silo-content-tab-tray-bg": string;
  "--silo-content-tab-tray-text": string;
  "--silo-content-tab-text": string;
  "--silo-content-tab-text-inactive": string;
  "--silo-content-tab-text-active": string;
  // ── Component tokens — status bar colors ──
  "--silo-statusbar-bg": string;
  "--silo-statusbar-text": string;
  "--silo-statusbar-bg-hover": string;
  // ── Component tokens — side-tab colors ──
  "--silo-tab-text": string;
  "--silo-tab-text-active": string;
  "--silo-tab-bg-hover": string;
  "--silo-tab-border-active": string;
  // ── Component tokens — menu / dropdown colors (the host <Menu> primitive) ──
  "--silo-menu-bg": string;
  "--silo-menu-text": string;
  "--silo-menu-item-hover-bg": string;
  "--silo-menu-border": string;
  // ── Component tokens — modal shell (ctx.ui.confirm/prompt + the host Modal) ──
  "--silo-modal-bg": string;
  "--silo-modal-border": string;
  // ── Component tokens — notify (toast) surface (ctx.ui.notify) ──
  "--silo-notify-bg": string;
  "--silo-notify-text": string;
  "--silo-notify-text-hi": string;
  // ── Design tokens — list row treatment (hover/selection surfaces) ──
  "--silo-list-radius": string;
  "--silo-list-inset": string;
  "--silo-list-hover-bg": string;
  "--silo-list-active-bg": string;
  /** Selected-row outline — use a bordered selection instead of (or with) a fill. */
  "--silo-list-active-outline": string;
}

/**
 * A persisted custom theme.
 *
 * @category Core Types
 * @public
 */
export interface CustomTheme {
  id: string;
  /**
   * `2` since the `--silo-*` token rename (theming-contract.md › Migration).
   * v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).
   */
  version: 2;
  name: string;
  base: ThemeBase;
  colorScheme: "dark" | "light";
  vars: Partial<ThemeVars>;
}

/**
 * A {@link CustomTheme} without its `id` — the shape exported/imported as a
 * shareable theme file.
 *
 * @category Core Types
 * @public
 */
export type ThemeExport = Omit<CustomTheme, "id">;
