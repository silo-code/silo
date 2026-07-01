import type { ThemePreset } from "@silo-code/sdk";

// Core ships only Dark and Light — the always-present fallback. Their palettes
// live entirely in `theme.css` (`:root` / `[data-theme]`), so their `vars` are
// empty (the injector adds nothing and those rules apply). Every other built-in
// preset (Tokyo Night, Solarized Light, Gruvbox Dark, …) is contributed by the
// `theme-presets` extension via `ctx.registerThemePreset` and lives in the
// themePresetRegistry, not here.
export const CORE_PRESETS: ThemePreset[] = [
  {
    id: "dark",
    name: "Dark",
    base: "dark",
    colorScheme: "dark",
    vars: {
      "--silo-color-text-hi": "#818181",
      "--silo-color-bg-active": "#282d3a",
      "--silo-color-text-lo": "#575757",
      "--silo-color-border": "#222222",
    },
  },
  {
    id: "light",
    name: "Light",
    base: "light",
    colorScheme: "light",
    vars: {},
  },
];

/** Derive dark/light base from an activeThemeId.
 *  Core presets resolve directly; registered presets and custom themes resolve
 *  via the `data-theme` attribute ThemeInjector keeps in sync. */
export function getThemeBase(activeThemeId: string): "dark" | "light" {
  const preset = CORE_PRESETS.find((p) => p.id === activeThemeId);
  if (preset) return preset.base;
  // For registered presets and custom themes, ThemeInjector keeps data-theme
  // in sync with the resolved base.
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}
