---
status: accepted
date: 2026-05-31 # undated in source; circa late May 2026
---

# 0010. Persistent process sessions are a core primitive (`ctx.process`), plus one-shot exec

## Context

Terminals, task runners, and REPLs need processes that survive the extension that
opened them **and** a full app restart. Only the host/backend can own that
lifecycle — it fails [0007](./0007-core-primitive-vs-extension-test.md)'s test as
a feature.

## Decision

- A host-owned registry of long-lived PTY/process sessions, exposed as
  **`ctx.process`** (abduco-backed in the Tauri backend today).
- Plus **`ctx.process.exec(cmd, args, {cwd}) → {stdout, stderr, code}`**:
  **non-blocking** one-shot subprocess execution for extensions wrapping a CLI
  (git, formatters, linters).

## Consequences

- Extensions rely on persistence without rebuilding it per-extension.
- A single privilege chokepoint for untrusted extensions later
  (see [0015](./0015-phased-security-model.md)).
- `exec` runs off the main thread — fixes the UI stutter of the old synchronous
  bespoke `git_*` commands it replaces.

## Alternatives considered

- **Extension-owned session stores** — rejected: sessions must survive extension
  disable and app restart.

## References

- Originally captured during the early architecture work (2026).
