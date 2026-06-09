// xterm.js color themes + a builder that binds them to the live CSS variables
// so the terminal canvas tracks the active app theme (built-in or custom).

const XTERM_DARK_THEME = {
  background: "#0f1115",
  foreground: "#e6e8ee",
  cursor: "#7aa2f7",
  selectionBackground: "#3a4263",
  selectionForeground: "#e6e8ee",
  selectionInactiveBackground: "#2b3148",
  black: "#1a1b26",
  red: "#f7768e",
  green: "#9ece6a",
  yellow: "#e0af68",
  blue: "#7aa2f7",
  magenta: "#bb9af7",
  cyan: "#7dcfff",
  white: "#c0caf5",
  brightBlack: "#414868",
  brightRed: "#ff7a93",
  brightGreen: "#b9f27c",
  brightYellow: "#ff9e64",
  brightBlue: "#7da6ff",
  brightMagenta: "#bb9af7",
  brightCyan: "#0db9d7",
  brightWhite: "#acb0d0",
};

const XTERM_LIGHT_THEME = {
  background: "#ffffff",
  foreground: "#4a4a4a",
  cursor: "#0078d4",
  selectionBackground: "#add6ff",
  selectionForeground: "#000000",
  selectionInactiveBackground: "#e5ebf1",
  black: "#000000",
  red: "#cd3131",
  green: "#0dbc79",
  yellow: "#949800",
  blue: "#0451a5",
  magenta: "#bc05bc",
  cyan: "#0598bc",
  white: "#555555",
  brightBlack: "#666666",
  brightRed: "#cd3131",
  brightGreen: "#14ce14",
  brightYellow: "#b5ba00",
  brightBlue: "#0451a5",
  brightMagenta: "#bc05bc",
  brightCyan: "#0598bc",
  brightWhite: "#a5a5a5",
};

function readCssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

export function xtermThemeFor(mode: "light" | "dark") {
  const palette = mode === "dark" ? XTERM_DARK_THEME : XTERM_LIGHT_THEME;
  // Mirror the Monaco editor's scrollbar slider colors (see monaco-setup.ts:
  // buildTheme) so the terminal and editor scrollbars are identical: slider =
  // --silo-color-button-bg @55, hover = --silo-color-bg-hover @99, active = --silo-color-bg-active @cc. Reading
  // the same CSS vars keeps it theme-aware (light/dark + custom themes).
  const sliderBgFallback = mode === "dark" ? "#232839" : "#e0e0e0";
  const sliderHoverFallback = mode === "dark" ? "#1c2030" : "#ececec";
  const sliderActiveFallback = mode === "dark" ? "#313a55" : "#add6ff";
  return {
    ...palette,
    // Bind to the live theme so xterm's canvas tracks --silo-content-terminal-bg (which
    // falls back to --bg-0). This keeps the canvas, the 6px padding gutter,
    // and any custom theme override in lockstep.
    background: readCssVar("--silo-content-terminal-bg", palette.background),
    foreground: readCssVar("--silo-content-text", palette.foreground),
    cursor: readCssVar("--silo-color-accent", palette.cursor),
    // Share the Monaco editor's selection theme vars (see monaco-setup.ts:
    // buildTheme) so a selection looks identical in the terminal and the editor,
    // custom themes included. Falls back to --silo-color-bg-active / --silo-color-button-bg for themes
    // saved before the dedicated selection vars existed.
    selectionBackground: readCssVar(
      "--silo-content-editor-selection",
      readCssVar("--silo-color-bg-active", palette.selectionBackground),
    ),
    selectionInactiveBackground: readCssVar(
      "--silo-content-editor-selection-inactive",
      readCssVar("--silo-color-button-bg", palette.selectionInactiveBackground),
    ),
    scrollbarSliderBackground: `${readCssVar("--silo-color-button-bg", sliderBgFallback)}55`,
    scrollbarSliderHoverBackground: `${readCssVar("--silo-color-bg-hover", sliderHoverFallback)}99`,
    scrollbarSliderActiveBackground: `${readCssVar("--silo-color-bg-active", sliderActiveFallback)}cc`,
  };
}
