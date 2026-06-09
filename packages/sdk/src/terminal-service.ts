import type { TerminalKind, TerminalRecord } from "./domain-types";

// Re-export the terminal domain types so consumers can name them from the SDK.
export type { TerminalKind, TerminalRecord } from "./domain-types";

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
   */
  create(input?: CreateTerminalInput): TerminalRecord | undefined;
  /** Close and kill every terminal in a workspace (e.g. on workspace delete). */
  closeWorkspace(workspaceId: string): void;
}
