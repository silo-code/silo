---
status: accepted
date: 2026-06-02
---

# 0015. Phased security model for privileged primitives

## Context

In-process extensions are trusted code today, so full sandboxing is premature —
but the design must not foreclose it once untrusted (third-party / remote) code
can load.

## Decision

Don't build capability gating now, but: (a) keep `files` and `process` strictly
**host-mediated** (bank the chokepoint), and (b) design their signatures
**workspace-relative from day one** so path-scoping drops in naturally. Phases:

1. **Now** — trust-based, no gating.
2. ✅ **Near-term** — workspace path-scoping. _Shipped_ (see
   [RFC 0006](../proposals/0006-extension-permissions-sandbox.md) → Design;
   `extension-host/security/resolve-path.ts` + the scoped `files`/`process`
   wrappers).
3. ✅ **When third-party is real** — capability manifest + consent. _Shipped_
   (`silo.permissions` validated/persisted, a consent modal at install).
4. 🔴 **Long-term / untrusted** — sandboxed execution. _Not started_ — the phase
   that makes the manifest a real boundary rather than honest-extension hygiene.

## Consequences

- Cheap now; the chokepoints already exist; all options preserved.
- Loaded extensions currently run with the full `ctx` — acceptable for
  first-party, but it is the gate for remote install and a public marketplace.

## How this compares

The trust-based posture is **parity with the products Silo models on** — neither
sandboxes desktop extensions for security:

- **Obsidian** runs plugins **fully in-process** (Electron renderer, Node access);
  its only control is a consent screen plus community review. Architecturally
  identical to Silo today.
- **VS Code** runs extensions in a separate **Extension Host process**, but that's
  an _isolation_ boundary for stability/performance — the process keeps full
  Node privileges. Its security feature is **Workspace Trust** (folder-level
  restricted mode), not capability gating. Only its **web** extensions (vscode.dev)
  are truly sandboxed, because the browser forces a Web Worker realm.

So phases 1–2 reach parity at low cost; **sandboxing (phase 4) would put Silo
ahead of both** — a long-term differentiator, not a prerequisite for going public.
Until it lands, lean on the same controls they do (install-time trust, signing/
checksums on remote tarballs, review) and never imply the permission prompt is
containment. The concrete in-realm bypass that makes this necessary is the threat
model in [RFC 0006](../proposals/0006-extension-permissions-sandbox.md).

## Alternatives considered

- **Full capability manifest + gating in v1** — rejected: over-engineered for the
  trusted-only phase.

## References

- Related: [0010](./0010-persistent-process-sessions.md),
  [0019](./0019-runtime-extension-loading.md).
