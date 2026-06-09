---
status: accepted
date: 2026-05-31 # undated in source; diff-fold shipped 2026-06-03
---

# 0011. Editor and terminal are core surfaces

## Context

Which built-ins are genuinely **core architecture** vs. extension-shaped? And the
editor/diff surface had drifted — diff was anomalously its own `DockPanelKind`,
ignoring editor settings, using different fonts, rewiring breadcrumbs.

## Decision

- **`core.editor` is one Monaco core with two modes** — `text` (read-write) and
  `diff` (the same core, read-only, two models, side-by-side) — **not** separate
  peer panels. Editor settings drive both. (Diff was folded back into
  `core.editor` from its own kind.)
- **The terminal is a core `DockPanelKind`** (same tier as the editor), driven by
  a blessed **`ctx.terminals`** consumer service, with its records on the core
  `Workspace` model; its PTY **sessions** live on `ctx.process`
  ([0010](./0010-persistent-process-sessions.md)).

## Consequences

- Diff inherits the editor's formatting, context menu, breadcrumbs, and settings
  "by construction."
- Rendering terminal tabs stays the core dock's job — no forced dock
  generalization or a premature all-resident `ctx.storage`.
- Both surfaces are privileged core, justified by
  [0007](./0007-core-primitive-vs-extension-test.md) (lifecycle/privilege), not by
  importance.

## Alternatives considered

- **Diff as a separate kind** (drift/duplication) and **terminal as a pure
  extension** (would need dock generalization + a new storage primitive) —
  rejected.

## References

- Originally captured during the early architecture work (2026); diff folded into
  `core.editor` 2026-06-03.
