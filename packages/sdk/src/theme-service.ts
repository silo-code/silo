import type { Disposable } from "./types";
import type {
  ThemeBase,
  ThemeVars,
  CustomTheme,
  ThemeExport,
} from "./domain-types";

// Re-export the theme domain types so consumers can name them from the SDK.
export type {
  ThemeBase,
  ThemeVars,
  CustomTheme,
  ThemeExport,
} from "./domain-types";

/**
 * A selectable theme contributed via {@link ThemeService.registerPreset}.
 * Built-in presets (Tokyo Night, Solarized Light, Gruvbox Dark, …) are
 * registered by the `theme-presets` extension; core ships only Dark and Light.
 * A preset's {@link ThemePreset.vars} are injected as CSS custom properties
 * when it is the active theme.
 *
 * @category Registration
 * @public
 */
export interface ThemePreset {
  /** Unique id (also the persisted `activeThemeId` when selected). */
  id: string;
  /** Display name shown in the theme picker. */
  name: string;
  /** Dark or light — drives the Monaco/xterm base and the `data-theme` attribute. */
  base: ThemeBase;
  /** The CSS `color-scheme` for native controls. */
  colorScheme: "dark" | "light";
  /** CSS variable overrides applied on top of the base palette in `theme.css`. */
  vars: Partial<ThemeVars>;
}

/**
 * A theme id resolved to its base + effective variables — what the theme picker
 * renders swatches from, returned by {@link ThemeService.resolve}.
 *
 * @category Consumer Services
 * @public
 */
export interface ResolvedTheme {
  base: ThemeBase;
  colorScheme: "dark" | "light";
  vars: Partial<ThemeVars>;
}

/**
 * An immutable, frozen view of theme state, returned by
 * {@link ThemeService.getState} and delivered to subscribers — read access
 * without a Valtio dependency. `presets` is part of the state (not a static
 * read) because presets are dynamic: extensions register and unregister them at
 * runtime.
 *
 * @category Consumer Services
 * @public
 */
export interface ThemeState {
  /** The active theme's id (a preset id or a custom theme id). */
  activeId: string;
  /** Core Dark/Light followed by every registered preset, in registration order. */
  presets: readonly ThemePreset[];
  /** The user's custom themes, loaded from disk. */
  customThemes: readonly CustomTheme[];
}

/**
 * Consumer API for the theme domain, exposed as {@link ExtensionContext.theme}.
 * Read via {@link ThemeService.getState | getState} /
 * {@link ThemeService.subscribe | subscribe} (e.g. with `useSyncExternalStore`);
 * drive via {@link ThemeService.setActive | setActive} and the custom-theme
 * methods. Contribute a new preset via {@link ThemeService.registerPreset}.
 *
 * @category Consumer Services
 * @public
 */
export interface ThemeService {
  /** Current frozen view of theme state. */
  getState(): ThemeState;
  /** Subscribe to theme-state changes (active theme, custom themes, or presets). */
  subscribe(listener: (s: ThemeState) => void): Disposable;
  /** Set the active theme by id (a built-in preset, registered preset, or custom). */
  setActive(id: string): void;
  /** Resolve a theme id to its base + effective vars (for previews/swatches). */
  resolve(id: string): ResolvedTheme;
  /** Persist a custom theme to disk and refresh the in-memory list. */
  saveCustom(theme: CustomTheme): Promise<void>;
  /** Delete a custom theme from disk and refresh the in-memory list. */
  deleteCustom(id: string): Promise<void>;
  /** Reload custom themes from disk into the store. */
  reloadCustom(): Promise<void>;
  /** Strip the id from a custom theme for sharing/serialization. */
  exportTheme(theme: CustomTheme): ThemeExport;
  /** Validate/parse imported JSON into a custom theme (assigns a fresh id). */
  importTheme(data: unknown): CustomTheme;
  /**
   * Register a {@link ThemePreset} (a selectable theme in the picker). The
   * preset appears immediately and is removed when the returned
   * {@link Disposable} is disposed (typically when the extension deactivates).
   *
   * @example
   * ```ts
   * ctx.theme.registerPreset({
   *   id: "my-theme",
   *   name: "My Theme",
   *   base: "dark",
   *   colorScheme: "dark",
   *   vars: { "--silo-color-bg": "#1a1a2e" },
   * });
   * ```
   */
  registerPreset(preset: ThemePreset): Disposable;
}
