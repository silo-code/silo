---
status: superseded
created: 2026-06-04
superseded-by: ctx.registerSettingsPage + ctx.storage
---

# 0003. `ctx.settings` — per-extension configuration

> **Superseded.** The need this RFC named — a consistent place for an extension
> to expose user-facing settings and persist them — is met by two primitives
> that shipped separately: [`ctx.registerSettingsPage`](/api/registration/register-settings-page)
> (a host-placed, host-themed slot in the Settings dialog) and
> [`ctx.storage`](./0004-ctx-storage.md) (`global` / `workspace` persistence).
> The system-monitor reference extension uses exactly this combination
> (`ctx.storage.global` + `registerSettingsPage`). The declarative-schema
> primitive proposed below was **not** built, and on reflection is the wrong
> bet — see "Why superseded." Kept for the record.

## Summary

A public primitive for an extension to **declare** user-facing settings and
read / write / observe them, with the host rendering a consistent settings UI.

## Motivation

Extensions hand-roll their own settings pages today (the example clock extension
builds its own toggle UI). A declared configuration schema that the host renders
and persists removes that boilerplate and gives a uniform UX. This is distinct
from the host's internal app/editor settings (UI-font, editor options), which are
core-only by design and correctly live on `@silo-code/sdk/internal` — `ctx.settings` is
the **public per-extension config** primitive, not a reclaim of those.

## Design

Sketch: a declared schema (a `contributes.configuration`-style block, or
imperative `ctx.settings.define(schema)`); `ctx.settings.get(key)` /
`update(key, value)` / `onDidChange`; the host renders a generated settings page.
Persistence pairs with [`ctx.storage`](./0004-ctx-storage.md).

## Why superseded

The codebase took the **composable, component-based** path instead of the
declarative-schema path proposed here:

- **Placement / theming / persistence are already solved.**
  `ctx.registerSettingsPage` gives an extension a themed slot (non-core pages are
  grouped under **Extensions**), and `ctx.storage.global` persists its values
  across surfaces — the two halves this RFC wanted to fuse into one primitive
  now exist independently and compose.
- **The reference extension is richer than a flat schema could express.**
  system-monitor's settings are two drag-to-reorder ordered lists shared across
  the side panel, status bar, and settings page. A `contributes.configuration`
  vocabulary (checkboxes / dropdowns / text) couldn't render that without growing
  a generated-UI language indefinitely. Owning the React component is simpler and
  strictly more capable.
- **The "kill boilerplate" promise wasn't the real win.** The uniform look comes
  from the design-token CSS contract, not from host-generated widgets — so an
  extension writing its own thin settings component still gets a consistent UX.

The one thing not delivered is **zero-code declarative settings** (a checkbox
without writing React) and **machine-readable settings** (for a future
settings-search / export / sync). If demand appears, that should be a _new,
narrow_ RFC for an optional sugar layer **on top of** `registerSettingsPage` +
`ctx.storage` — not a standalone primitive that owns rendering and persistence.

## Alternatives considered

- **Extensions hand-roll settings UI + persistence** (status quo at time of
  writing) — judged fragmented and inconsistent. In practice, `registerSettingsPage`
  (host placement + theming) plus `ctx.storage` (host-managed persistence) closed
  that gap without a schema, which is why this RFC is superseded rather than built.

## References

- [`ctx.registerSettingsPage`](/api/registration/register-settings-page) (the
  shipped settings slot), [RFC 0004](./0004-ctx-storage.md) (storage — accepted),
  [RFC 0007](./0007-extension-authoring-toolchain.md) (authoring DX).
