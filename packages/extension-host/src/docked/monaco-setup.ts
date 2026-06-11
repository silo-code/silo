// Bundle Monaco locally instead of letting @monaco-editor/react fetch it
// from a CDN at startup. Call ensureMonaco() before the first <Editor /> mounts.
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import type { ThemeBase } from "../state/types";
import { foldUnbindRules } from "../extension-host/editor-options";

type MonacoLike = typeof monaco;

let initialized = false;

export const DARK_THEME = "app-dark";
export const LIGHT_THEME = "app-light";

function readVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

const DARK_FALLBACKS = {
  editorBg: "#0f1115",
  bg1: "#161922",
  bg2: "#1c2030",
  bg3: "#232839",
  bgActive: "#313a55",
  text: "#e6e8ee",
  textFaint: "#414868",
  textDim: "#a4abbd",
  accent: "#7aa2f7",
  borderStrong: "#2b3148",
};

const LIGHT_FALLBACKS = {
  editorBg: "#ffffff",
  bg1: "#f3f3f3",
  bg2: "#ececec",
  bg3: "#e0e0e0",
  bgActive: "#add6ff",
  text: "#4a4a4a",
  textFaint: "#bbbbbb",
  textDim: "#9a9a9a",
  accent: "#0078d4",
  borderStrong: "#c8c8c8",
};

function buildTheme(mode: ThemeBase): monaco.editor.IStandaloneThemeData {
  const f = mode === "dark" ? DARK_FALLBACKS : LIGHT_FALLBACKS;
  const editorBg = readVar("--silo-content-editor-bg", f.editorBg);
  const bg1 = readVar("--silo-content-tab-tray-bg", f.bg1);
  const bg2 = readVar("--silo-color-bg-hover", f.bg2);
  const bg3 = readVar("--silo-color-button-bg", f.bg3);
  const bgActive = readVar("--silo-color-bg-active", f.bgActive);
  const text = readVar("--silo-content-text", f.text);
  const textFaint = readVar("--silo-content-editor-text-faint", f.textFaint);
  const textDim = readVar("--silo-content-editor-text-dim", f.textDim);
  const textHi = readVar("--silo-color-text-hi", f.textDim);
  const accent = readVar("--silo-color-accent", f.accent);
  const borderStrong = readVar("--silo-color-border-strong", f.borderStrong);
  // Selection is its own theme var, shared with the terminal. Falls back to the
  // legacy --silo-color-bg-active / --silo-color-button-bg so themes without it look unchanged.
  const selection = readVar("--silo-content-editor-selection", bgActive);
  const selectionInactive = readVar(
    "--silo-content-editor-selection-inactive",
    bg3,
  );

  return {
    base: mode === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": editorBg,
      "editor.foreground": text,
      "editorGutter.background": editorBg,
      "editorLineNumber.foreground": textFaint,
      "editorLineNumber.activeForeground": textDim,
      "editorCursor.foreground": accent,
      "editor.selectionBackground": selection,
      "editor.inactiveSelectionBackground": selectionInactive,
      "editor.lineHighlightBackground": bg1,
      "editorWidget.background": bg1,
      "editorWidget.border": borderStrong,
      "editorIndentGuide.background1": bg2,
      "editorIndentGuide.activeBackground1": borderStrong,
      "scrollbarSlider.background": `${bg3}55`,
      "scrollbarSlider.hoverBackground": `${bg2}99`,
      "scrollbarSlider.activeBackground": `${bgActive}cc`,
      // Context menu
      "menu.background": bg2,
      "menu.foreground": textHi,
      "menu.selectionBackground": bg3,
      "menu.selectionForeground": textHi,
      "menu.separatorBackground": borderStrong,
      "menu.border": borderStrong,
    },
  };
}

export function monacoThemeName(mode: ThemeBase): string {
  return mode === "dark" ? DARK_THEME : LIGHT_THEME;
}

/**
 * (Re)register both editor themes against a Monaco instance, reading current
 * CSS variable values. Call this whenever the active theme changes so
 * custom themes flow through to the editor.
 */
export function defineMonacoThemes(m: MonacoLike) {
  m.editor.defineTheme(DARK_THEME, buildTheme("dark"));
  m.editor.defineTheme(LIGHT_THEME, buildTheme("light"));
}

/**
 * Refresh Monaco theme definitions from the current CSS vars and re-apply
 * the active theme. Safe to call before any Editor is mounted (no-op if
 * Monaco hasn't been initialized).
 */
