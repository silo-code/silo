---
status: implemented
created: 2026-08-27
---

# 0030. Navigator view arrangement — reorder, disable, and a stacked mode

## Summary

Give the user control over the Navigator's views. A new **Navigator** tab on the
Layout settings page holds two sections:

1. **Views** — reorder the registered views and toggle each one on or off. The
   order replaces `NavigatorView.order` as the source of truth for the View
   List; a disabled view is filtered out of the Navigator entirely.
2. **View arrangement** — choose between **One at a time** (today's View List +
   single Active View) and **Stacked**, where the View List disappears and every
   enabled view renders as a collapsible section, in the order from section 1.

Stacked mode is the "stacked collapsible sections" alternative that ADR
[0038](../decisions/0038-navigator-view-list.md) recorded as _deferred, not
rejected_. No change to the public `NavigatorView` interface and no SDK version
bump: the whole feature lives in `core.navigator`'s renderer, a preferences
store on its `ctx.storage.global`, and a settings panel it publishes for
`core.layout` to compose.

## Motivation

### The view list has no user controls

ADR 0038 made every registered view a permanent ~30px row at the top of the
Navigator, and noted the cost directly: "a user who installs several
view-contributing extensions pays for a list they may rarely touch." Today there
is no way to pay less. You cannot hide the Agents view when you are not running
agents, you cannot hide Workspaces if you navigate entirely from a file tree,
and you cannot put the view you actually use first — `NavigatorView.order` is set
by the extension author, and the built-in views both register at `0`.

### Switching is still switching

ADR 0038 cut view-switching from "open a menu, scan it, click" to one click at a
fixed position, but it is still an exclusive choice: with the Agents view open
you cannot see the workspace list, and vice versa. ADR 0038's own _Alternatives_
section calls this out — "Genuinely more capable — you stop switching and watch
two views at once — and tested well as a mockup" — and defers stacked mode only
because, at the time, it looked like an SDK contract change every existing view
would have to absorb. This RFC argues it is not one (see _A view needs no new
contract_ below), which removes the reason for the deferral.

### These two are one feature

Stacked mode renders views "in the order of the previous section" and skips the
disabled ones — it consumes the reorder/disable model directly. Designing them
apart would mean designing the ordering contract twice.

## Design

### Where it lives

- **`core.navigator`** owns everything real: a `navigatorPrefs` reactive store
  backed by its own `ctx.storage.global` (the same bag that already holds the
  `activeView` key), the resolution logic that turns saved order + disabled set
  into the list the panel renders, and a published `NavigatorSettingsPanel`
  component.
- **`core.layout`** adds the **Navigator** tab to its settings page and mounts
  `ctx.getExtension("core.navigator")?.api?.NavigatorSettingsPanel`. It holds no
  Navigator knowledge — the same bundled-only composition pattern as
  `silo.agents` → `core.agents-settings`. The Layout page grows a `Tabs` strip:
  the existing content becomes a **General** tab, **Navigator** is second, and
  the Navigator tab is hidden when `core.navigator` is not active.

`ctx.storage` is per-extension-namespaced, which is why the state cannot simply
live wherever the settings component is rendered; `getExtension` composition
keeps the owner and the editor in different extensions without a shared mutable
module or a promotion to host state (host state is for host-internal mechanics —
Global Side Panel Layout, small-screen mode — and Navigator view preferences are
the panel extension's own concern, not the host's).

### Preferences shape

```ts
interface NavigatorPrefs {
  /**
   * View ids in user order. A registered id not present here sorts after all
   * listed ids, by NavigatorView.order then title. An id here that is not
   * currently registered is retained untouched, so a view returns to its slot
   * when its extension is re-enabled.
   */
  viewOrder: string[];
  /** View ids the user has turned off. Retained across (un)registration, same
   *  as viewOrder entries. */
  disabledViews: string[];
  /** How the panel body is arranged. */
  arrangement: "one-at-a-time" | "stacked";
  /** Per-view collapsed state in stacked mode, keyed by view id. Absent = expanded. */
  stackedCollapsed: string[];
}
```

All four keys are **global**, matching `activeView` and every other Navigator
preference (per-workspace lenses are the confusion RFC 0023 removed). Stored as
plain arrays of ids so an unknown id is inert rather than an error.

### Resolving the view list

One pure function, `resolveViewList(registered, prefs)`, is the single source of
truth for both modes:

1. Start from `registered` (what `navigatorViewRegistry.list()` returns).
2. Sort: ids in `prefs.viewOrder` first, in that order; then the rest by
   `NavigatorView.order ?? 0`, then `title`.
