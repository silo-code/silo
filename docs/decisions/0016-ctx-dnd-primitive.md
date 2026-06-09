---
status: accepted
date: 2026-06-02
---

# 0016. First-class drag-and-drop primitive (`ctx.dnd`)

## Context

The file explorer, tabs, and panels all need drag-and-drop. Ad-hoc per-extension
handling causes drop-zone conflicts and a stringly-typed payload mess.

## Decision

A first-class **`ctx.dnd`** service owns drag sources and drop targets, with a
well-known MIME vocabulary (`DND_MIME`, a runtime value exported from `@silo-code/sdk`)
so payloads interoperate across extensions. The host owns the drag affordance and
the modifier-mode resolution.

## Consequences

- Centralized, typed, conflict-free DnD; dogfooded by the file explorer.
- One more core service.

## Alternatives considered

- **Per-extension drag handling** — rejected: drop-zone conflicts, fragmentation,
  stringly-typed payloads.

## References

- Related: [0007](./0007-core-primitive-vs-extension-test.md). Shipped 2026-06-02.
