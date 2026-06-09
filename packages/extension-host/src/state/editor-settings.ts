import type { editor as MonacoEditor } from "monaco-editor";
import { store } from "./store";
import type { EditorSettings } from "./types";

/**
 * Resolve the effective editor settings.
 *
 * Today this is just the global tier (`store.editorSettings`). It exists as the
 * single read path on purpose: a future per-workspace bag and/or project config
 * (.editorconfig, .prettierrc) can be merged here — `getEditorSettings(wsId)` —
 * without changing any call site. See EditorSettings in state/types.ts.
 */
export function getEditorSettings(): EditorSettings {
  return store.editorSettings;
}

/** Update a single global editor setting. */
export function setEditorSetting<K extends keyof EditorSettings>(
  key: K,
  value: EditorSettings[K],
): void {
  store.editorSettings[key] = value;
}

/**
 * Map resolved settings onto the subset of Monaco construction options they
 * control. Options the editor sets unconditionally (font, layout, drop
 * handling) stay in TextViewer and are spread alongside this.
 */
export function toMonacoOptions(
  s: EditorSettings,
): MonacoEditor.IStandaloneEditorConstructionOptions {
  return {
    tabSize: s.tabSize,
    insertSpaces: s.insertSpaces,
    wordWrap: s.wordWrap ? "on" : "off",
    minimap: { enabled: s.minimap },
    renderWhitespace: s.renderWhitespace,
    renderLineHighlight: s.renderLineHighlight,
    smoothScrolling: s.smoothScrolling,
    formatOnType: s.formatOnType,
    formatOnPaste: s.formatOnPaste,
  };
}
