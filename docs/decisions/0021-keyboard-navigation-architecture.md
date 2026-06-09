---
status: accepted
date: 2026-06-08
---

# 0021. Keyboard-navigation architecture: headless focus-group hook + host focus-region model

## Context

Keyboard focus was built bottom-up, one surface at a time (status bar, menus, the
left side dock + workspaces panel). The mechanics worked but were re-implemented
per surface: item-navigation math lived in both the workspaces panel and the menu;
the keyboard-only ring used a `data-kbd` attribute in one place and a `.focused`
class in another; click-to-enter and the "tabbable" selector each had multiple
copies; and the cross-region moves — region cycle, boundary-Tab handoff, and
click-to-enter — were three separate ad-hoc systems keyed off undeclared
structural selectors. A WebKit quirk (it won't repaint `:focus` for programmatic
focus) had to be rediscovered and hand-worked-around in every panel, or that
panel's focus ring silently wouldn't show. With several panels still to build, the
cost was about to multiply. The full design rationale is RFC
[0012](../proposals/0012-keyboard-navigation-architecture.md).

## Decision

Consolidate keyboard navigation into two clean seams:

- **`useFocusGroup` — a headless hook in the public `@silo-code/sdk`.** The one
  primitive for any focus group (a set of peer items sharing a single tab stop,
  navigated with arrows): lists, menus, toolbars, tablists, radio groups, grids.
  It owns the single-tab-stop `tabIndex`, arrow/Home/End navigation, Enter/Space →
  activate and ContextMenu-key → menu, and the **WebKit-safe keyboard-only ring**
  via a state-driven `data-focus-visible` attribute (the host ships the matching
  ring CSS). Behavior-only, à la react-aria/downshift — the author keeps markup and
  styling, consistent with the UI library staying internal
  ([0005](./0005-ui-library-internal.md)). A panel drops ~60 lines of focus
  plumbing to ~6.
- **A host-internal focus-region model.** One declared list of top-level regions
  (Left → Center → Right → Status bar), each with `contains` + `focusEntry`, drives
  the region cycle (`Cmd+Alt+.` / `Cmd+Alt+,`), the side-dock boundary-Tab handoff,
  and click-to-enter — replacing the hardcoded area order and the left-only handoff.

The host gets focus **into** a panel (click, region cycle, Tab handoff all target
the panel's first tabbable); the panel owns navigation **within** itself. The
center dock is intentionally **not** a single Tab stop — the editor/terminal keep
the Tab key, so you enter it ready to type and leave via the region cycle or a
click, and returning restores the tab you left.

## Consequences

- One place to get the WebKit ring quirk right; every panel's keyboard ring is
  correct and identical for free.
- The next panel is a few lines, not a re-derivation — the file explorer tree was
  the first to land on the shared model (layering its own ←/→ expand-collapse over
  the hook's vertical core).
- `useFocusGroup` is public SDK surface — it carries the usual obligations (TSDoc,
  barrel re-export, generated reference, a roadmap badge, a guide).
- The host owns more of the focus story (the region model is internal and invisible
  to authors), and the formerly-implicit DOM-convention contract is now expressed as
  region implementations rather than scattered selectors.

## Alternatives considered

- **Host-managed (declarative) panel focus** — the panel declares "I'm a list" and
  the host drives navigation. Rejected: panels differ (list vs tree vs form vs
  grid); the host can't own within-panel semantics without becoming rigid.
- **A styled `<List>`/`<Tree>` component in the SDK** — rejected per
  [0005](./0005-ui-library-internal.md); it dictates markup and looks. Headless is
  the right granularity.
- **Ship only the hook, skip the region model** — deferred, not rejected: the hook
  is most of the author-facing value, but the region model is what stops the
  Tab-handoff one-offs from accumulating, so it was sequenced second rather than
  dropped.

## References

- Design + motivation: RFC
  [0012](../proposals/0012-keyboard-navigation-architecture.md) (implemented).
- Related: [0004](./0004-sdk-types-first.md) (types-first SDK),
  [0005](./0005-ui-library-internal.md) (UI library internal).
- Behavior contract the tests pin: [`docs/keyboard-navigation.md`](../keyboard-navigation.md).
- Author guide: [`apps/docs/guide/keyboard-navigation.md`](../../apps/docs/guide/keyboard-navigation.md).
  </content>
  </invoke>
