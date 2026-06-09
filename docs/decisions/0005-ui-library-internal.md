---
status: accepted
date: 2026-05-29
---

# 0005. The component library (`@silo-code/ui`) stays internal

## Context

Should Silo's built-in UI components be a public SDK surface that extensions can
import?

## Decision

`@silo-code/ui` is `private: true`. Built-ins consume it; **third-party extensions do
not get it as a dependency surface.** Extensions extend the app through
contribution points + types (and webview-style escape hatches later), not by
importing host components.

## Consequences

- Avoids every exported component becoming a forever breaking-change liability
  (VS Code deliberately never exposed its UI toolkit for this reason).
- We can **promote** components to public later; we can't un-publish an API.
- Extensions can't reuse host components — by design (they theme via the
  [token contract](./0017-css-theming-contract.md)).

## Alternatives considered

- **A public component library** — rejected: permanent compatibility liability.

## References

- Decided 2026-05-29.
