---
status: draft
created: 2026-06-04
---

# 0004. `ctx.storage` — global / workspace / secret

## Summary

A general per-extension persisted-storage primitive: `globalState` (per
extension), `workspaceState` (per workspace × extension), and a host-mediated
`secrets` store — superseding today's side-panel-only storage.

## Motivation

The only persistence today is `SidePanelProps.storage`, scoped to a side panel.
A non-panel extension (the example clock's settings) **can't persist state at
all**, and on uninstall an extension's stored state is never cleaned up. Real
extensions need durable, namespaced, host-managed state.

## Design

Sketch: `ctx.storage.global` and `ctx.storage.workspace` (`get` / `set` / `keys` /
`onDidChange`), namespaced per extension id; `ctx.secrets` for credentials via a
host-mediated secret store. The host **cleans up an extension's namespace on
uninstall** (closes the orphaned-storage gap).

## Alternatives considered

- **Side-panel-only storage** (status quo) — too narrow. **Ad-hoc files written by
  the extension** — no host management, no cleanup, no scoping.

## Decision

Draft. Demand-driven.

## References

- [ADR 0019](../decisions/0019-runtime-extension-loading.md) (loading / uninstall),
  [RFC 0003](./0003-ctx-settings.md) (settings).
