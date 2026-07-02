# Building a theme

A theme recolors Silo by overriding its [design tokens](/api/theming). Where
[styling an extension](/guide/styling) is the _consumer_ side — you read the 17
extension-safe `--silo-color-*` tokens — authoring a theme is the _producer_
side: you set the **full** token surface, every component included. This page
lists all of it.

There are two ways to ship a theme, same `vars` shape behind both:

- **A custom theme** — authored in the app's theme editor, saved to disk as JSON,
  shareable by export/import. Best for personal themes and one-offs. Modelled by
  [`CustomTheme`](/api/types/interfaces/CustomTheme).
- **A preset** — contributed by an extension through
  [`ctx.theme.registerPreset`](/api/theme/#registerpreset) so it shows
  up in the picker for everyone. Best for distributing a theme. Modelled by
  [`ThemePreset`](/api/types/interfaces/ThemePreset). The bundled Tokyo Night,
  Solarized Light, and Gruvbox Dark are exactly this.

## The shape

Both are the same four fields plus the variable map:

```ts
{
  id: "acme.midnight",       // preset id (custom themes get one assigned)
  name: "Midnight",          // shown in the picker
  base: "dark",              // "dark" | "light" — Monaco/xterm base + data-theme
  colorScheme: "dark",       // CSS color-scheme for native controls
  vars: {
    // a Partial<ThemeVars> — any subset; the base palette fills the rest
    "--silo-color-bg": "#0b0f1a",
    "--silo-color-accent": "#5eb1ff",
  },
}
```

`vars` is a `Partial<`[`ThemeVars`](/api/types/interfaces/ThemeVars)`>`. You only
set what you want to change — every key you omit keeps its value from the base
palette in `theme.css` for the chosen `base`.

## Start with the generics

Most of the surface **derives from the generic colors**, so a credible theme can
be just the `General` group. Component tokens like `--silo-menu-bg`,
`--silo-modal-bg`, and `--silo-statusbar-bg-hover` default off the generics via
`var()`, so they re-resolve to your palette automatically until you override them:

```ts
ctx.theme.registerPreset({
  id: "acme.midnight",
  name: "Midnight",
  base: "dark",
  colorScheme: "dark",
  vars: {
    "--silo-color-bg": "#0b0f1a",
    "--silo-color-bg-hover": "#141a2b",
    "--silo-color-bg-active": "#1b2238",
    "--silo-color-text": "#9aa4c0",
    "--silo-color-text-hi": "#cdd6f4",
    "--silo-color-text-lo": "#5a6285",
    "--silo-color-accent": "#5eb1ff",
    "--silo-color-border-strong": "#2b3148",
    // menus, modals, the status bar, etc. follow these automatically
  },
});
```

Reach for the component groups below only when you want a surface to diverge from
the generic palette — a darker status bar than the panels, a distinct editor
background, tab colors that don't track the body text.

::: tip Button colors aren't theme keys
`--silo-button-*` (and its `-primary-`/`-danger-` variants) are **not** in
`ThemeVars`. They derive from `--silo-color-accent`, `--silo-color-err`, and the
neutral button generics, so retint buttons by moving _those_, not by setting a
button token.
:::

## The complete `vars` surface

Every overridable key, grouped exactly as the in-app theme editor groups them.
Every key is a color string unless noted. All are optional.

### General

The generic palette. Set these first — most of the rest derives from them. This
is the same set extensions are allowed to consume.

| Token                        | Role                                    |
| ---------------------------- | --------------------------------------- |
| `--silo-color-bg`            | App / panel background                  |
| `--silo-color-bg-hover`      | Hover surface (rows, menu items, cards) |
| `--silo-color-bg-active`     | Active / pressed surface                |
| `--silo-color-button-bg`     | Neutral control surface                 |
| `--silo-color-button-text`   | Neutral control text                    |
| `--silo-color-text-hi`       | High-emphasis text (headings, active)   |
| `--silo-color-text`          | Body text                               |
| `--silo-color-text-lo`       | Low-emphasis text (hints, disabled)     |
| `--silo-color-input-bg`      | Form-field background                   |
| `--silo-color-input-text`    | Form-field text                         |
| `--silo-color-border`        | Default border (often transparent)      |
| `--silo-color-border-strong` | Visible divider / outline               |
| `--silo-color-accent`        | Accent (links, focus, selection)        |
| `--silo-color-accent-2`      | Secondary accent                        |

### Status

| Token               | Role                |
| ------------------- | ------------------- |
| `--silo-color-ok`   | Success             |
| `--silo-color-warn` | Warning             |
| `--silo-color-err`  | Error / destructive |

### Status Bar

| Token                       | Role                                                   |
| --------------------------- | ------------------------------------------------------ |
| `--silo-statusbar-bg`       | Status bar background                                  |
| `--silo-statusbar-text`     | Status bar text                                        |
| `--silo-statusbar-bg-hover` | Status-item hover (auto-derived from the bar if unset) |

### Side Tabs

| Token                      | Role                      |
| -------------------------- | ------------------------- |
| `--silo-tab-text`          | Side-tab label            |
| `--silo-tab-text-active`   | Active side-tab label     |
| `--silo-tab-bg-hover`      | Side-tab hover surface    |
| `--silo-tab-border-active` | Active side-tab indicator |

### Menus

The single treatment behind every floating menu — context menus and dropdowns.

| Token                       | Role                        |
| --------------------------- | --------------------------- |
| `--silo-menu-bg`            | Menu / dropdown surface     |
| `--silo-menu-text`          | Menu item text              |
| `--silo-menu-item-hover-bg` | Highlighted menu item       |
| `--silo-menu-border`        | Menu border / row separator |

### Modals

The dialog shell behind `ctx.ui.confirm`/`prompt` and the SDK `<Modal>`. The
backdrop scrim, shadow, and radius stay fixed — only the card is themeable.

| Token                 | Role                |
| --------------------- | ------------------- |
| `--silo-modal-bg`     | Dialog card surface |
| `--silo-modal-border` | Dialog card border  |

### Toolbar

The shared chrome tier for panel header bars — the editor breadcrumb / view-switcher row, the web viewer address bar, and any extension toolbar.

| Token                                | Role                                 |
| ------------------------------------ | ------------------------------------ |
| `--silo-color-toolbar-bg`            | Toolbar bar background               |
| `--silo-color-toolbar-text`          | Text and enabled icons               |
| `--silo-color-toolbar-text-disabled` | Muted text and disabled icons        |
| `--silo-color-toolbar-input-bg`      | Embedded input background and border |

### Content viewport

The background and foreground for content panels — editor, terminal, web viewer, image viewer, and any extension that renders a viewport. The specific component tokens (`--silo-content-editor-bg`, `--silo-content-terminal-bg`, `--silo-content-text`) default to these and can be overridden individually.

| Token                       | Role                                          |
| --------------------------- | --------------------------------------------- |
| `--silo-color-content-bg`   | Viewport background (all content panels)      |
| `--silo-color-content-text` | Viewport foreground text (all content panels) |

### Content

The editor and terminal surfaces.

| Token                                      | Role                                   |
| ------------------------------------------ | -------------------------------------- |
| `--silo-content-terminal-bg`               | Terminal background                    |
| `--silo-content-editor-bg`                 | Editor background                      |
| `--silo-content-editor-selection`          | Selection (editor + terminal)          |
| `--silo-content-editor-selection-inactive` | Selection when the view is unfocused   |
| `--silo-content-text`                      | Editor / terminal foreground           |
| `--silo-content-editor-text-dim`           | Dimmed editor text                     |
| `--silo-content-editor-text-faint`         | Faint editor text (whitespace, guides) |

### Content Tabs

The editor tab strip.

| Token                              | Role                |
| ---------------------------------- | ------------------- |
| `--silo-content-tab-tray-bg`       | Tab tray background |
| `--silo-content-tab-bg`            | Tab background      |
| `--silo-content-tab-tray-text`     | Tray text           |
| `--silo-content-tab-text-inactive` | Inactive tab label  |
| `--silo-content-tab-text`          | Tab label           |
| `--silo-content-tab-text-active`   | Active tab label    |

### Fonts <Badge type="info" text="optional" />

Two optional font-family overrides (omit to inherit the system stacks). Font
_sizes_ are driven by the user's `uiFontSize` and are **not** theme-overridable.

| Token              | Role                              |
| ------------------ | --------------------------------- |
| `--silo-font-ui`   | UI font stack (sans)              |
| `--silo-font-mono` | Monospace stack (code, terminals) |

## Authoring in the app

The theme editor (open it from the theme status item) is the fastest path for a
custom theme:

1. **Create** a theme, pick its `base` (dark/light), and name it.
2. **Edit by group** — the editor lays the tokens out in the same groups as the
   tables above, each with a swatch + color picker. Changes apply live.
3. **Export JSON** writes a [`ThemeExport`](/api/types/interfaces/CustomTheme)
   (the theme minus its id) — the shareable artifact.
4. **Import JSON** validates a file back into a custom theme with a fresh id and
   activates it.

Custom themes are persisted to disk and surfaced through
[`ctx.theme`](/api/theme/) (`saveCustom`, `exportTheme`, `importTheme`, …) — the
editor is just a UI over that service, so an extension can build its own.

## Shipping a theme as a preset

To distribute a theme so it appears in everyone's picker, register it from an
extension. This is the same path the bundled presets use:

```ts
const preset: ThemePreset = {
  id: "acme.midnight",
  name: "Midnight",
  base: "dark",
  colorScheme: "dark",
  vars: {
    /* the vars from above */
  },
};

export default {
  activate(ctx) {
    ctx.theme.registerPreset(preset);
  },
} satisfies Extension;
```

The returned [`Disposable`](/api/types/interfaces/Disposable) unregisters it; the
host disposes it for you on deactivate.

## See also

- [Design tokens](/api/theming) — the reference, scoped to the extension-consumable subset.
- [`ctx.theme`](/api/theme/) — read presets, switch the active theme, manage custom themes.
- [`ctx.theme.registerPreset`](/api/theme/#registerpreset) — contribute a preset.
- [`ThemeVars`](/api/types/interfaces/ThemeVars) · [`CustomTheme`](/api/types/interfaces/CustomTheme) · [`ThemePreset`](/api/types/interfaces/ThemePreset).
