---
status: implemented # draft | accepted | implemented | rejected | superseded-by NNNN
created: 2026-06-06
---

# 0012. Keyboard-navigation architecture

## Summary

The keyboard-navigation work on `feat/keyboard-focus-nav` (status bar, menus,
left side dock + workspaces panel) works, but it grew bottom-up: the same
mechanics are re-implemented per surface, a WebKit focus-paint quirk is hand-worked
around in each panel, and the cross-region moves (region cycle, Tab handoff,
click-to-enter) are three separate ad-hoc systems. Before building the keyboard
story for the remaining panels, consolidate it into two clean seams: a **headless
focus-group hook** (`useFocusGroup`) in the public SDK (so an extension author writes ~5 lines, not
~60, and gets the gotchas for free) and a host-internal **focus-region model**
that unifies region cycle + boundary-Tab + click-to-enter.

## Motivation

The split we landed on is sound: **the host gets focus _into_ a panel** (click,
region cycle, Tab handoff all target the panel's first tabbable), and **the panel
owns navigation _within_ itself**. An author "just builds an accessible component"
and the host finds it — that part should stay.

What's not clean is everything around it.

**1. Per-panel boilerplate + tribal WebKit knowledge.** `WorkspacesPanel.tsx` —
the reference impl — carries ~60 lines of focus plumbing: `focusedIndex` +
`listFocused` state, a single-tab-stop `tabIndex` per row, `onFocus`/`onBlur`/`onKeyDown`
wiring, arrow/Home/End math, Enter + ContextMenu-key handling, parking the tabstop
on the active row, and the non-obvious bit — the ring is driven by a `.focused`
**class**, not `:focus`, because WebKit doesn't repaint `:focus` for the
programmatic focus the region cycle/click perform. An author building the next
list panel (and we have several left) has to rediscover all of this, especially
the ring workaround, or their panel's focus ring silently won't show. That's too
hard, and it's the same answer every time.

**2. The same idea implemented N times.**

- _Item navigation_: hand-rolled in `WorkspacesPanel` **and** in `Menu.tsx` /
  `menu-nav.ts` — and about to be a third time for the next panel.
- _Keyboard-only ring_: the status bar uses a `data-kbd` attribute on the bar
  (`StatusBar.tsx`); the workspaces list uses a `.focused` class on the item.
  Two mechanisms for one concept.
- _Click-to-enter_: `enterActivePaneOnClick` (`side-pane-focus.ts`, for panes)
  and `useStatusBarFocus`'s mousedown handler (`StatusBar.tsx`) are the same
  behavior twice.
- _"Tabbable" selector_: a `FOCUSABLE` const exists in `side-pane-focus.ts`,
  another (subtly different, and with the `tabindex=-1`-on-buttons bug we just
  fixed elsewhere) in `dock-api-registry.ts`, plus copies in `Menu.tsx` and
  `Modal.tsx`. Four sources of truth.

**3. Cross-region focus is three ad-hoc systems.** Region cycle
(`cycleRegionFocus` + `currentArea` + `focusArea` + a hardcoded `AREA_ORDER`),
the Tab handoff (`installSideDockTabHandoff`, **left-only**, DOM-queries the "last
tabbable"), and click-to-enter all express the same notion — "regions in a left→
right order, each with an entry-focus" — but don't share it. The Tab handoff in
particular is a one-off patch, not a model; generalizing it to right/center
boundaries means more one-offs.

**4. Undocumented DOM-convention contract.** All of the above keys off structural
selectors (`.side-pane[data-slot]`, `.center-body .dock-host[data-active]`,
`.tab-pane[data-active]`, `.status-bar`). It works, but it's an implicit contract
no one declared.

## Design

Two seams — one public (the big win), one host-internal.

### A. `useFocusGroup` — a headless hook in `@silo-code/sdk`

It's the one primitive for any **focus group** — a set of peer items that share a
single tab stop and navigate with arrows — i.e. lists, menus, toolbars, tablists,
radio groups, and grids, not just lists. The SDK already ships runtime hooks
(`useServiceState`), so a headless, behavior-only hook is in-bounds and is the
right granularity (per ADR 0005 the UI library stays internal — we give behavior,
the author keeps markup + styling, à la react-aria/downshift). Sketch:

```ts
const group = useFocusGroup({
  count: workspaces.length,
  start: activeIndex,            // where focus enters (e.g. the selected row)
  wrap: true,
  onActivate: (i) => service.activate(workspaces[i].id),
  onMenu: (i, anchorEl) => openWorkspaceMenu(workspaces[i], { anchor: anchorEl }),
});

return (
  <ul {...group.containerProps}>
    {workspaces.map((ws, i) => (
      <li key={ws.id} {...group.getItemProps(i)} className={cx(...)}>…</li>
    ))}
  </ul>
);
```

`useFocusGroup` owns, once and correctly:

- a single-tab-stop `tabIndex` (one item tabbable; the rest `-1`) so the panel is
  one Tab stop and the host's "first tabbable" entry lands on `start`;
- Arrow / Home / End navigation (orientation option for vertical/horizontal/grid);
- Enter/Space → `onActivate`, ContextMenu key / Shift+F10 → `onMenu`;
- focus tracking + **the WebKit-safe ring**: it sets a `data-focus-visible`
  attribute on the active item (driven by state, not `:focus`), and the host ships
  the default ring CSS keyed on that attribute — so every panel's keyboard ring is
  correct and identical without the author knowing the quirk exists.

Result: the panel drops ~60 lines to ~6, the gotcha is solved in one place, and
`Menu.tsx` can be refactored onto the same hook (collapsing the second copy).
`menu-nav.ts` / `workspace-list-nav.ts` index math folds in as the hook's
internals.

### B. Focus-region model (host-internal)

Replace the hardcoded `AREA_ORDER` + `currentArea` + `focusArea` + the left-only
Tab handoff with a small registry:

```ts
interface FocusRegion {
  id: string; // "left" | "center" | "right" | "statusbar"
  order: number; // left→right sequence
  contains(el: Element): boolean; // is focus in me?
  focusEntry(): boolean; // put focus on my entry point; false if empty
}
```

The host derives everything from this one list:

- **Region cycle** (`Cmd+Alt+.` / `Cmd+Alt+,`) = step `order` and `focusEntry()`.
- **Boundary Tab** = when Tab would leave a side dock's last tabbable,
  `focusEntry()` the next region (generalizes the former left→center handoff to
  every side-dock boundary). The center is deliberately excluded: the editor /
  terminal keep the Tab key (indent / completion), so you enter the center ready
  to type and leave it via the region cycle or a click, not Tab.
- **Click-to-enter** = `contains`/`focusEntry` on pointer-down on a region's
  background (one implementation for panes _and_ the status bar).

The docks register their regions; the structural selectors become the region
implementations instead of being scattered. `focusGen` (the retry-cancel token)
and `retryFocus` stay as-is — they're the one genuinely subtle bit and they're
already isolated.

### C. Consolidate the leaf utilities

- One `FOCUSABLE`/tabbable selector (host-internal, in say `extension-host/dom`),
  imported by the region model, `Menu`, `Modal`; the SDK focus-group hook gets its own
  copy on the public side.
- Fold `enterActivePaneOnClick` + `useStatusBarFocus`'s mousedown into the region
  model's click-to-enter.
- Retire the `data-kbd`-on-bar / `.focused`-on-item split in favor of the hook's
  single `data-focus-visible` mechanism.

## Alternatives considered

- **Host-managed panel focus (declarative).** The panel declares "I'm a list" and
  the host drives navigation. Rejected: panels differ (list vs tree vs form vs
  grid); the host can't own within-panel semantics without becoming rigid. A
  headless hook keeps the author in control of behavior and markup.
- **A styled `<List>`/`<Tree>` component in the SDK.** Rejected per ADR 0005 (UI
  library internal) and because it dictates markup/looks. Headless is the right
  granularity.
- **Leave it as-is, copy the workspaces panel per panel.** Rejected — that's the
  status quo this RFC exists to avoid; it multiplies the WebKit gotcha and the
  boilerplate across every future panel.
- **Do nothing host-side (only ship the hook).** Tempting (the hook is 80% of the
  author-facing value). But the region model is what stops the Tab-handoff
  one-offs from accumulating; worth doing, just sequence it second.

## Decision

**Implemented.** Shipped in this order (the hook is the high-value,
author-facing piece, so it landed before keyboard nav for the remaining panels):

1. **`useFocusGroup` in the SDK** + host default ring CSS; refactored
   `WorkspacesPanel` onto it as the proof, then `Menu` (which shares the hook's
   `focusGroupNextIndex` index math but keeps its own document-level key handling).
2. **Unified the keyboard-only ring** on the hook's `data-focus-visible`.
3. **Focus-region model** (host-internal, `focus-regions.ts`); folded in the
   region cycle, the side-dock boundary-Tab handoff, and click-to-enter.
4. **Consolidated `FOCUSABLE`** into `focus-dom.ts`.

Items 1–2 were public-surface work (new SDK members → docs per the
self-documentation rules + roadmap entries). Items 3–4 are internal and invisible
to authors.

The center dock is intentionally **not** a single Tab stop: it keeps the
type-on-entry model (Tab enters it ready to type; you leave via the region cycle
or a click), and returning to it restores the same tab you left.

The crystallized decision is recorded as ADR
[0021](../decisions/0021-keyboard-navigation-architecture.md); the user-standpoint
behavior the tests pin lives in
[`docs/keyboard-navigation.md`](../keyboard-navigation.md).
