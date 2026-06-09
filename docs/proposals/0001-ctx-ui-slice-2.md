---
status: draft
created: 2026-06-04
---

# 0001. `ctx.ui` slice 2 — quickPick / inputBox / progress

## Summary

Complete the host-rendered user-interaction surface (`ctx.ui`) with the
remaining primitives: a filterable item picker (`quickPick`), a single-line input
(`inputBox`), and a `progress` indicator. Slice 1 (native pickers, `notify`,
`showMenu`, `confirm`/`prompt` + `Modal`) is already stable.

## Motivation

Extensions need a command-palette-style searchable picker and a way to show
long-running progress. Hand-rolling these fragments the UX and can't match the
host's theming, z-stacking, and focus handling.

## Design

- `ctx.ui.quickPick(items, opts) → Promise<Item | undefined>` — filterable,
  keyboard-driven, cancelable.
- `ctx.ui.inputBox(opts) → Promise<string | undefined>` — with an optional
  validation hook.
- `ctx.ui.progress({ title, location }, task) → Promise<T>` — runs `task` behind a
  host-rendered progress indicator.

All host-owned chrome, consistent with modals/menus.

## Alternatives considered

- **Extension-rendered pickers/progress** — rejected: fragmented UX, no shared
  theming/stacking.

## Decision

Draft. Demand-driven — lands when a `silo.*`/third-party consumer needs it.

## References

- [ADR 0018](../decisions/0018-host-owned-chrome.md) (host-owned chrome).
