---
status: accepted
date: 2026-05-29
---

# 0003. Monorepo with pnpm workspaces (Turborepo + changesets)

## Context

For an extensible OSS project the core and the SDK churn together in the early
phase; multi-repo means version juggling for every cross-cutting change.

## Decision

House core, SDK, the internal UI library, first-party extensions, docs, and the
marketing site in **one monorepo with pnpm workspaces** — Turborepo for the task
graph, changesets for versioning the published packages.

## Consequences

- Atomic cross-cutting PRs (a contribution-point change + its host impl + its docs
  in one PR).
- **Package boundaries replace convention** — "core can't import features;
  extensions see only the SDK" becomes mechanically enforced by which package can
  import what (see [0013](./0013-trust-tiers-two-barrel-sdk.md)).
- Matches the proven pattern (VS Code, Theia, Tauri). Cost: workspace tooling — so
  it's sequenced "don't pay the full tax on day one" (Pass A first).

## Alternatives considered

- **Separate repos per package** — rejected: loses per-file history, version
  juggling. **Nx/Lerna** — less fit than pnpm+Turbo for this stack.

## References

- Decided during the monorepo / SDK strategy work (2026-05-29).
