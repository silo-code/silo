---
status: implemented
created: 2026-06-04
---

# 0002. Typed `ctx` events (`Event<T>`)

> **Implemented.** Typed `Event<T>` shipped as designed — domain-owned emitters
> on `ctx` plus an SDK `EventEmitter`, and no global string-keyed bus. Stable on
> the roadmap and documented under the SDK's `Event` reference.

## Summary

Give each `ctx` domain typed `Event<T>` emitters (`editors.onDidChangeActive`,
`workspaces.onDidChange`, …) and ship a small SDK `EventEmitter`/`Event<T>` helper
so extensions can emit their own. No global string-keyed bus.

## Motivation

Extensions need to react to host state changes; today only some services expose a
`subscribe()` and there is no general, typed event primitive — nor a way for an
extension to publish its own events to consumers.

## Design

- Domain services expose `onDidX: Event<T>` (VS Code-style); subscribing returns a
  `Disposable` tracked on `ctx.subscriptions`.
- `@silo-code/sdk` exports `EventEmitter<T>` with `.event` and `.fire(value)`.

## Alternatives considered

- **A global `ctx.events.on("some.string", …)` bus** — rejected; the "no global
  bus, domain-owned typed events" choice is already decided in
  [ADR 0009](../decisions/0009-extension-communication-and-events.md). This RFC is
  the surface design / rollout of that decision's event half.

## Decision

Draft. Demand-driven.

## References

- [ADR 0009](../decisions/0009-extension-communication-and-events.md).
