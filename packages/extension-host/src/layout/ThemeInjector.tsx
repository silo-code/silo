import { useEffect, useSyncExternalStore } from "react";
import { useSnapshot } from "valtio";
import { store } from "../state/store";
import type { CustomTheme, ThemeBase, ThemeVars } from "../state/types";
import { CORE_PRESETS } from "./presets";
import { themePresetRegistry } from "../extension-host/theme-presets";
import { refreshMonacoThemes } from "../docked/monaco-setup";

interface ResolvedTheme {
  base: "dark" | "light";
  colorScheme: "dark" | "light";
  vars: Partial<ThemeVars>;
}

// Last-painted theme cache, written by the injector and read by the no-flash
// script in index.html. Used as the resolution fallback so an active theme whose
// preset isn't (yet) registered — late, disabled, or future lazy load — keeps the
// painted colors instead of flashing back to defaults.
function readCachedTheme(): ResolvedTheme {
  try {
    const raw = localStorage.getItem("app-theme");
    if (raw) {
      const t = JSON.parse(raw) as {
        base?: ThemeBase;
        vars?: Partial<ThemeVars>;
      };
      const base = t.base === "light" ? "light" : "dark";
      return { base, colorScheme: base, vars: t.vars ?? {} };
    }
  } catch {
    // ignore a malformed cache
  }
  return { base: "dark", colorScheme: "dark", vars: {} };
}

export function getThemeSnapshot(
  customThemes: CustomTheme[],
  activeThemeId: string,
): ResolvedTheme {
  // Core Dark/Light, then registered presets, then the user's custom themes.
  const preset =
    CORE_PRESETS.find((p) => p.id === activeThemeId) ??
    themePresetRegistry.get(activeThemeId);
  if (preset) {
    return {
      base: preset.base,
      colorScheme: preset.colorScheme,
      vars: preset.vars,
    };
  }
  const custom = customThemes.find((t) => t.id === activeThemeId);
  if (custom) {
    return {
      base: custom.base,
      colorScheme: custom.colorScheme,
      vars: custom.vars,
    };
  }
  // Unresolved (preset not registered yet / disabled): hold the cached colors.
  return readCachedTheme();
}

export function ThemeInjector() {
  const snap = useSnapshot(store);
  const { activeThemeId, uiFontSize, customThemes } = snap;

  // Re-resolve when the set of registered presets changes — so an active theme
  // whose preset registers after first render (or is enabled/disabled later)
  // gets its vars injected. registry.list() returns a stable ref between
  // mutations, so this only changes when presets actually change.
  const presetList = useSyncExternalStore(
    (cb) => {
      const sub = themePresetRegistry.onChange(cb);
      return () => sub.dispose();
    },
    () => themePresetRegistry.list(),
  );

  useEffect(() => {
    // Remove the pre-mount no-flash style once React has taken over
    document.getElementById("theme-pre")?.remove();
  }, []);

  useEffect(() => {
    const resolved = getThemeSnapshot(
      customThemes as CustomTheme[],
      activeThemeId,
    );

    document.documentElement.setAttribute("data-theme", resolved.base);
    document.documentElement.setAttribute(
      "data-color-scheme",
      resolved.colorScheme,
    );

    const existingStyle = document.getElementById("custom-theme-vars");
    const varsEntries = Object.entries(resolved.vars) as [string, string][];

    if (varsEntries.length > 0) {
      const cssText = `:root{${varsEntries.map(([k, v]) => `${k}:${v}`).join(";")}}`;
      if (existingStyle) {
        existingStyle.textContent = cssText;
      } else {
        const style = document.createElement("style");
        style.id = "custom-theme-vars";
        style.textContent = cssText;
        document.head.appendChild(style);
      }
    } else {
      existingStyle?.remove();
    }

    localStorage.setItem(
      "app-theme",
      JSON.stringify({ base: resolved.base, vars: resolved.vars }),
    );

    // Defer Monaco refresh so the CSS var update lands first; readVar() in
    // monaco-setup reads computed styles synchronously.
    queueMicrotask(() => refreshMonacoThemes(resolved.base));
  }, [activeThemeId, customThemes, presetList]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--silo-font-size-base",
      `${uiFontSize}px`,
    );
  }, [uiFontSize]);

  return null;
}
