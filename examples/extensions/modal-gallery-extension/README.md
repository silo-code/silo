# Modal Gallery — an example Silo extension

A live component gallery for Silo's [modal design system](../../../docs/proposals/0016-modal-design-system.md)
(RFC 0016). Opens a `ctx.ui.showModal` that tours every presentational
component shipped in `@silo-code/sdk`, organized the same way as the
[design docs](../../../apps/docs/design/components/) so you can cross-reference
"docs page ↔ gallery tab."

Demos are interactive: switches toggle, search filters a real branch list,
tabs switch, InlineEdit enters/saves/cancels. Screenshots for the docs site
are captured from this gallery.

## Build

```sh
pnpm install
pnpm --filter modal-gallery-extension build   # → dist/index.js
```

The bundle treats `react`, `react/jsx-runtime`, and `@silo-code/sdk` as
**externals** — the Silo host resolves them at load time.

## Install

In Silo, open **Settings → Extensions → Install from folder…** and choose this
folder. Then open **View → Modal Gallery** (or press **`cmd+shift+g`**).

## Tabs ↔ docs

| Gallery tab        | Docs page                                                                        |
| ------------------ | -------------------------------------------------------------------------------- |
| Buttons            | [buttons](../../../apps/docs/design/components/buttons.md)                       |
| Text inputs        | [text-inputs](../../../apps/docs/design/components/text-inputs.md)               |
| Selection controls | [selection-controls](../../../apps/docs/design/components/selection-controls.md) |
| Tabs               | [tabs](../../../apps/docs/design/components/tabs.md)                             |
| Lists              | [lists](../../../apps/docs/design/components/lists.md)                           |
| Badges             | [badges](../../../apps/docs/design/components/badges.md)                         |
| Feedback           | [feedback](../../../apps/docs/design/components/feedback.md)                     |
| Structure          | [structure](../../../apps/docs/design/components/structure.md)                   |
