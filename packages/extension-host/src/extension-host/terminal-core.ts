// The host seam the terminal DockKind view consumes — mirroring `editor-core.ts`
// for the editor views — surfaced to the `core.terminal` extension through
// `@silo-code/extension-host/internal`. The terminal is a core feature (a built-in DockKind like
// the editor), so it reaches its genuinely host-only bits — recreating a
// terminal record and the theme-base lookup for the xterm palette — here rather
// than into `state/` / `layout/` directly. The shared `store` is reached through
// the editor-core re-export on the internal barrel, and drag-and-drop through
// the public `ctx.dnd`.

export { recreateTerminal } from "../state/workspaces";
export { tauriTerminalClient } from "../services/tauri-terminal-client";
export { getThemeBase } from "../layout/presets";
// Global terminal preferences (the breadcrumb toggle today) — read/written by
// the terminal panel and its settings page.
export {
  getTerminalSettings,
  setTerminalSetting,
} from "../state/terminal-settings";
export type { TerminalSettings, TerminalCursorStyle } from "../state/types";
