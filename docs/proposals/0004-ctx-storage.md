---
status: accepted
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

The system-monitor example extension makes the gap concrete. Its settings
(which metric panels are enabled, status-bar order) are needed by three surfaces
— the side panel, the status-bar item, and the global settings page — but the
only storage path goes through `SidePanelProps`. The workaround
(`sysmonStore.hydrate(storage)` inside the panel component) produces two bugs:

1. **Stale defaults until the panel opens.** With `lazyMount: true` the panel
   never mounts until first clicked, so the status-bar items always render
   `DEFAULT_SETTINGS` on startup regardless of what was saved last session.
2. **Silent write loss from the settings page.** `updateSettings` calls
   `this._storage?.set(...)`, but `_storage` is `null` until the panel mounts,
   so any save made through the global Settings dialog before the panel is ever
   opened is silently dropped and never persisted.

## Design

`ctx.storage` exposes two scopes ({@link ExtensionStorageScopes}), each an
`ExtensionStorage` (`get` / `set` / `keys` / `subscribe`) namespaced per
extension id:

- **`ctx.storage.global`** — one bag per extension, shared across all
  workspaces. Persisted in the global index (`app-state.json`), so it is not
  swapped on workspace switch. The place for an extension's own settings.
- **`ctx.storage.workspace`** — one bag per extension × active workspace.
  Backed by the per-workspace `extensionState`, swapped when the active
  workspace changes. The same backing serves `SidePanelProps.storage` (keyed by
  panel id) for panel-local UI state.

`subscribe` is namespace-scoped and also fires when the app state finishes
hydrating and when the workspace bag is swapped — so a consumer that reads in
`activate()` (which can run before hydration) re-reads once the persisted value
lands. `set(key, undefined)` deletes; `keys()` enumerates (the basis for the
uninstall-cleanup story below).

**Still future (not yet implemented):** `ctx.secrets` for credentials via a
host-mediated secret store, and host **cleanup of an extension's namespace on
uninstall** (the orphaned-storage gap).

## Alternatives considered

- **Side-panel-only storage** (status quo) — too narrow. **Ad-hoc files written by
  the extension** — no host management, no cleanup, no scoping.

## Decision

Accepted. `ctx.storage.global` and `ctx.storage.workspace` are implemented; the
system-monitor example uses `global` for its settings. `ctx.secrets` and
uninstall-time cleanup remain demand-driven follow-ups.

## References

- [ADR 0019](../decisions/0019-runtime-extension-loading.md) (loading / uninstall),
  [RFC 0003](./0003-ctx-settings.md) (settings — superseded; storage is the
  persistence half of how extension settings actually work).
