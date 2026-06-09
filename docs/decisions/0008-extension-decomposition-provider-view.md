---
status: accepted
date: 2026-05-31 # undated in source; circa late May 2026
---

# 0008. Extension decomposition: package / extension / contribution; provider–view split

## Context

Conflating "package", "extension", and "contribution" forces contribution-level
enable/disable and blocks composition (e.g. swapping a UI while keeping an API).

## Decision

Treat three units as distinct:

- **Package** — distribution unit (one download, one manifest); may declare
  **multiple** extensions.
- **Extension** — one id + one `activate`; the unit of enable/disable.
- **Contribution** — a single registered thing (panel, command, API).

A feature with **both an API and a UI** is **two extensions**: a headless
**Provider** that publishes the typed API (e.g. `silo.git` → `GitAPI`) and a
**View** that consumes it (e.g. `silo.git-explorer`).

## Consequences

- Enable/disable keys off **extension id** — disable the view, keep the API; no
  contribution-level gating needed (pairs with [0014](./0014-per-extension-enablement.md)).
- Third-party views on first-party providers; provider substitution later.
- More ids to manage; the manifest must support one-to-many from day one.

## Alternatives considered

- **1:1 package = extension (VS Code / Obsidian)** — rejected: forces
  contribution-level gating for any multi-contribution feature.

## References

- Originally captured during the early architecture work (2026).
