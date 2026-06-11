import type { editor as MonacoEditor, KeyMod, KeyCode } from "monaco-editor";
import { toMonacoOptions } from "../state/editor-settings";
import type { EditorSettings } from "../state/types";

// The pure half of the shared editor core: language detection + the settings →
// Monaco construction-options mapping for both modes. Kept free of any runtime
// Monaco import (only the erased `import type`) so it's unit-testable without
// loading the editor in jsdom. editor-core.ts re-exports these alongside the
// Monaco-setup helpers that DO need the runtime editor.

/** Monaco font stack shared by both editor modes. */
export const EDITOR_FONT_FAMILY =
  'SF Mono, Menlo, Monaco, "JetBrains Mono", Consolas, monospace';

/**
 * Points added to the app-wide UI font size for the editor surface (text and
 * diff alike) — the editor renders a touch larger than chrome.
 */
const EDITOR_FONT_BOOST = 0.5;

/**
 * Monaco's default fold (`Cmd+Alt+[`) and unfold (`Cmd+Alt+]`) keybindings
 * collide with Silo's global side-dock toggles, which fire via native menu
 * accelerators on the same keys. When focus is in Monaco it consumes the
 * keystroke for folding (calling preventDefault) and the accelerator never
 * fires. Silo exposes no folding affordance, so we unbind both — passing
 * `command: null` to Monaco's `addKeybindingRules` removes a default — letting
 * the keystroke fall through to the native menu in every focus context. Bound
 * with `CtrlCmd|Alt` to match the `CmdOrCtrl+Alt` menu accelerator (so on
 * non-macOS platforms, where Monaco binds nothing to these combos, it's a
 * harmless no-op). Takes the runtime `KeyMod`/`KeyCode` enums as arguments so
 * the rule construction stays pure and unit-testable.
 */
export function foldUnbindRules(
  keyMod: typeof KeyMod,
  keyCode: typeof KeyCode,
): MonacoEditor.IKeybindingRule[] {
  return [
    {
      keybinding: keyMod.CtrlCmd | keyMod.Alt | keyCode.BracketLeft,
      command: null,
    },
    {
      keybinding: keyMod.CtrlCmd | keyMod.Alt | keyCode.BracketRight,
      command: null,
    },
  ];
}

/**
 * Map a file path to a Monaco language id. Deduplicated from the two
 * (previously identical) copies in TextViewer and DiffPanel — the single source
 * of truth for language detection across both modes.
 */
export function languageFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    rs: "rust",
    py: "python",
    go: "go",
    yml: "yaml",
    yaml: "yaml",
    toml: "ini",
    css: "css",
    html: "html",
    sh: "shell",
    sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

/**
 * The display/formatting options both modes share, derived from the global
 * editor settings plus the common font + layout. This is the "one core"; text
 * and diff differ only in what the builders below add on top.
 *
 * Font size is part of the shared base: text and diff render at the **same**
 * size (`uiFontSize + EDITOR_FONT_BOOST`). Diff used to render a half-point
 * smaller; that divergence is gone by construction (diff now matches text).
 */
function sharedOptions(
  settings: EditorSettings,
  uiFontSize: number,
): MonacoEditor.IEditorConstructionOptions {
  return {
    ...toMonacoOptions(settings),
    fontFamily: EDITOR_FONT_FAMILY,
    fontSize: uiFontSize + EDITOR_FONT_BOOST,
    scrollBeyondLastLine: false,
    automaticLayout: true,
  };
}

/** Construction options for the read-write text editor. */
export function toTextEditorOptions(
  settings: EditorSettings,
  uiFontSize: number,
): MonacoEditor.IStandaloneEditorConstructionOptions {
  return {
    ...sharedOptions(settings, uiFontSize),
    // Let file drags bubble to dockview's drop overlay instead of pasting text.
    dropIntoEditor: { enabled: false },
  };
}

/**
 * Construction options for the diff editor — the *same* shared core as text
 * (same settings-driven options AND the same font size), differing only in
 * being read-only and side-by-side.
 */
export function toDiffEditorOptions(
  settings: EditorSettings,
  uiFontSize: number,
): MonacoEditor.IDiffEditorConstructionOptions {
  return {
    ...sharedOptions(settings, uiFontSize),
    renderSideBySide: true,
    readOnly: true,
  };
}
