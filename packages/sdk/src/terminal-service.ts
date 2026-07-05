import type React from "react";
import type { Disposable } from "./types";
import type { TerminalKind, TerminalRecord } from "./domain-types";

/**
 * A parsed OSC (Operating System Command) escape sequence emitted by a
 * terminal program. Delivered by {@link TerminalService.subscribeOsc}.
 *
 * Common codes:
 * - `0` — set window/tab title (e.g. Claude Code encodes busy/idle state here)
 * - `7` — working directory (`file://host/path`)
 * - `9` — iTerm2 notifications (attention, progress)
 * - `133` — shell prompt markers (semantic shell integration)
 *
 * @category Consumer Services
 * @public
 */
export interface OscEvent {
  /** The numeric OSC code (the integer before the first semicolon). */
  code: number;
  /** The raw payload string after the code and its separating semicolon. */
  payload: string;
}

// Re-export the terminal domain types so consumers can name them from the SDK.
export type { TerminalKind, TerminalRecord } from "./domain-types";

/**
 * A decoration that an extension can attach to a terminal tab — a small icon
 * with an optional tooltip and semantic color. Registered via
 * {@link TerminalService.registerTabDecoration}.
 *
 * @category Consumer Services
 * @public
 */
export interface TerminalTabDecoration {
  /**
   * Small React node rendered as a decoration badge on the tab (≤16 px).
   * The extension supplies the shape; the host applies `color` via a CSS
   * data attribute mapped to design tokens.
   */
  icon: React.ReactNode;
  /** Tooltip shown when hovering the decoration icon. */
  tooltip?: string;
  /**
   * Semantic color applied to the icon element. The host maps this to the
   * matching `--silo-color-*` design token so themes control the exact shade.
   */
  color?: "accent" | "warn" | "ok" | "error" | "muted";
}

/**
 * A decoration provider for terminal tabs. Register via
 * {@link TerminalService.registerTabDecoration}.
 *
 * @category Consumer Services
 * @public
 */
export interface TerminalTabDecorationProvider {
  /** Unique id — conventionally `"<extension-id>.tab-decoration"`. */
  id: string;
  /**
   * Called synchronously for each terminal tab during render. Return `null`
   * to contribute nothing for this terminal. When multiple providers are
   * registered, the first non-null result wins.
   */
  provide(terminalId: string): TerminalTabDecoration | null;
}

/**
 * Input for {@link TerminalService.create}.
 *
 * @category Consumer Services
 * @public
 */
export interface CreateTerminalInput {
  /** Terminal kind — `"shell"` (default), `"claude"`, or `"pi"`. */
  kind?: TerminalKind;
  /** Working directory; falls back to the workspace folder when absent. */
  cwd?: string;
  /** Target workspace; defaults to the active workspace. */
  workspaceId?: string;
}

/**
 * Consumer API for the terminal domain, exposed as
 * {@link ExtensionContext.terminals}. The terminal is a core feature — a
 * built-in DockKind like the editor — so this mirrors {@link EditorService}:
 * `create` opens a terminal tab in a workspace, and `closeWorkspace` reaps a
 * workspace's terminals (used when a workspace is deleted). The tab itself is
 * rendered by the core dock from the workspace's terminal records.
 *
 * @category Consumer Services
 * @public
 */
export interface TerminalService {
  /**
   * Open a new terminal in a workspace (defaults to the active one). Returns the
   * created {@link TerminalRecord}; the PTY session spawns lazily when its tab
   * mounts.
   *
   * Returns `undefined` only when `input.workspaceId` is not given and there is
   * no active workspace at the time of the call — in normal use this does not
   * happen because activating any workspace happens before extensions run.
   */
  create(input?: CreateTerminalInput): TerminalRecord | undefined;
  /** Close and kill every terminal in a workspace (e.g. on workspace delete). */
  closeWorkspace(workspaceId: string): void;

  /**
   * Write text to a terminal's PTY as if the user typed it. By default a
   * carriage return is appended so the line executes; pass `addNewline: false`
   * to stage text without running it.
   *
   * Works even if the terminal tab has never been shown: the PTY spawns lazily
   * on first mount, and `sendText` force-spawns it on demand (a later mount then
   * attaches to that same session). No-op for an unknown `terminalId`.
   *
   * @param terminalId - The {@link TerminalRecord.id} to write to.
   * @param text - The text to send.
   * @param addNewline - Append a carriage return to execute. Defaults to `true`.
   *
   * @example
   * ```ts
   * const term = ctx.terminals.create({ cwd: workspaceFolder });
   * if (term) ctx.terminals.sendText(term.id, "npm run build");
   * ```
   */
  sendText(terminalId: string, text: string, addNewline?: boolean): void;