3. Partition into `enabled` / `disabled` by `prefs.disabledViews`.
4. Guarantee **at least one enabled view**: if `disabledViews` would empty the
   list, the first view by the sort above is forced enabled (the settings UI
   also blocks the toggle that would get there, but the resolver is
   defensive — storage can arrive from another window).

`resolveActiveView` (RFC 0023's existing fallback) then runs against `enabled`
only. A saved `activeView` that is now disabled falls back to the first enabled
view **without rewriting storage**, so re-enabling it restores the choice —
identical to today's unregistered-view behavior.

### Section 1 — Views

A list of every **registered** view (views from disabled/unloaded extensions
are not registered, so they do not appear — you can only arrange what exists).
Each row:

- the view's `icon` (reserved column if any view has one, per the panel's own
  rule) and `title`;
- **up / down** buttons to move it (disabled at the ends). Not drag: the list is
  2–5 rows in a settings pane, there is no SDK reorder primitive, and up/down is
  keyboard-accessible for free. Drag is a later refinement if the list grows.
- an **enable toggle**. The last remaining enabled toggle is disabled with a
  tooltip ("At least one view must stay on").

Editing a row writes `viewOrder` / `disabledViews` through the `navigatorPrefs`
store; `core.navigator` subscribes and re-renders. There is **no separate
"default view" picker** — when no `activeView` is saved (or it resolved away),
the Navigator opens on the first enabled view, so moving a view to the top makes
it the effective default.

### Section 2 — View arrangement

A `RadioGroup` (or `SegmentedTabs`) with two options:

- **One at a time** — unchanged from today: the View List renders every enabled
  view as a row, the View Header names the Active View, one body is shown. ADR
  0038's "only one view → no View List" rule still applies, counting enabled
  views.
- **Stacked** — described next.

### Stacked mode

The View List is not rendered. Each enabled view, in `viewOrder`, is a
**collapsible section**:

```
┌─────────────────────────────┐
│ ▾ Workspaces          [+]   │  ← per-section View Header (data-focus-chrome)
│   …workspaces view body…    │
├─────────────────────────────┤
│ ▾ Agents        [Recent ▾]  │
│   …agents view body…        │
├─────────────────────────────┤
│ ▸ Changes                   │  ← collapsed: header only
└─────────────────────────────┘
```

- **Per-section View Header.** Each section carries its own header: a disclosure
  triangle, the view `title`, and that view's `"navigator"`-surface toolbar
  contributions (`ContributedToolbar surface="navigator" target={{ viewId }}`) —
  the same contributions that sit in the single View Header today, now scoped
  next to their view. Marked `data-focus-chrome` so keyboard region-entry skips
  past headers into a body.
- **Otherwise-unscoped chrome collapses to one section.** RFC 0023 left
  `core.workspaces`' Add-workspace **+** unscoped so it shows on every view's
  header. In one-at-a-time mode that's still one header, so nothing changes.
  In stacked mode it would repeat down the panel — so `core.navigator` exposes
  `stackedChromeHostViewId()` (the Workspaces section, or the top section if
  Workspaces is hidden/disabled), and `core.workspaces` `when`-scopes its **+**
  to that in stacked mode only. A view's _own_ scoped items (e.g. the Agents
  view's "View by") are unaffected — they were already `when`-bound to their
  view.
- **Sizing.** Each expanded section is content-height; the panel scrolls as one
  (preserving the "host tab-pane is the sole scroller" invariant every view
  assumes). A section body taller than a cap (proposed: ~60% of panel height)
  gets its own inner scroll so one long view cannot bury the sections below it.
- **Collapse state** is persisted per view id in `stackedCollapsed`. Default:
  every section expanded.
- **`active` does not apply in stacked mode.** Every rendered view's component
  gets `active: true`, regardless of collapse state. Collapsing a section is
  purely visual — the view keeps running. This is a deliberate trade: the
  `active`-based throttling a view does in one-at-a-time mode is off in stacked
  mode, in exchange for not having to define "is a collapsed section active"
  and not making views re-derive state every time they are expanded. Views are
  lightweight projections of `ctx` state; the cost is acceptable. (If a future
  view proves expensive enough that this bites, revisit — collapsed → `active:
false` is a compatible change.)
- **No Active View.** The `activeView` storage key is read only in
  one-at-a-time mode. In stacked mode, keyboard region-entry
  (`focusActivePaneContent`) lands in the **first expanded section's** body.
  Switching arrangement back to one-at-a-time restores the saved `activeView`.
- **One enabled view.** Rendered plain — the view's header and body, no
  disclosure control — mirroring ADR 0038's one-view rule for the View List. A
  section you cannot usefully collapse is pure chrome.

