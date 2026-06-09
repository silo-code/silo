# Design tokens <Badge type="tip" text="stable" />

Silo's visual surface is a set of CSS custom properties — **design tokens** — all
namespaced `--silo-*`. They track the active theme through the cascade, so styling
against them gives you light/dark support, custom themes, and `Cmd/Ctrl +/-/0`
font scaling for free. This page is the **stable, public token surface**;
[Styling your extension](/guide/styling) is the how-to.

There's only one question that matters for your CSS: **may an extension consume
this token in its own styles?** Tokens fall into three groups by the answer.

> Authoring a **theme** rather than an extension? A theme may recolor _every_
> token here, component tokens included — this page only lists the
> extension-consumable subset. See [Building a theme](/guide/theming) for the
> complete overridable surface.

| Group                | Pattern                                                                                          | Consume in your extension?        |
| -------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------- |
| **Design tokens**    | `--silo-color-*`, `--silo-font*`, `--silo-radius-*`, `--silo-button-*`                           | ✅ Yes — this page                |
| **Component tokens** | `--silo-content-*`, `--silo-statusbar-*`, `--silo-breadcrumb-*`, `--silo-tab-*`, `--silo-menu-*` | ❌ No — host chrome you don't own |
| **Internal tokens**  | `--silo-internal-*`                                                                              | ❌ No — host plumbing, may change |

Consuming a component or internal token from an extension package
(`packages/extensions-*/src/**`) is a lint error
(`silo/extension-design-tokens-only`) — the CSS analog of importing app internals
instead of going through `ctx`. The reasoning is recorded in
[ADR 0017](https://github.com/silo-code/silo/blob/main/docs/decisions/0017-css-theming-contract.md).

## The tokens you use

### Colors

Semantic, never literal (there is no `--silo-color-blue`). Every one is also a
[`ThemeVars`](/api/types/interfaces/ThemeVars) key, so a theme can recolor it.

| Token                        | Role                                    |
| ---------------------------- | --------------------------------------- |
| `--silo-color-bg`            | App / panel background                  |
| `--silo-color-bg-hover`      | Hover surface (rows, menu items, cards) |
| `--silo-color-bg-active`     | Active/pressed surface                  |
| `--silo-color-text`          | Body text                               |
| `--silo-color-text-hi`       | High-emphasis text (headings, active)   |
| `--silo-color-text-lo`       | Low-emphasis text (hints, disabled)     |
| `--silo-color-accent`        | Accent (links, focus, selection)        |
| `--silo-color-accent-2`      | Secondary accent                        |
| `--silo-color-border`        | Default border (often transparent)      |
| `--silo-color-border-strong` | Visible divider / outline               |
| `--silo-color-ok`            | Success                                 |
| `--silo-color-warn`          | Warning                                 |
| `--silo-color-err`           | Error / destructive                     |
| `--silo-color-input-bg`      | Form-field background                   |
| `--silo-color-input-text`    | Form-field text                         |
| `--silo-color-button-bg`     | Neutral control surface                 |
| `--silo-color-button-text`   | Neutral control text                    |

### Fonts

| Token              | Role                              |
| ------------------ | --------------------------------- |
| `--silo-font-ui`   | UI font stack (sans)              |
| `--silo-font-mono` | Monospace stack (code, terminals) |

### Font sizes

One absolute source (`--silo-font-size-base`, driven by the user's `uiFontSize`);
the rest derive from it. **Don't hard-code px** — size relatively (see the
[sizing rule](/guide/styling#size-with-relative-units)).

| Token                     | Value                 |
| ------------------------- | --------------------- |
| `--silo-font-size-base`   | The app base (live)   |
| `--silo-font-size-sm`     | `base − 1px`          |
| `--silo-font-size-chrome` | `base − 2px` (chrome) |

### Radius

A **fixed** scale for incidental corners (not theme-overridable — theming a corner
is done per-treatment, like the button group below).

| Token              | Value |
| ------------------ | ----- |
| `--silo-radius-sm` | 4px   |
| `--silo-radius-md` | 6px   |

### Buttons

A treatment group so a theme can restyle buttons without moving the global accent.
The global `button` / `.silo-button` / `.silo-button-primary` / `.silo-button-danger`
classes already consume these — use the classes; reach for the raw tokens only for
a bespoke control. Hover is _derived_ (a darker `color-mix` of the fill), not a
token.

| Token                                        | Role               |
| -------------------------------------------- | ------------------ |
| `--silo-button-bg` / `-text` / `-border`     | Neutral button     |
| `--silo-button-primary-bg` / `-primary-text` | Primary action     |
| `--silo-button-danger-bg` / `-danger-text`   | Destructive action |

## What you _don't_ touch

- **Component tokens** (`--silo-statusbar-bg`, `--silo-content-tab-bg`, …)
  style host chrome you don't render. Coupling your panel to them is the CSS
  version of importing `state/`. If you genuinely need to match a chrome surface,
  that's a request to **promote it to a design token**, not a reason to reach for it.
- **Internal tokens** (`--silo-internal-*`) are host plumbing with no
  stability promise. The panel-derived font sizes are applied to your panel's slot
  wrapper and you **inherit** them — never name them (see the
  [sizing rule](/guide/styling#size-with-relative-units)).
- **Hard-coded colors, font families, or px font sizes** break theming and
  accessibility scaling.

## See also

- [Styling your extension](/guide/styling) — the practical guide.
- [`ThemeVars`](/api/types/interfaces/ThemeVars) — the override surface in type form.
- [`ctx.theme`](/api/theme/) — reason about the active theme in TypeScript.