  /**
   * Close one terminal tab and kill its PTY session. No-op if the id is unknown.
   * To reap every terminal in a workspace at once use
   * {@link TerminalService.closeWorkspace}.
   */
  close(terminalId: string): void;

  /**
   * Set a terminal's user-facing name ({@link TerminalRecord.customName}),
   * shown on its tab and persisted across restarts. Passing an empty string
   * clears the custom name, letting the PTY-derived title take over again.
   * No-op for an unknown `terminalId`.
   */
  rename(terminalId: string, name: string): void;

  /**
   * Switch to the workspace containing this terminal and activate its tab in
   * the center dock. No-ops if the terminal id is unknown.
   */
  focus(terminalId: string): void;

  /**
   * Register a decoration provider for terminal tabs. The first registered
   * provider that returns a non-null decoration for a terminal wins; subsequent
   * providers are not consulted. Returns a {@link Disposable} that unregisters
   * the provider.
   */
  registerTabDecoration(provider: TerminalTabDecorationProvider): Disposable;

  /**
   * Get the current decoration for a terminal tab. Returns the first non-null
   * result from registered providers, or `null` if none apply.
   */
  getTabDecoration(terminalId: string): TerminalTabDecoration | null;

  /**
   * Signal that tab decoration data has changed. Fires all listeners registered
   * via {@link TerminalService.subscribeTabDecorations}, causing terminal tabs
   * to re-query providers and re-render their decoration.
   */
  invalidateTabDecorations(): void;

  /**
   * Subscribe to tab decoration invalidations. Returns a {@link Disposable}
   * that cancels the subscription.
   */
  subscribeTabDecorations(listener: () => void): Disposable;

  /**
   * Subscribe to raw OSC (Operating System Command) escape sequences emitted
   * by the terminal identified by `terminalId`. The handler is called once per
   * parsed sequence — regardless of whether the terminal's panel is currently
   * visible — making it suitable for background status monitoring.
   *
   * The subscription is keyed to the **terminal record id** (e.g.
   * `"term_…"`), not the underlying PTY session id, so it survives terminal
   * recreation within the same record.
   *
   * Returns a {@link Disposable} that cancels the subscription.
   *
   * @example
   * ```ts
   * // Detect Claude Code busy/idle state from OSC 0 title sequences.
   * const BRAILLE_START = 0x2800;
   * const BRAILLE_END   = 0x28FF;
   * const IDLE_CHAR     = '\u2733'; // ✳
   *
   * const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
   *   if (code !== 0) return;
   *   const first = payload.charCodeAt(0);
   *   if (first >= BRAILLE_START && first <= BRAILLE_END) setStatus('busy');
   *   else if (payload.startsWith(IDLE_CHAR))              setStatus('idle');
   * });
   * ctx.subscriptions.push(sub);
   * ```
   */
  subscribeOsc(
    terminalId: string,
    handler: (event: OscEvent) => void,
  ): Disposable;

  /**
   * The record id of the terminal tab that is currently active in the active
   * workspace's center dock, or `null` when an editor tab (or nothing) is
   * active. "Active" is the dock's single active panel — the tab the user is
   * looking at and typing into — so a terminal merely visible in a non-active
   * split does not count.
   */
  getActive(): string | null;

  /**
   * Subscribe to active-terminal changes. The listener receives the terminal
   * record id whenever a terminal tab becomes the active center-dock panel,
   * and `null` when activation moves elsewhere (an editor tab, or no panel —
   * including transiently during a workspace switch, before the incoming
   * workspace's active tab is published).
   *
   * Fires on tab activation, group activation, and workspace switches.
   * Returns a {@link Disposable} that cancels the subscription.
   *
   * @example
   * ```ts
   * // Clear a "needs attention" marker once the user views the terminal.
   * ctx.subscriptions.push(
   *   ctx.terminals.subscribeActive((terminalId) => {
   *     if (terminalId) attention.delete(terminalId);
   *   }),
   * );
   * ```
   */
  subscribeActive(listener: (terminalId: string | null) => void): Disposable;
}
