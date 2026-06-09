---
status: accepted
date: 2026-05-31 # undated in source; circa late May 2026
---

# 0009. Extension communication: typed published APIs + domain-owned events, no global bus

## Context

Extensions need to consume each other's capabilities and observe state changes.
A global string-keyed event/registry bus is undiscoverable, stringly-typed, and
becomes a god-object.

## Decision

- **APIs:** an extension's `activate()` returns (publishes) a typed API object; a
  consumer declares a dependency (for activation order) and retrieves it via
  `ctx.getExtension(id)?.api`, tolerating absence; providers ship a types package
  (e.g. `@silo-code/git-api`). Mirrors VS Code's `extensions.getExtension(id).exports`.
- **Events:** typed `Event<T>` emitters **owned by each domain**
  (`editors.onDidChangeActive`, `workspaces.onDidChange`, …) plus one small SDK
  `EventEmitter` helper. **No** global string-keyed bus.

## Consequences

- Discoverable (autocomplete), typed, versioned, deprecatable; events live next to
  what they describe.
- Requires a types package per published API; the event surface is still partly
  unshipped (🔵 demand-driven on the roadmap).

## Alternatives considered

- **Global `ctx.events.on("some.string", …)` bus** — rejected: undiscoverable,
  unmaintainable, god-object.

## References

- Originally captured during the early architecture work (2026).
