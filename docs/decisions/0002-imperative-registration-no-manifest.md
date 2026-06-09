---
status: accepted
date: 2026-05-23
---

# 0002. Imperative registration; no static manifest (v1)

## Context

Extensions can declare what they contribute in a **static manifest** (VS Code's
`package.json` `contributes`) or **imperatively** in code. A manifest lets the
host know contributions without running the extension; it also adds a schema and
a contribution-point parser to maintain.

## Decision

Extensions register via TypeScript calls inside `activate(ctx)` (e.g.
`ctx.registerSidePanel(...)`). **No `contributes` field, no static manifest** for
v1.

## Consequences

- Single source of truth (code, not split code + JSON); nothing to keep in sync.
- The host **cannot know an extension's contributions without running
  `activate()`** — so no lazy activation, and contributions can't be shown while
  an extension is unloaded.
- Reconsider when external extensions exist and we need to inspect contributions
  without executing their code. The eager-vs-declarative `contributes` fork is the
  open follow-up, [RFC 0005](../proposals/0005-declarative-contributes-activation.md).

## Alternatives considered

- **Declarative manifest (VS Code)** — deferred until lazy activation for external
  extensions is actually needed.

## References

- Originally logged in the extension architecture decisions log (2026-05-23), now
  retired into this ADR set. The manifest fork is [RFC 0005](../proposals/0005-declarative-contributes-activation.md).
