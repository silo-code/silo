---
status: accepted
date: 2026-07-31
---

# 0029. Adornments vs registration

## Context

Extensions contribute two different kinds of chrome:

1. **Long-lived contribution points** — menus, toolbar items, side panels,
   workspace sections. The extension installs them for its session; visibility
   may be conditional, but the contribution _point_ is permanent.
2. **Ephemeral chrome on a target** — a busy spinner on a terminal tab, a
   status row under a workspace name, a badge next to it. These appear while a
   condition holds (or flash briefly) and then go away.

RFC 0021 introduced dock-generic `ctx.registerTabDecoration` using the
**register** verb for the second kind. That metaphor collides with permanent
contributions and invited a shared `ctx.tabs` bag that would also cover future
side-panel tabs — even though side-panel tab chrome should stay thinner and
owner-only.

## Decision

1. **Register** stays for permanent contribution points (`registerMenuItem`,
   `registerToolbarItem`, `registerSidePanel`, `registerSection`, …).
2. **Adorn** is the metaphor for ephemeral chrome. Verbs: `set` / `clear` /
   `flash` / `bind`.
3. **CenterDock tab adorn** lives on the existing domain services — not a new
   `ctx.tabs` property:
   - `ctx.editors.setIcon` / `clearIcon` / `bindIcon` and
     `setIndicator` / `clearIndicator` / `flashIndicator` / `bindIndicator`
   - `ctx.terminals` mirrors the same verbs for session ids
4. **Leading icon** = `ReactNode` (app artwork). **Trailing** chrome on
   CenterDock tabs is either a **static Phosphor indicator** (optional chip /
   filled / color) or a host-owned **Activity** ([ADR 0030](./0030-activity-chrome.md))
   via `setActivity` / … — never extension-chosen motion icons. (Amended by
   ADR 0030; tab `animation` presets removed.)
5. **Workspace status and badges** use the same adorn verbs on
   `ctx.workspaces` (`setStatus` / `clearStatus` / `bindStatus`, and the badge
   equivalents). Status rows carry `activity?: Activity` (ADR 0030). `bind*`
   for status/badge returns an **array** per target (legacy provider shape);
   tab `bind*` returns a **single** adornment or `null` — intentional
   asymmetry documented in the SDK.
6. **Side-panel tab adorn** is a separate, thinner surface (owner handle from
   `registerSidePanel`). It is **not** shared with center tabs. Design lives in
   a follow-up RFC; not implemented with this decision.
7. Branch-only `ctx.registerTabDecoration*` is **removed**. Main-shipped
   `ctx.terminals.registerTabDecoration*` and
   `ctx.workspaces.registerStatus` / `registerBadge` remain as **deprecated
   shims** onto the adorn APIs.

## Consequences

- Extension authors learn one verb family (`set`/`clear`/`flash`/`bind`) across
  tabs and workspace rows without a new top-level `ctx` bag.
- Center and side tab chrome can evolve independently — side stays owner-only
  and simple.
- Existing terminal-monitor / agent-monitor code keeps working via deprecated
  terminals shims until migrated.
- Docs and the Decorations demo speak of “decorations” as a product category;
  API nouns are icon / indicator / status / badge.

## Alternatives considered

- **`ctx.tabs` with a dock-extensible `TabRef`** — deferred/rejected for this
  wave; expands `ctx` properties and couples center richness to side simplicity.
- **Flat `ctx.setTabIndicator` methods** — workable but noisier on the root
  surface than putting verbs on `editors` / `terminals`.
- **Making workspace `bind*` return a single row** — more signature-uniform
  with tabs, worse ergonomics for “N status lines from one projection.”

## References

- [RFC 0021](../proposals/0021-follow-ups-extension-sdk.md) (historical register
  wording for toolbar + tab chrome)
- [RFC 0022](../proposals/0022-side-panel-tab-adornments.md) (side-panel owner
  handle — draft)
- ADR 0002 (imperative registration)
