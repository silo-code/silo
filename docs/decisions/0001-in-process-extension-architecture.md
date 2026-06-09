---
status: accepted
date: 2026-05-23
---

# 0001. In-process, registry-based extension architecture

## Context

Silo wants a lean core that is modular by construction. Two models were on the
table: a sandboxed extension host (process/worker isolation) from day one, vs.
in-process extensions. Sandboxing is roughly 2–4× the work for v1 and carries
runtime cost; the only extensions for the foreseeable future are trusted
first-party built-ins.

## Decision

Refactor Silo so **every feature is a built-in extension** registered through a
public `ExtensionContext` (`ctx`) API. Start **in-process**; defer sandboxing to
a later phase if/when third-party extensions become real. The registry pattern
preserves the option to sandbox later without rewriting features.

## Consequences

- Lean core, modular by construction, cheap to build for v1, no perf cost for
  trusted built-ins.
- The registry keeps the sandbox option open.
- No isolation today — this rests on a trusted-code assumption; it must be
  revisited when untrusted third-party code can load (see [0015](./0015-phased-security-model.md),
  [0019](./0019-runtime-extension-loading.md)).
- **Capability lives in core; UI is pure presentation.** A feature's capability
  lives in core and owns its command; a UI surface (status-bar button, menu item)
  is a pure-presentation extension that routes button → `ctx.executeCommand` → the
  core command/service — so button, menu, and keybinding can't drift, and the UI
  is removable without removing the capability.

## Alternatives considered

- **Sandboxed host in v1** — rejected: cost, runtime overhead, and premature for a
  first-party-only phase.

## References

- Originally logged in the extension architecture decisions log (2026-05-23), now
  retired into this ADR set (see git history).
