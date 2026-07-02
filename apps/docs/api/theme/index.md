# ctx.theme <Badge type="tip" text="stable" />

The theme domain — read the merged set of presets (core **Dark**/**Light** plus
everything registered via [`ctx.theme.registerPreset`](#registerpreset)), switch
the active theme, and manage the user's custom themes. The built-in theme picker
and theme editor consume the domain through here rather than reaching into app
state.

```ts
ctx.theme: ThemeService
```

## Example

```tsx
// read reactively (e.g. via React's useSyncExternalStore)
const state = ctx.theme.getState();
state.presets; // core Dark/Light + every registered preset
state.activeId; // the active theme's id
state.customThemes; // the user's saved custom themes

// switch the active theme (a preset id or a custom theme id)
ctx.theme.setActive("gruvbox-dark");

// resolve an id to its base + effective vars (for a swatch / preview)
const { base, vars } = ctx.theme.resolve(state.activeId);

// observe changes (active theme, custom themes, or the set of presets)
const sub = ctx.theme.subscribe((s) => render(s));
sub.dispose();
```

## Methods

**`ThemeService`** (`ctx.theme`):

| Method                                                                        | What it does                                                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| [`getState()`](/api/types/interfaces/ThemeService#getstate)                   | Current frozen [`ThemeState`](/api/types/interfaces/ThemeState).                         |
| [`subscribe(listener)`](/api/types/interfaces/ThemeService#subscribe)         | Observe theme-state changes; returns a [`Disposable`](/api/types/interfaces/Disposable). |
| [`setActive(id)`](/api/types/interfaces/ThemeService#setactive)               | Switch the active theme by id (preset or custom).                                        |
| [`resolve(id)`](/api/types/interfaces/ThemeService#resolve)                   | Resolve an id to a [`ResolvedTheme`](/api/types/interfaces/ResolvedTheme) (base + vars). |
| [`saveCustom(theme)`](/api/types/interfaces/ThemeService#savecustom)          | Persist a custom theme to disk and reload the list.                                      |
| [`deleteCustom(id)`](/api/types/interfaces/ThemeService#deletecustom)         | Delete a custom theme from disk and reload.                                              |
| [`reloadCustom()`](/api/types/interfaces/ThemeService#reloadcustom)           | Reload custom themes from disk.                                                          |
| [`exportTheme(theme)`](/api/types/interfaces/ThemeService#exporttheme)        | Strip the id for sharing/serialization.                                                  |
| [`importTheme(data)`](/api/types/interfaces/ThemeService#importtheme)         | Validate JSON into a [`CustomTheme`](/api/types/interfaces/CustomTheme) (fresh id).      |
| [`registerPreset(preset)`](/api/types/interfaces/ThemeService#registerpreset) | Contribute a [`ThemePreset`](/api/types/interfaces/ThemePreset) to the picker.           |

## Types

[`ThemeService`](/api/types/interfaces/ThemeService) ·
[`ThemeState`](/api/types/interfaces/ThemeState) ·
[`ThemePreset`](/api/types/interfaces/ThemePreset) ·
[`ResolvedTheme`](/api/types/interfaces/ResolvedTheme) ·
[`CustomTheme`](/api/types/interfaces/CustomTheme) ·
[`ThemeVars`](/api/types/interfaces/ThemeVars).

## Notes

Presets are **dynamic** — part of the reactive state, not a static list,
because extensions register and unregister them at runtime. Contribute a preset
via `ctx.theme.registerPreset(preset)` — the returned
[`Disposable`](/api/types/interfaces/Disposable) unregisters it (the host
disposes it for you on deactivate). Core ships only Dark and Light as the
always-present fallback; the bundled presets (Tokyo Night, Solarized Light,
Gruvbox Dark) live in the `theme-presets` built-in extension, so the picker's
bundled set is itself just contributions.
