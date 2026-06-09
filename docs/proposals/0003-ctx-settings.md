---
status: draft
created: 2026-06-04
---

# 0003. `ctx.settings` — per-extension configuration

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

## Alternatives considered

- **Extensions hand-roll settings UI + persistence** (status quo) — fragmented,
  inconsistent, and not themed/validated by the host.

## Decision

Draft. Demand-driven — lands when a non-core extension wants user-facing config.

## References

- [RFC 0004](./0004-ctx-storage.md) (storage),
  [RFC 0007](./0007-extension-authoring-toolchain.md) (authoring DX).
