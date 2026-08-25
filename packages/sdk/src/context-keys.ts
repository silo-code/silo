/**
 * Minimal context-keys store. Menu items, keybindings, and (later) view
 * contributions can declare `when` clauses that read these values; the host
 * re-evaluates the clauses whenever a key changes and updates UI state
 * (enabled/disabled menu items, etc.).
 *
 * Keys are added as needed. Start narrow: only the keys we have a real use
 * for. Avoid the temptation to mirror every piece of app state into here.
 *
 * @category Core Types
 * @public
 */
export interface ContextKeys {
  /**
   * The {@link Editor.id} of the presenter currently rendering the active dock
   * panel (e.g. `"core.text-editor"`, `"silo.markdown-preview"`), or `null`
   * when the active panel is not an editor. Identifies the *view type*, not the
   * tab instance — see {@link ContextKeys.activeEditorId} for the tab record id.
   */
  activeEditorViewId: string | null;
  /**
   * The `editorId` of the active editor tab record, or `null` when the active
   * dock panel is not an editor tab. Identifies the *tab instance* — see
   * {@link ContextKeys.activeEditorViewId} for the view-type (presenter) id.
   */
  activeEditorId: string | null;
  /**
   * @deprecated Use {@link ContextKeys.activeEditorViewId} instead.
   * Kept for one release so extensions compiled against the old SDK continue
   * to receive the correct value at runtime without a silent break.
   */
  activeViewerId: string | null;
  /**
   * True when an xterm textarea in a terminal panel owns DOM focus — the user
   * is typing into (or has just typed into) a terminal. Used to scope terminal-
   * local keybindings such as Clear (`cmd+k`).
   */
  terminalFocused: boolean;
}
