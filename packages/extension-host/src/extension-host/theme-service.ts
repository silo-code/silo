import { subscribe, snapshot } from "valtio";
import { store, setTheme } from "../state/store";
import { CORE_PRESETS } from "../layout/presets";
import { getThemeSnapshot } from "../layout/ThemeInjector";
import {
  saveCustomTheme,
  deleteCustomTheme,
  reloadCustomThemes,
  exportTheme,
  importTheme,
} from "../layout/ThemeLoader";
import { themePresetRegistry } from "./theme-presets";
import type {
  ThemeState,
  ThemeService,
  ThemePreset,
  CustomTheme,
} from "@silo-code/sdk";

// `ctx.theme` — the theme domain. The public contract lives in @silo-code/sdk
// (theme-service.ts); this is the host implementation: it reads the merged
// preset set (core Dark/Light + every preset registered via
// `ctx.registerThemePreset`), the active theme, and the user's custom themes,
// and drives the active theme and custom-theme CRUD. The one allowed seam over
// `state/store`, `layout/presets`, `layout/ThemeInjector`, `layout/ThemeLoader`.

let cachedSnapshot: ThemeState | null = null;
// Inputs the cached snapshot was built from — rebuild only when one changes so
// the snapshot reference stays stable for useSyncExternalStore.
let cachedActiveId: string | null = null;
let cachedCustom: readonly CustomTheme[] | null = null;
let cachedPresetList: readonly ThemePreset[] | null = null;

function buildSnapshot(): ThemeState {
  const s = snapshot(store);
  // registry.list() returns a stable reference between mutations.
  const registered = themePresetRegistry.list();
  if (
    cachedSnapshot &&
    cachedActiveId === s.activeThemeId &&
    cachedCustom === s.customThemes &&
    cachedPresetList === registered
  ) {
    return cachedSnapshot;
  }
  cachedActiveId = s.activeThemeId;
  cachedCustom = s.customThemes as readonly CustomTheme[];
  cachedPresetList = registered;
  cachedSnapshot = Object.freeze({
    activeId: s.activeThemeId,
    presets: Object.freeze([...CORE_PRESETS, ...registered]),
    customThemes: Object.freeze([
      ...(s.customThemes as CustomTheme[]),
    ]) as readonly CustomTheme[],
  });
  return cachedSnapshot;
}

// The shared service deliberately omits `registerPreset`: registration must be
// tracked against the registering extension's subscriptions (so teardown
// unregisters it), and `track()` is per-extension while this service is a
// singleton. createContext() completes the ThemeService by adding the tracked
// `registerPreset` per ctx — the Omit keeps the checker enforcing that.
let service: Omit<ThemeService, "registerPreset"> | null = null;

/** @internal — host factory; `createContext` adds the per-extension
 * `registerPreset` on top and hands the result out as `ctx.theme`. */
export function getThemeService(): Omit<ThemeService, "registerPreset"> {
  if (service) return service;
  service = {
    getState: buildSnapshot,
    subscribe(listener) {
      const emit = () => listener(buildSnapshot());
      const unsubStore = subscribe(store, emit);
      const offRegistry = themePresetRegistry.onChange(emit);
      return {
        dispose() {
          unsubStore();
          offRegistry.dispose();
        },
      };
    },
    setActive: setTheme,
    resolve(id) {
      return getThemeSnapshot(store.customThemes, id);
    },
    async saveCustom(theme) {
      await saveCustomTheme(theme);
      await reloadCustomThemes();
    },
    async deleteCustom(id) {
      await deleteCustomTheme(id);
      await reloadCustomThemes();
    },
    reloadCustom: reloadCustomThemes,
    exportTheme,
    importTheme,
  };
  return service;
}
