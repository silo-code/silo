---
status: draft
created: 2026-06-04
---

# 0005. Declarative `contributes` + activation events

## Summary

Introduce a declarative manifest `contributes` section plus **activation events**
(lazy activation), so the host knows an extension's contributions **without
running it** and can defer `activate()` until first use.

## Motivation

Registration is imperative today ([ADR 0002](../decisions/0002-imperative-registration-no-manifest.md)):
every enabled extension's `activate()` runs eagerly at startup (so one slow
`activate` stalls the rest), and the host **cannot show an extension's
contributions while it is unloaded** or lazily activate "on first use." This is
the biggest model fork, and the extension package-format freeze
([RFC 0008](./0008-extension-package-format-remote-install.md)) is its deadline —
once third parties target a manifest shape, it's hard to change.

## Design

Sketch:

- A manifest `contributes: { commands, panels, settingsPages, … }` mirrored by the
  existing imperative API (so the host can render contributions before activation).
- `activationEvents` — `onCommand:…`, `onView:…`, `onLanguage:…`, `onStartup`.
- The host reads contributions from the manifest and lazily calls `activate()` on
  the triggering event; imperative registration stays valid (backward compatible).

## Alternatives considered

- **Stay fully eager + imperative** (ADR 0002, current) — simplest, but doesn't
  scale, no lazy load, can't introspect unloaded extensions.

## Decision

Draft. This is the explicit revisit of [ADR 0002](../decisions/0002-imperative-registration-no-manifest.md);
must settle **before publish**, since the manifest becomes a third-party contract.

## References

- [ADR 0002](../decisions/0002-imperative-registration-no-manifest.md),
  [RFC 0008](./0008-extension-package-format-remote-install.md).
