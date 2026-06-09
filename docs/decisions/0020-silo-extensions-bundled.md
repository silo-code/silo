---
status: accepted
date: 2026-06-04
---

# 0020. Ship `silo.*` extensions bundled, surfaced as disable-able extensions

## Context

The `silo.*` tier is restricted to `@silo-code/sdk` only
([0013](./0013-trust-tiers-two-barrel-sdk.md)) — "independently-shippable shape."
That raised whether `silo.*` should be **deployed independently** (downloaded +
auto-installed + auto-updated at runtime, decoupled from app releases) or
**bundled** with the app.

"Deploy separately" conflates four separable things: (1) the **capability
boundary** (`@silo-code/sdk`-only), (2) source location, (3) **release cadence**, and
(4) **distribution channel**. The "iterate outside the core" benefit comes almost
entirely from (1), which is already decided and enforced. Independent
deployment's _unique_ payoff is (3) — but today there is no remote-load / update /
security pipeline ([0015](./0015-phased-security-model.md)), a bad first-party
auto-update could break core-feeling features with no app-release gate, and it
breaks offline/first-run. VS Code (built-in extensions) and Obsidian (core
plugins) both bundle first-party features and reserve independent download for
third-party.

## Decision

**Ship `silo.*` compiled into the app (bundled)** and **surface them in the
Extensions settings panel as first-party extensions the user can
enable/disable** — keeping the `@silo-code/sdk`-only boundary. **Defer** independent
runtime deployment until **both**: (a) a concrete release-cadence pain on a
specific `silo.*` feature, and (b) the third-party load + update + security
pipeline already exists. This **refines, not reverses**, the "shipped
independently" target — it stages the _timing_: bundle first.

## Consequences

- Zero new infrastructure; works offline; no version-skew; no remote-load attack
  surface for first-party; no bad-update breakage of core features.
- **Reversible** — because the capability boundary is the invariant (not the
  deployment mechanism), moving a `silo.*` extension to independent deployment
  later is a distribution change, not a rewrite. Bundling now does not corner us.
- Dogfoods the management UX (disable-able first-party, the VS Code / Obsidian
  model).
- A `silo.*` change requires an app release until the deferred work lands; the
  third-party install/update path isn't dogfooded by first-party yet.
- Requires a host change: today `silo.*` are invisible always-on builtins; the
  manager must enumerate bundled extensions with enable/disable mapping to
  activate/deactivate.

## Alternatives considered

- **Invisible, always-on builtins (status quo)** — rejected: no user control.
- **Independently deployed + auto-updated at runtime** — **deferred** (not
  rejected): depends on the unbuilt remote-load/update/security stack; reliability
  - offline downsides; and it's reversible to adopt later thanks to the boundary.

## References

- Related: [0013](./0013-trust-tiers-two-barrel-sdk.md),
  [0014](./0014-per-extension-enablement.md),
  [0019](./0019-runtime-extension-loading.md).