export function refreshMonacoThemes(mode: ThemeBase) {
  if (!initialized) return;
  defineMonacoThemes(monaco);
  monaco.editor.setTheme(monacoThemeName(mode));
}

// Built-in context-menu actions that need a language service to resolve
// symbols across the whole project. We load only the single open file into
// Monaco (no LSP), so these can never succeed — they'd just say "No definition
// found" or search one buffer. Strip them from the right-click menu until real
// language servers are wired up (see monaco-languageclient).
const BROKEN_SEMANTIC_ACTION_IDS = new Set([
  "editor.action.revealDefinition", // Go to Definition
  "editor.action.revealDefinitionAside", // Open Definition to the Side
  "editor.action.revealDeclaration", // Go to Declaration
  "editor.action.peekDefinition", // Peek Definition
  "editor.action.goToTypeDefinition", // Go to Type Definition
  "editor.action.peekTypeDefinition", // Peek Type Definition
  "editor.action.goToImplementation", // Go to Implementations
  "editor.action.peekImplementation", // Peek Implementations
  "editor.action.goToReferences", // Go to References
  "editor.action.referenceSearch.trigger", // Find/Peek All References
  "editor.action.rename", // Rename Symbol
]);

/**
 * Remove the semantic navigation actions from an editor's context menu. Monaco
 * exposes no public API for this, so we wrap the contextmenu contribution's
 * internal action collector and filter by id. Guarded so a future Monaco that
 * renames the internal method simply leaves the menu untouched rather than
 * throwing. Keybindings (F12, Shift+F12, F2) are intentionally left alone —
 * they just fail quietly and aren't a misleading menu affordance.
 */
export function hideBrokenSemanticActions(
  editor: monaco.editor.IStandaloneCodeEditor,
) {
  const contextmenu = editor.getContribution("editor.contrib.contextmenu") as {
    _getMenuActions?: (...args: unknown[]) => Array<{ id: string }>;
  } | null;
  if (!contextmenu?._getMenuActions) return;
  const original = contextmenu._getMenuActions.bind(contextmenu);
  contextmenu._getMenuActions = (...args: unknown[]) =>
    original(...args).filter((a) => !BROKEN_SEMANTIC_ACTION_IDS.has(a.id));
}

export function ensureMonaco(): MonacoLike {
  if (!initialized) {
    self.MonacoEnvironment = {
      getWorker(_workerId, label) {
        switch (label) {
          case "json":
            return new jsonWorker();
          case "css":
          case "scss":
          case "less":
            return new cssWorker();
          case "html":
          case "handlebars":
          case "razor":
            return new htmlWorker();
          case "typescript":
          case "javascript":
            return new tsWorker();
          default:
            return new editorWorker();
        }
      },
    };
    // This is a file editor, not an IDE: Monaco's TS worker can't resolve
    // node_modules types, sibling source files, or CSS imports from inside its
    // sandbox, so semantic checks produce bogus "Cannot find module / name"
    // errors on files that compile fine via Vite/tsc. Disable semantic
    // validation; keep syntax validation, which is legitimately useful. Syntax
    // checking only works correctly when each model has an extension-accurate
    // URI (so JSX is parsed as TSX rather than flagged as illegal tokens) —
    // TextViewer assigns those via the <Editor path> prop. (Revisit semantic
    // checks if we ever wire up real LSP servers; see monaco-languageclient.)
    const diagnostics = {
      noSemanticValidation: true,
      noSyntaxValidation: false,
    };
    // monaco.languages.typescript is deprecated in 0.55 (typed as a stub); the
    // language-service defaults now live on the top-level `typescript` namespace.
    monaco.typescript.typescriptDefaults.setDiagnosticsOptions(diagnostics);
    monaco.typescript.javascriptDefaults.setDiagnosticsOptions(diagnostics);
    // Drop Monaco's default fold/unfold keybindings on Cmd+Alt+[ / Cmd+Alt+] so
    // those keystrokes fall through to Silo's native menu accelerators that
    // toggle the side docks (see foldUnbindRules).
    monaco.editor.addKeybindingRules(
      foldUnbindRules(monaco.KeyMod, monaco.KeyCode),
    );
    defineMonacoThemes(monaco);
    loader.config({ monaco });
    initialized = true;
  }
  return monaco;
}
