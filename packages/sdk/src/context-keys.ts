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
  /** id of the viewer rendered by the dock's active panel, or null. */
  activeViewerId: string | null;
  /** editorId of the active dock panel if it's an editor panel, or null. */
  activeEditorId: string | null;
}
