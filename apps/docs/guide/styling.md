# Styling your extension

Your extension ships its own CSS. To look native — and to re-theme, recolor, and
font-scale for free — style against Silo's [design tokens](/api/theming) instead
of hard-coding values. The rules are short.

::: tip Building modal UI? Start with the Design System
For modal content there's a full [component kit](/design/) — buttons, inputs,
lists, tabs, badges — so most modals need little or no custom CSS at all. This
page covers the CSS you write around and beyond it.
:::

## Do: style against design tokens

Use the `--silo-*` [design tokens](/api/theming#the-tokens-you-use) for
color, font, and radius. They resolve through the cascade to whatever the active
theme (or the user's custom theme) sets.

```css
.clock-panel {
  background: var(--silo-color-bg);
  color: var(--silo-color-text);
  font-family: var(--silo-font-ui);
}
.clock-panel .label {
  color: var(--silo-color-text-lo);
}
.clock-panel.active {
  color: var(--silo-color-text-hi);
  outline: 1px solid var(--silo-color-accent);
  border-radius: var(--silo-radius-sm);
}
```

## Do: use the button classes

Buttons in your DOM pick up the global treatment automatically — a bare `<button>`
is the neutral variant; add a class for the others. They already match the app and
re-theme for free, so you rarely touch the raw `--silo-button-*` tokens.

```html
<button>Cancel</button>
<button class="silo-button-primary">Save</button>
<button class="silo-button-danger silo-button-sm">Delete</button>
```

## Size with relative units {#size-with-relative-units}

There's **one absolute font size** — `--silo-font-size-base`, driven by the user's
`uiFontSize` and mutated live by `Cmd/Ctrl +/-/0`. The host sizes each panel slot
from it, and **your content inherits that size**. So size everything _relative_ to
the inherited text and the whole UI scales together — no JS, no subscription.

```css
/* ✅ scales with the surrounding text */
.clock-panel .big {
  font-size: 1.2em;
}

/* ✅ when you genuinely need the app base directly */
.clock-panel .anchored {
  font-size: var(--silo-font-size-base);
}

/* ❌ never — fixed px ignores the user's font scaling */
.clock-panel .bad {
  font-size: 14px;
}
```

Don't name the panel-position sizes (`--silo-internal-font-size-*`) — they're
internal tokens, and you already inherit them.

## Scope your selectors

Your CSS rides in the same document as host chrome and other extensions. Scope
every rule to your own root or a prefixed class so you never leak styles outward.

```css
/* ✅ scoped to your panel */
.clock-panel button { … }

/* ❌ restyles every button in the app */
button { … }
```

## Don't reach into host chrome

Consuming a component token (`--silo-statusbar-bg`,
`--silo-content-tab-bg`, …) or an internal token (`--silo-internal-*`) is off
limits — these are host chrome, not part of the extension contract, and they can
change between releases. You don't render the status bar or the editor tabs, so
coupling your panel's look to their tokens is the styling version of importing
app internals. If you truly need to match a chrome surface exactly, that's a
signal to **promote it to a design token**, not to reach for the component one.

```css
/* ❌ off limits: host-chrome component token */
.clock-panel {
  background: var(--silo-statusbar-bg);
}
/* ✅ the generic surface you're allowed to share */
.clock-panel {
  background: var(--silo-color-bg);
}
```

::: tip Your own variables are fine
The rule only governs `--silo-*` (host) tokens. An extension's own custom
properties — or a third-party library's, like dockview's `--dv-*` — are yours to
define and consume freely.
:::

## Branch in TypeScript, not CSS

Styling is the cascade's job. When you genuinely need to _reason_ about the theme
in code — say, pick a dark vs. light raster asset — read it through
[`ctx.theme`](/api/theme/), never by parsing token values out of the DOM.

```ts
const { base } = ctx.theme.resolve(ctx.theme.getState().activeId);
const logo = base === "light" ? lightLogo : darkLogo;
```

## See also

- [Design tokens](/api/theming) — the full token reference.
- [Building a theme](/guide/theming) — the producer side: recolor the whole surface.
- [`ctx.theme`](/api/theme/) · [`ctx.theme.registerPreset`](/api/theme/#registerpreset).
