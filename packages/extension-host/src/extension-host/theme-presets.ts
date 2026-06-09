import { Registry } from "./registry";
import type { ThemePreset } from "@silo-code/sdk";

// Host registry of theme presets contributed via `ctx.registerThemePreset`.
// Core seeds nothing here — Dark and Light live in `layout/presets` (CORE_PRESETS)
// as the always-present fallback; the `theme-presets` built-in extension fills
// this with Tokyo Night / Solarized Light / Gruvbox Dark, and third-party
// extensions can add more. `ctx.theme` reads CORE_PRESETS + this registry.
export const themePresetRegistry = new Registry<ThemePreset>();
