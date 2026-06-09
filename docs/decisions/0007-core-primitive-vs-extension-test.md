---
status: accepted
date: 2026-05-31 # undated in source; circa late May 2026
---

# 0007. The core-primitive vs extension-feature test

## Context

Without an explicit rule, "it's important, so it's core" steadily bloats the core
(`ctx`) surface — until the extension API is something first-party features never
actually use, and the whole point of being extensible erodes.

## Decision

A capability belongs in **core (`ctx`)** iff **either** holds:

1. **Privilege** — it needs access only the host has (filesystem, processes,
   window chrome, the editor model), or
2. **Resource lifecycle** — it owns a long-lived, host-managed resource whose
   lifecycle must outlive any single extension _and_ a full app restart.

Otherwise it is a **feature**: a built-in extension implements it and publishes a
typed API.

## Consequences

- Keeps even load-bearing features extension-shaped (git is an extension;
  persistent sessions / the terminal are core — see [0010](./0010-persistent-process-sessions.md),
  [0011](./0011-editor-and-terminal-are-core.md)).
- First-party = third-party stays mechanically true.
- Requires discipline: some "obviously core" features must be built as extensions.

## Alternatives considered

- **Importance-based ("important ⇒ core")** — rejected: it is exactly how core
  surfaces bloat.

## References

- Originally captured during the early architecture work (2026).
