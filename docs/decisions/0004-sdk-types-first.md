---
status: accepted
date: 2026-05-29
---

# 0004. The public `@silo-code/sdk` is types-first, not a heavy runtime

## Context

The published SDK could ship the full host runtime, or just the contract that
extensions compile against.

## Decision

`@silo-code/sdk` publishes the contribution-point **types** (`ExtensionContext`,
`SidePanel`, `Command`, the consumer-service interfaces, …) plus only **tiny
runtime helpers** (`useServiceState`, `DND_MIME`, and later `createStore`). The
host injects the real API implementation at load time (`activate(ctx)`);
extensions compile _against_ the SDK and never bundle the core.

## Consequences

- Tiny published artifact; a stable third-party contract — the VS Code
  (`vscode.d.ts`) / Obsidian model, which our `activate(ctx)` shape already matches.
- Every type in `@silo-code/sdk` becomes a public API with breaking-change cost → keep
  the surface minimal and deliberate.

## Alternatives considered

- **A heavy runtime SDK** — rejected: bloat and churn, and it would couple
  extensions to host internals.

## References

- Decided 2026-05-29 (the SDK-types-first strategy).
  See [0013](./0013-trust-tiers-two-barrel-sdk.md).
