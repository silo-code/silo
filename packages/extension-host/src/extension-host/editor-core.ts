import type { editor as MonacoEditor } from "monaco-editor";
import { store } from "../state/store";
import {
  findEditor,
  setEditorFilePath,
  setEditorScrollPosition,
  getEditorScrollPosition,
} from "../state/workspaces";
import {
  setEditorBackup,
  clearEditorBackup,
  readEditorBackup,
  resolveRestoredBuffer,
} from "../state/editor-backups";
import { getEditorSettings, setEditorSetting } from "../state/editor-settings";
import type {
  EditorSettings,
  RenderWhitespace,
  RenderLineHighlight,
} from "../state/types";
import { getDndService } from "./dnd-service";
import { getDiffContentProvider } from "./diff-content-providers";
import {
  defineMonacoThemes,
  monacoThemeName,
  hideBrokenSemanticActions,
  ensureMonaco,
} from "../docked/monaco-setup";
import { getThemeBase } from "../layout/presets";

// The shared core.editor implementation — one Monaco editor "core" that the text
// and diff modes both build on, so "same formatting, same context menu, same
// language detection" is true by construction instead of two parallel Monaco
// setups that drift (the diff viewer had silently diverged: it ignored editor
// settings and rewired its own options). This module lives in the service layer
// (NOT under builtin/**), so it's the one place allowed to reach the host
// internals (state / docked / layout / panels) the editor needs; the builtin
// text/diff/settings extensions consume *this* + `ctx`, which is what collapses
// their boundary suppressions. See ctx-domains.md → "The editor surface".
//
// The pure, Monaco-runtime-free half (language detection + settings → options)
// lives in editor-options.ts so it stays unit-testable; it's re-exported here so
// consumers have a single import.

export {
  EDITOR_FONT_FAMILY,
  languageFromPath,
  toTextEditorOptions,
  toDiffEditorOptions,
} from "./editor-options";

// Re-exported host seams the editor views consume through this single module
// (rather than each reaching into state/docked/layout/panels directly).
export {
  store,
  findEditor,
  setEditorFilePath,
  setEditorScrollPosition,
  getEditorScrollPosition,
  // Hot-exit backups: the text editor stashes/restores/clears unsaved buffers.
  setEditorBackup,
  clearEditorBackup,
  readEditorBackup,
  resolveRestoredBuffer,
  getEditorSettings,
  setEditorSetting,
  getDndService,
  monacoThemeName,
  getThemeBase,
  getDiffContentProvider,
  // The lazy Monaco bootstrap, re-exported through this seam so the editor
  // views reach it via @silo-code/extension-host/internal rather than a raw docked/ path.
  ensureMonaco,
};
export type { EditorSettings, RenderWhitespace, RenderLineHighlight };

/**
 * Shared Monaco onMount setup for both modes: register the app themes, apply the
 * active one, and strip the broken semantic-navigation context-menu actions
 * (Go to/Peek Definition, Rename, …) that can't work without a project-wide
 * language service. `editors` is one code editor (text) or the two inner editors
 * of a diff.
 */
export function setupMonacoEditor(
  monaco: typeof import("monaco-editor"),
  editors:
    | MonacoEditor.IStandaloneCodeEditor
    | MonacoEditor.IStandaloneCodeEditor[],
): void {
  defineMonacoThemes(monaco);
  monaco.editor.setTheme(monacoThemeName(getThemeBase(store.activeThemeId)));
  const list = Array.isArray(editors) ? editors : [editors];
  for (const ed of list) hideBrokenSemanticActions(ed);
}
