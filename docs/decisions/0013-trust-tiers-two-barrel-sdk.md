---
status: accepted
date: 2026-06-02
---

# 0013. Extension trust tiers + two-barrel SDK

## Context

First-party extensions sometimes need privileged host access, but third-party
extensions must not get it — and we want a way to _prove_ the public surface is
real, not aspirational.

## Decision

Three trust tiers:

- **`core.*`** — bundled, identity-defining; may import `@silo-code/sdk` **and** a
  privileged, lint-gated **`@silo-code/extension-host/internal`** (see the amendment
  below — originally named `@silo-code/sdk/internal`).
- **`silo.*`** — Silo's optional features (the dogfood set); may import
  **`@silo-code/sdk` only** — the same capability rule as third-party.
- **third-party** — `@silo-code/sdk` only.

Built-ins are split into `src/extensions/{core,silo}/`; ESLint path-globs enforce
the boundary as a **two-track ratchet** (per-tier suppression count, target 0;
core-tier reached 0). **Public-first:** drive every capability onto public
`@silo-code/sdk`; only genuinely core-only-and-unsafe capability falls back to the
privileged surface, where importing it is the recorded "mark."

## Consequences

- `silo.*` (`@silo-code/sdk`-only, independently shippable) is the truest
  public-surface measuring stick; the internal barrel's size is a health metric.
- First-party = third-party stays mechanically true.
- Two barrels + a ratchet to maintain.

## Alternatives considered

- **Single-barrel SDK** — rejected: either exposes unsafe capability to everyone
  or denies core its legitimate privilege.

## Amendment (2026-06-04, during monorepo planning)

The privileged barrel's specifier was refined from `@silo-code/sdk/internal` to
**`@silo-code/extension-host/internal`**. Rationale: that surface re-exports _live host
runtime_, not SDK contract — so it belongs to the host package as a real subpath
export, not to the published `@silo-code/sdk` leaf (which must depend on nothing). This
keeps `@silo-code/sdk` a clean publishable leaf and makes the dependency direction
honest (`extensions-core → extension-host → sdk`). The decision above — three
trust tiers, the privileged surface gated to `core.*`, the two-track ratchet — is
unchanged; only the name and owning package move. A single `@silo-code/sdk` package with
a real `./internal` subpath was rejected (the leaf would have to depend on the
host, inverting the graph); a standalone `@silo-code/sdk-internal` pass-through package
was rejected (thin re-export, misleading name). It is consumed only by bundled
`core.*` and is never published.

## References

- Related: [0004](./0004-sdk-types-first.md), [0020](./0020-silo-extensions-bundled.md).
- Decided 2026-06-02, during the boundary burn-down; amended 2026-06-04.
