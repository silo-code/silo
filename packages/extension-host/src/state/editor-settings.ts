import type { editor as MonacoEditor } from "monaco-editor";
import { store } from "./store";
import {
  getEditorSettingOverride,
  setEditorSettingOverride,
} from "./workspaces";
import type { EditorSettings, EditorSettingsOverride } from "./types";

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
 * Overlay a tab's local override (if any) onto the global settings — pure, so
 * it's unit-testable without touching the store. Absent override keys fall
 * through to `base`.
 */
export function mergeEditorSettings(
  base: EditorSettings,
  override: EditorSettingsOverride | undefined,
): EditorSettings {
  return { ...base, ...override };
}

/**
 * Flip one tab's word-wrap/minimap override relative to its *effective*
 * current value (global setting overlaid by any existing override) — not the
 * global value — so toggling always does what the menu label just showed.
 */
export function toggleEditorViewOption(
  workspaceId: string,
  editorId: string,
  key: keyof EditorSettingsOverride,
): void {
  const effective = mergeEditorSettings(
    getEditorSettings(),
    getEditorSettingOverride(workspaceId, editorId),
  );
  setEditorSettingOverride(workspaceId, editorId, key, !effective[key]);
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
