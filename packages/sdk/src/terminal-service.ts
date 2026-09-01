import type { Disposable } from "./types";
import type { MenuEntry } from "./ui-service";
import type { TerminalKind, TerminalRecord } from "./domain-types";
import type {
  TabAdornmentMethods,
  TabIndicatorContribution,
} from "./tab-adornment";

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
 * @deprecated Prefer {@link TerminalService.setIndicator} /
 * {@link TerminalService.bindIndicator}. Alias for a trailing indicator
 * contribution (no `id` — the provider id supplies it).
 *
 * @category Consumer Services
 * @public
 */
export type TerminalTabDecoration = TabIndicatorContribution;

/**
 * @deprecated Prefer {@link TerminalService.bindIndicator}. Terminal-only
 * trailing-indicator provider kept as a shim over the adornment registry.
 *
 * @category Consumer Services
 * @public
 */
export interface TerminalTabDecorationProvider {
  /** Unique id — conventionally `"<extension-id>.tab-decoration"`. */
  id: string;
  /**
   * Called synchronously for each terminal tab during render. Return `null`
   * to contribute nothing for this terminal.
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
  /**
   * Terminal kind. Defaults to `"shell"`.
   *
   * @deprecated Pass `"shell"` (or omit). The `"claude"` / `"pi"` values are
   * kept for compatibility (RFC 0033): they create a `"shell"` terminal and, if
   * a matching Agent Profile exists, launch it — otherwise the bare command is
   * typed. Start agents via an Agent Profile instead.
   */
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
 * workspace's terminals. {@link WorkspaceService.delete} calls `closeWorkspace`
 * for you; the primitive remains available for surgical reaping without
 * deleting the workspace. The tab itself is rendered by the core dock from the
 * workspace's terminal records.
 *
 * Tab chrome adornments (`setIcon` / `setIndicator` / …) take a **terminal
 * session id** as the target — see {@link TabAdornmentMethods}.
 *
 * @category Consumer Services
 * @public
 */
export interface TerminalService extends TabAdornmentMethods {
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
  /**
   * Close and kill every terminal in a workspace. {@link WorkspaceService.delete}
   * reaps terminals the same way automatically, so this is for reaping a
   * workspace's terminals surgically, without deleting the workspace itself.
   */
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
  /**
   * The rows of this terminal's tab context menu — **Rename…**, then whatever
   * extensions contributed on the `"terminal/tab"`
   * {@link MenuSurface | surface}.
   *
   * Use it when your own UI lists terminals (an agent list, a session picker)
   * so right-clicking a row offers the same actions as right-clicking the tab,
   * contributions included, instead of a menu that drifts from it. Returns an
   * empty array for a terminal no workspace owns.
   *
   * @example
   * ```ts
   * ctx.ui.showMenu({
   *   items: [
   *     { label: "Mark as seen", run: () => ctx.agents.acknowledge(id) },
   *     { type: "separator" },
   *     ...ctx.terminals.getTabMenuItems(id),
   *   ],
   *   at: { x: e.clientX, y: e.clientY },
   * });
   * ```
   */
  getTabMenuItems(terminalId: string): MenuEntry[];

  focus(terminalId: string): void;

  /**
   * @deprecated Prefer {@link TerminalService.bindIndicator}. Thin shim that
   * registers a trailing-indicator binder for terminal tabs only.
   */
  registerTabDecoration(provider: TerminalTabDecorationProvider): Disposable;

  /**
   * @deprecated Prefer {@link TerminalService.getIndicators}. Returns the first
   * trailing indicator for a terminal tab, or `null`.
   */
  getTabDecoration(terminalId: string): TerminalTabDecoration | null;

  /**
   * @deprecated Prefer {@link TerminalService.invalidateTabAdornments}.
   */
  invalidateTabDecorations(): void;

  /**
   * @deprecated Prefer {@link TerminalService.subscribeTabAdornments}.
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
   * // Detect Claude Code busy/idle state from OSC 0 title sequences: it
   * // prefixes the title with an animated spinner glyph while busy, and with
   * // the idle char below when awaiting input. Accept both spinner ranges —
   * // current builds animate the half-filled circles ◐/◑, older ones used
   * // braille (which Codex CLI still does).
   * const SPINNERS = [
   *   [0x25d0, 0x25d3], // ◐ ◑ ◒ ◓
   *   [0x2800, 0x28ff], // ⠋ ⠙ ⠏ …
   * ];
   * const IDLE_CHAR     = '\u2733'; // ✳
   *
   * const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
   *   if (code !== 0) return;
   *   const first = payload.charCodeAt(0);
   *   const spinning = SPINNERS.some(([lo, hi]) => first >= lo && first <= hi);
   *   if (spinning)                           setStatus('busy');
   *   else if (payload.startsWith(IDLE_CHAR)) setStatus('idle');
   * });
   * ctx.subscriptions.push(sub);
   * ```
   */
  subscribeOsc(
    terminalId: string,
    handler: (event: OscEvent) => void,
  ): Disposable;

  /**
   * Subscribe to the raw PTY output stream of the terminal identified by
   * `terminalId`. The `handler` is called with every chunk of bytes the PTY
   * produces — including ANSI escape sequences, OSC sequences, and all other
   * control characters — exactly as they arrive, with no parsing or filtering.
   *
   * This fires even when the terminal's panel is not visible, so it is suitable
   * for background monitoring (e.g. detecting output activity to confirm an
   * agent is still running). Keep handlers lightweight: they execute
   * synchronously on every PTY chunk, which can be multiple times per second
   * while a program is active.
   *
   * The subscription is keyed to the **terminal record id** (e.g. `"term_…"`),
   * not the underlying PTY session id, so it survives terminal recreation within
   * the same record.
   *
   * Returns a {@link Disposable} that cancels the subscription.
   *
   * @example
   * ```ts
   * // Track the last time any output arrived to confirm agent activity.
   * let lastOutputAt = 0;
   * const sub = ctx.terminals.subscribeOutput(terminalId, () => {
   *   lastOutputAt = Date.now();
   * });
   * ctx.subscriptions.push(sub);
   * ```
   */
  subscribeOutput(
    terminalId: string,
    handler: (data: string) => void,
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
