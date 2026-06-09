---
status: accepted
date: 2026-06-03
---

# 0018. Host-owned UI chrome: modals and the unified menu primitive

## Context

Modals and floating menus need consistent styling, correct z-stacking, and focus
management. Per-extension implementations fragment the UX and fight over z-index.

## Decision

The host owns floating chrome:

- **Modals** — `ctx.ui.confirm` / `ctx.ui.prompt` for the common shapes plus
  `ctx.ui.showModal` for arbitrary custom content, all rendering into a
  host-managed stack; a host modal manager assigns each modal's z-index inline
  from a base that sits above Settings but below floating menus (so a dropdown
  opened _inside_ a modal still clears it). Only a host authority can order z
  reliably. The `<Modal>` component itself stays **host-internal** (core-only);
  the public surface is the imperative `ctx.ui.*` methods, so the types-first SDK
  ([0004](./0004-sdk-types-first.md)) takes on no runtime react-dom/valtio
  dependency.
- **Menus** — **one** host primitive, `ctx.ui.showMenu`, renders **every**
  floating menu (right-click context menus _and_ button-anchored dropdowns),
  themed via a deliberately minimal `--silo-menu-*` family, with cascading
  submenus.

## Consequences

- Consistent, correctly-stacked chrome; extensions get theming + behavior for free.
- The host owns more UI surface.

## Alternatives considered

- **Extension-owned modals/menus** — rejected: fragmented UX, z-index/focus fights,
  divergent menu variants.

## References

- Related: [0017](./0017-css-theming-contract.md). Shipped 2026-06-03.
