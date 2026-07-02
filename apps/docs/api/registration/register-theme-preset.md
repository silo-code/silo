# ctx.registerThemePreset <Badge type="warning" text="deprecated" />

> **Deprecated.** Use [`ctx.theme.registerPreset()`](/api/theme/#registerpreset) instead.
> This method works unchanged today but will be removed in a future release.

Contribute a selectable theme to the picker. Core ships only **Dark** and
**Light**; every other theme — Tokyo Night, Solarized Light, Gruvbox Dark, and
anything your extension adds — is registered this way. The preset's `vars`
override the base palette in `theme.css` when it's the active theme.

```ts
// Preferred — domain-consistent placement:
ctx.theme.registerPreset(preset: ThemePreset): Disposable

// Deprecated alias (same behavior, removed in a future release):
ctx.registerThemePreset(preset: ThemePreset): Disposable
```

## Example

```ts
ctx.theme.registerPreset({
  id: "acme.midnight",
  name: "Midnight",
  base: "dark", // Monaco/xterm base + the data-theme attribute
  colorScheme: "dark",
  vars: {
    "--silo-color-bg": "#0b0f1a",
    "--silo-color-accent": "#5eb1ff",
    // …any subset of ThemeVars; the base palette fills the rest
  },
});
```

For the full set of overridable keys and how to author a theme end-to-end, see
[Building a theme](/guide/theming).

## Types

Pass [`ThemePreset`](/api/types/interfaces/ThemePreset); its `vars` are a
`Partial<`[`ThemeVars`](/api/types/interfaces/ThemeVars)`>`.

## See also

Read the merged preset set or switch the active theme via
[`ctx.theme`](/api/theme/). Other [Registration](/api/#registration) members on
`ctx`.