### A view needs no new contract

ADR 0038 deferred stacked mode because it seemed to change what a `NavigatorView`
_is_: "from 'owns the panel body' to 'owns a section that may be 80px tall,'
which is an SDK contract change every existing view has to absorb." It does not,
for this design:

- A `NavigatorView` still renders one component that owns a rectangle. In stacked
  mode that rectangle is a section rather than the whole body — a smaller box,
  not a different contract. A view that scrolls its own overflow (which every
  non-trivial view already does, because it cannot assume panel height today
  either) works unchanged.
- `active` is documented as "the view may throttle work while off screen" — a
  hint, not a guarantee. Always-`true` in stacked mode is within that contract;
  a correct view still functions, it just does not get the throttle opportunity.
- Per-section headers reuse the existing `"navigator"` toolbar surface with the
  same `{ viewId }` target. A view's `when`-scoped contributions land in its own
  section header with no change.

So the public interface, the `@silo-code/sdk` barrel, and the SDK version are
untouched. If implementation turns up a genuine need for new `NavigatorView`
surface, that is a checkpoint to stop and bring it back here — it is not
expected.

### Sequencing

One branch, `feat/navigator-view-arrangement`, three commits:

1. **This RFC** (`draft`).
2. **Section 1** — `navigatorPrefs` store, `resolveViewList`, the Navigator
   settings tab with reorder + disable, `core.navigator` consuming the resolved
   list in one-at-a-time mode. Shippable on its own; improves the existing mode.
3. **Stacked mode** — the arrangement radio and the stacked renderer.

On landing: RFC flips to `implemented`; a new ADR (0044) records the crystallized
decision and supersedes ADR 0038's "Stacked collapsible sections — deferred"
bullet; ADR 0038 and RFC 0023 get a superseding note; `docs/domain-language.md`
gains **View arrangement** and **Stacked view** in the Navigator section.

## Alternatives considered

- **A dedicated "Navigator" settings page** rather than a tab on Layout.
  Cleaner ownership (`core.navigator` registers its own page), but the Navigator
  is a side panel and the Layout page is where side-panel preferences already
  live (widths, Global Side Panel Layout, small-screen auto-hide). One more
  top-level rail entry for three controls lost to that.
- **Promote the prefs to host `store`**, like every other Layout-page setting.
  Consistent with the page, but those settings edit host-internal mechanics; a
  view's order and on/off state are `core.navigator`'s domain, not the host's.
  `getExtension` composition keeps the boundary without host state.
- **Drag-to-reorder** in section 1. Nicer at many rows, but there is no SDK
  primitive (the Agents panel hand-rolled a pointer-drag), it is not
  keyboard-accessible without extra work, and the list is short. Up/down now,
  drag later if warranted.
- **Collapsed section → `active: false`.** Would preserve the throttle hint, but
  forces a definition of "active" that spans focus, expansion, and visibility,
  and makes every expand re-wake a view. Deferred as a compatible future change
  if a heavy view needs it.
- **Draggable section splitters in stacked mode** (true VS Code Explorer). More
  capable, but fights the single-scroller model and is materially more code and
  state. Content-height + a per-section cap covers the common case; splitters
  can follow.
- **Per-workspace arrangement / view set.** Rejected for the reason RFC 0023
  rejected a per-workspace active view: the Navigator moving out from under you
  on workspace switch is exactly the disorientation the container exists to
  remove.
- **Disabling a view by disposing its registration** (signalling the extension).
  Rejected: an extension should not have to handle "my view was hidden," and
  re-enabling must be instant. A Navigator-side filter is cheaper and fully
  reversible.

## Decision

**Implemented as proposed.** The Layout settings page gained a General /
Navigator tab strip; the Navigator tab (composed from `core.navigator` via
`getExtension`, hidden when that extension is off) reorders and enables/disables
views and picks the arrangement. `core.navigator` owns a `navigatorPrefs` store
on its `ctx.storage.global` and the pure `resolveViewList` resolver; the panel
renders the enabled set in user order, one at a time or stacked.

Details settled during implementation, all matching the design here: `active`
is passed as always-`true` in stacked mode (collapse is purely visual); stacked
sections cap at `60vh` with their own inner scroll; and `core.workspaces`'
Add-workspace **+** stays unscoped in one-at-a-time mode but `when`-scopes to
the single section named by `core.navigator`'s `stackedChromeHostViewId()` in
stacked mode.

The crystallized decision — and the supersession of ADR 0038's deferred
"stacked collapsible sections" alternative — is recorded in ADR
[0044](../decisions/0044-navigator-stacked-arrangement.md).
