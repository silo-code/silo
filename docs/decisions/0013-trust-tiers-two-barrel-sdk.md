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

## Amendment (2026-06-16, the core-vs-silo placement test)

The original framing leaned on the **capability boundary** to also imply
_placement_ — "`silo.*` is `@silo-code/sdk`-only" reads as "SDK-only ⇒ `silo.*`."
In practice that's too strong: some identity-defining first-party chrome is
SDK-only yet must stay bundled and **not** user-disableable (the theme picker
`core.themes`; the status-bar chrome `core.panel-toggles` / `core.settings-button`).
Filing those as `silo.*` would expose a "disable" affordance on chrome a user
can't sensibly turn off (per [0020](./0020-silo-extensions-bundled.md), `silo.*`
are surfaced as enable/disable-able).

So the **placement test** (which bundled tier a first-party extension lives in)
is explicit, mirroring [0007](./0007-core-primitive-vs-extension-test.md):

An extension is **`core.*`** iff **either**:

1. **Privilege** — it imports `@silo-code/extension-host/internal`, **or**
2. **Identity-defining chrome** — it is always-on UI that defines the app and must
   not be user-disableable, _even if it is SDK-only_.

Otherwise — **SDK-only _and_ an optional, disable-able feature** — it is `silo.*`.

Consequence: **SDK-only no longer implies `silo.*`.** The "truest public-surface
measuring stick" is therefore the **SDK-only `silo.*`** set specifically (git,
markdown-preview, file-explorer, image-viewer, theme-presets) — read the
internal-barrel health metric with that carve-out in mind. The capability
boundary itself is unchanged: `core.*` _may_ use the privileged barrel, `silo.*`
physically cannot.

## References

- Related: [0004](./0004-sdk-types-first.md), [0007](./0007-core-primitive-vs-extension-test.md), [0020](./0020-silo-extensions-bundled.md).
- Decided 2026-06-02, during the boundary burn-down; amended 2026-06-04 and 2026-06-16.
