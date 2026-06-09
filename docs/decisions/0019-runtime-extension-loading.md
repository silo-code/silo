---
status: accepted
date: 2026-06-04
---

# 0019. Runtime third-party extension loading (shared React/SDK) + manifest validation

## Context

To load a pre-built extension bundle at runtime, its `react` / `@silo-code/sdk`
imports must resolve to the **host's** instances — two copies of React cause
"invalid hook call," and two SDK copies break singleton services. Import maps
aren't reliable on the WebKit version floor. And an extension's `package.json` is
untrusted input used to build filesystem paths.

## Decision

Load a pre-built single-file ESM bundle from disk and **rewrite its bare
`react` / `react/jsx-runtime` / `@silo-code/sdk` import specifiers** to blob-URL shims
that re-export the host's singleton instances (no import maps). Run
`extension.activate(ctx)` and track every registration on `ctx.subscriptions` for
clean teardown on disable/uninstall. **Validate the manifest before any
filesystem op:** `id` must match `^[A-Za-z0-9][A-Za-z0-9._-]*$` (and can't be
`..`); `main` must be relative, not absolute, no `..` segments — closing path
traversal and making it a prerequisite for remote install.

## Consequences

- A single React + single SDK across the host↔extension boundary; clean
  enable/disable/uninstall; safe install paths.
- The rewrite assumes esbuild-shaped output; a non-conforming bundle fails (the
  build tooling should own this).
- Dock-panel-kind teardown is not yet clean (documented limitation).

## Alternatives considered

- **Import maps** (WebKit-floor risk), **per-extension bundled React** (duplicate-
  React hook breakage), **shipping source + building on-device** (slow, fragile) —
  all rejected.

## References

- Related: [0001](./0001-in-process-extension-architecture.md),
  [0002](./0002-imperative-registration-no-manifest.md),
  [0004](./0004-sdk-types-first.md),
  [0015](./0015-phased-security-model.md). Shipped 2026-06-04.
