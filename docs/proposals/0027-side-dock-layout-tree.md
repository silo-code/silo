---
status: implemented
created: 2026-08-21
---

# 0027. SideDock layout tree — free-form splits inside a side dock

## Summary

Replace the SideDock's fixed **Top Slot / Bottom Slot** pair with a per-dock
**layout tree**: nested row/column splits whose leaves are panes, each pane
holding an ordered set of Side Panels behind one tab bar. This makes
side-by-side panels possible in a side dock, removes the "at most one split per
column" cap, and lets a user arrange a crowded right dock the way they already
arrange the CenterDock.

The two docks stay. This proposal changes a dock's **interior**, not the shell:
left and right remain the top-level, independently collapsible containers that
Peek, Laptop Mode, focus regions, and `ctx.layout` are all written against.

The compatibility story rests on one split: **`sidePanelLocations` keeps owning
membership (which panel is in which pane), and the tree owns only geometry.**
Because the four legacy slot strings become the ids of the four initial panes,
no persisted map changes shape and no public SDK surface an extension actually
consumes changes at all.

## Motivation

### The right dock has outgrown one column of tabs

Enough extensions register side panels now — Navigator, git explorer,
agent-monitor, follow-ups, and every third-party panel from the registry — that
a dock is a long row of tabs competing for one strip of horizontal space. The
only relief the app offers is a single vertical split per dock, which buys one
extra tab bar and nothing else.

The user-facing ask is ordinary: _put two panels side by side in the right
dock_, or _stack three, not two_. Neither is expressible today.

### The wall is the enum, not the rendering

`SidePanelSlot` is a closed positional union
(`"left" | "right" | "left-bottom" | "right-bottom"` — `packages/sdk/src/domain-types.ts`)
and it is load-bearing in four places at once:

- `sidePanelLocations` — panel id → slot (membership)
- `sidePanelOrder` — panel id → sort index within its slot
- `activeSidePanelTabs` — slot → last-active panel id
- `side-pane-registry` — slot → imperative `SidePaneController`

`SideColumn.tsx` then hardcodes the geometry the enum implies: one
`PanelGroup direction="vertical"` with exactly two `Panel`s, and
`TabBar.canSplitColumn()` explicitly refuses a second split. Adding a
`left-right` member (or quadrant members) buys one shape and re-buys the same
wall immediately — which is the stopgap the engineering principles rule out.

The general form of the problem is a tree, and the app already has one: the
CenterDock's dockview grid. This proposal gives the SideDock the same
expressiveness with a much smaller model, because a SideDock needs no floating
groups, no popouts, and no cross-dock grid.

### Split sizes are currently not really persisted

Today the one vertical split's sizes come from `react-resizable-panels`'
`autoSaveId={"app:side-split-<location>"}` — raw percentages in `localStorage`,
global, not per workspace and not per layout mode. So a Laptop Mode session
silently rewrites the normal-width split. That's already a latent bug; a tree
makes it unavoidable to fix, since sizes have to live in the tree nodes.

## Design

### The model

```ts
/** A leaf: one tab bar over an ordered set of Side Panels. */
interface SideDockPane {
  type: "pane";
  /** Opaque, stable, globally unique across both docks. The four legacy
   *  values ("left", "left-bottom", "right", "right-bottom") are valid ids
   *  and are exactly what migration produces. */
  id: string;
}

interface SideDockSplit {
  type: "split";
  /** "row" = side-by-side, "column" = stacked. */
  direction: "row" | "column";
  children: SideDockNode[];
  /** Percentages of the parent, `children.length` long, summing to 100. */
  sizes: number[];
}

type SideDockNode = SideDockSplit | SideDockPane;

/** One tree per dock. */
interface SideDockTrees {
  left: SideDockNode;
  right: SideDockNode;
}
```

n-ary rather than binary: `children` of arbitrary length keeps three stacked
panes as one `column` node instead of a right-leaning chain, which is what makes
the resize handles behave like the user expects (dragging the middle handle
moves two neighbors, not a subtree).

### Geometry and membership stay separate

The tree says nothing about which panels live where. Membership stays exactly
where it is:

- `sidePanelLocations: Record<panelId, paneId>` — user overrides
- `SidePanel.location: "left" | "right"` — the registered default, unchanged
- `sidePanelOrder: Record<panelId, number>` — order within a pane, unchanged
- `activeSidePanelTabs: Record<paneId, panelId>` — unchanged

This is the whole compatibility trick, and it works because slot strings were
_already_ opaque map keys everywhere except the two positional helpers
(`topSlot`/`bottomSlot`/`isTopSlotOfColumn` in `side-column-helpers.ts`) and the
hardcoded render. Those helpers are what this RFC deletes; the maps survive
untouched.

`usePanelsForSlot(paneId)` becomes: panels whose effective pane id is `paneId`,
where _effective_ is `sidePanelLocations[id]` if that id names a pane **that
exists in the current tree**, otherwise the pane the panel's registered
`location` resolves to (see _Unknown pane ids_ below).

### Rendering

`SideColumn` becomes a recursive renderer over the tree — `PanelGroup` per
split node, `Panel` per child, `PanelPane` per leaf. `react-resizable-panels` is
already the dependency and already renders the one hardcoded split, so nothing
new enters the dep graph and `PanelPane` changes by little more than a rename of
its `slot` prop to `paneId`.

Sizes come from the node's `sizes` array and are written back on drag, replacing
the `autoSaveId` mechanism entirely.

### Invariants

Three rules, all pure logic, all unit-testable without a DOM (per
`.agents/skills/silo-testing/SKILL.md`):

1. **Empty panes collapse.** When the last panel leaves a pane, that leaf is
   removed and its size is given to its siblings; a split node left with one
   child is replaced by that child. A dock whose tree empties out entirely
   normalizes back to a single root pane and renders today's `EmptyColumn`.
2. **A pane has a minimum.** `MIN_PANE_PX` (~180px) for a `row` split,
   `MIN_PANE_PX_VERTICAL` (~80px, roughly a tab bar plus a few rows) for a
   `column` split. A split that cannot give every child its minimum is refused
   at the drop, not created and then clamped.
3. **Sizes normalize.** Any persisted `sizes` array that is the wrong length or
   doesn't sum to 100 is redistributed evenly on load rather than rejected — a
   hand-edited or partially-written file loses its proportions, never its
   panels.

### Unknown pane ids

Today a `sidePanelLocations` entry naming a slot that isn't rendered means the
panel silently disappears — `usePanelsForSlot`'s `effective === slot` test just
never matches. With user-created pane ids this stops being a theoretical case
(an uninstalled extension, a hand-edited file, a downgrade — see
_Compatibility_), so it needs a real rule:

> A panel whose recorded pane id is not present in the current tree **renders
> in the first pane, in tree order, of the dock its registered `location`
> names**. Resolution is non-destructive: the `sidePanelLocations` entry is
> left exactly as written.

The non-destructive half matters more than it looks. Pruning the unrecognized
entry would be the obvious move, and it is wrong in the two cases that actually
produce one:

- **A downgrade** (see _Compatibility_) — the old build prunes the pane id it
  can't parse, so upgrading again finds the tree intact but every relocated
  panel back at its default. Resolve-don't-prune makes the round trip lossless:
  the panel sits in its default dock on the old build and returns to its pane on
  the new one.
- **An uninstalled extension** — its panel isn't registered, so a stale entry is
  inert and one map key wide. Keeping it means reinstalling restores the user's
  placement instead of dumping the panel back in the default dock.

There is no case where dropping the entry buys anything, so resolution stays a
pure read: no store writes from a render path, and nothing to unit test beyond
the resolver itself.

This rule is worth shipping in the **current** build, ahead of the tree — see
_Compatibility_.

### Drag and drop, including across docks

**Cross-dock drag is preserved, and gains capability.** It works today because
`getDropInfo` hit-tests `[data-slot]` anywhere in the shell via
`elementFromPoint` and `commitDrop` then performs a single
`setSidePanelSlot(panelId, targetSlot)` — the source dock is never consulted.
Pane ids are globally unique across both trees, so that assignment is
_identical_ under this proposal. Dropping a right-dock tab onto a left-dock pane
stays one map write.

What changes is the drop _zones_. `getDropInfo` returns `"top" | "bottom"`
today; it becomes five zones per pane — the four edges plus the center:

- **center** → join that pane's tab bar (with the existing tab-bar insertion
  index for ordering)
- **left / right edge** → split that pane's parent into a `row`, new pane on
  that side
- **top / bottom edge** → split into a `column`, new pane on that side

Edge bands are a fraction of the pane's short dimension, clamped, with an
overlay per zone. `canSplitColumn()` — the one-split cap — is deleted.

The consequence for cross-dock drag is that dragging a panel to the _edge_ of a
pane in the other dock creates a split **in that dock's tree** and lands the
panel in the new pane: one drag, one map write plus one tree edit, no special
case for "the other side". Dropping onto an empty dock still targets its root
pane, exactly as `EmptyColumn`'s `data-slot` does today.

The tab context menu keeps `Move to Left/Right Panel` (now meaning "the other
dock's first pane") and replaces `Move to Top/Bottom Pane` with `Split Right` /
`Split Down`.

### Persistence

The tree is per workspace, and it belongs with `sidePanelLocations` /
`sidePanelOrder` / `sidePanelVisibility` on the arrangement side of ADR 0035 —
so it appears twice:

- `SharedPanelState.sideDockTrees` — the per-workspace copy, which
  `WorkspaceInternal` picks up as an optional field like every other panel field
- `GlobalPanelLayout.sideDockTrees` — the shared copy, live while the "Global
  Side Panel Layout" flag is on

**One copy per scope, not one per layout mode.** An earlier draft of this
proposal gave the tree a Laptop Mode counterpart, matching collapse state and
column widths (ADR 0033). That is wrong, and the reason is worth recording: a
tree determines _which pane ids exist_, and `sidePanelLocations` — which names
those ids — is itself single-copy. Forking the tree per mode would let a panel's
recorded pane exist in one mode and not the other, and membership has no way to
express the fork that would follow. What genuinely needs to differ on a narrow
window is how wide a dock is and whether it's open, and ADR 0033 already makes
both of those per-mode.

So the tree is two fields, not four, and no mode-swap path is needed. If a `row`
split turns out to be too cramped on a narrow window, the fix is the minimum-size
rule flattening it at render — not a second persisted arrangement.

### Public SDK surface

Almost nothing moves, because almost nothing is exposed:

- **`SidePanel.location`** stays `"left" | "right"`. An extension declares which
  dock it wants by default and never names a pane. **Third-party extensions need
  zero changes.**
- **`SidePanelSlot`** is exported from the barrel but no `ctx` method accepts or
  returns it — it is a type with no call sites in the public API. Proposal:
  introduce `SidePaneId = string`, and keep `SidePanelSlot` as a `@deprecated`
  alias documenting the four legacy values. Anyone switching exhaustively over
  it (nobody, as far as the registry shows) keeps compiling.
- **`ctx.layout.toggleSidePanel(location)` / `setSidePanelCollapsed(location,
…)`** are unaffected — they address the dock, which still exists.
- **`ctx.layout.revealSidePanel(id)`** changes internally only: instead of
  `slot.startsWith("left")` it looks up which pane holds the panel and which
  dock that pane's tree belongs to.

Per `AGENTS.md`, `SidePaneId` and the `SidePanelSlot` deprecation go through the
full `silo-docs-sync` workflow in the same change.

### Host surfaces that key off slot

- **`side-pane-registry`** is already keyed by an opaque string — no change
  beyond naming.
- **`focus-regions.ts`** hardcodes `left | center | right | statusbar` and finds
  a dock's pane by DOM query. Regions stay three; the entry-point lookup
  enumerates the dock's panes in tree order and takes the first focusable.
- **`small-screen-mode.ts`** already treats a dock as a unit (collapse, peek,
  edge hotspot) and needs only the per-mode tree swap.
- **Tab-cycle commands** (`cycleSidePaneTab`) work per pane and are unchanged.

### Column width

`MAX_COLUMN_PX` is 800 and the default right dock is 340px. Two panes side by
side at `MIN_PANE_PX` need ~380px including the handle, so a `row` split is
physically impossible at the default width and cramped well below 600px. The
drop rule in _Invariants_ (refuse a split that can't satisfy the minimum) makes
this legible rather than broken, but a `row` split is only genuinely useful on a
wide dock — worth raising `MAX_COLUMN_PX` and saying so in the docs.

## Alternatives considered

**Widen the enum** (add `left-right`, or quadrant members). Cheapest possible
change and no tree. Rejected: it buys exactly one new arrangement, multiplies
the positional helpers, and hits the same wall on the next request. This is the
"stopgap meant to be replaced later" the engineering principles exclude.

**Use dockview for the SideDocks.** dockview already has the grid, the drag/drop
zones, and the serialization, and it would make the two docks and the CenterDock
one implementation. Rejected for now: Side Panels aren't dockview panel kinds,
and the SideDock's chrome is not dockview's — tab adornments (RFC 0022), the
side-panel visibility context menu, Peek, Laptop Mode collapse, and the focus
regions are all written against the bespoke pane DOM and would have to be
re-implemented inside dockview's tab model. It also puts dockview in the
ownership path for a dock that deliberately has no floating groups or popouts.
The tree above is a few hundred lines of pure, testable logic against a
dependency already in use for this exact split. Revisit if the SideDock ever
wants floating panes.

**One unified dock — free positioning across center and sides.** The literal
reading of "position anywhere, like the CenterDock": collapse the shell into a
single dockview grid where a panel can live anywhere. Rejected: the left/right
dock contract is what Peek, Laptop Mode, collapse, focus regions, and the whole
`ctx.layout` surface are defined against, and a Side Panel is a different kind of
thing from a Content Panel (persistent navigation chrome vs. workspace content).
Merging them trades a working product for a much larger one — explicitly out of
scope here.

**Keep sizes in `localStorage` via `autoSaveId`.** Rejected: it can't be
per-workspace or per-mode, which is already a bug (a Laptop Mode session
rewrites the normal-width split) and gets worse with N panes.

## Compatibility

### Forward — old state on a new build

Clean, and mostly by construction:

1. A workspace record with no tree gets one derived from its
   `sidePanelLocations`: for each dock, a root pane with the legacy id
   (`"left"` / `"right"`) and, if any panel names the `-bottom` slot, a `column`
   split adding a pane with the legacy `-bottom` id at the current 55/45 sizes.
2. Because the pane ids are _literally the legacy slot strings_,
   `sidePanelLocations`, `sidePanelOrder`, and `activeSidePanelTabs` need **no
   key rewriting at all**. The active tab in `right-bottom` stays the active tab
   in the pane now called `right-bottom`.
3. `GlobalPanelLayout` migrates by the same function.
4. Third-party extensions are unaffected — they never named a slot.

The migration is a pure function from `Record<panelId, legacySlot>` to
`SideDockTrees`, sitting next to `panel-id-migration.ts` with the same shape of
test.

### Backward — new state on an old build

This is the real gap, and it's worth stating plainly because Silo ships beta and
stable channels (ADR 0024), so downgrades happen.

An old build ignores the unknown `sideDockTrees` field harmlessly. But a panel
the user moved into a **newly created pane** has a `sidePanelLocations` value the
old build has never heard of, and today's `usePanelsForSlot` filters on
`effective === slot` — so that panel renders **nowhere**. Its state is intact and
it comes back on upgrade, but on the old build it is simply gone, with the
visibility menu still claiming it is visible.

The fix is the _Unknown pane ids_ rule above, and it needs to ship **one release
ahead of this RFC**: a small, independently correct patch to the current build
that falls back to the registered `location` for an unrecognized slot. It is
worth doing on its own merits (it also covers hand-edited state and stale
entries from uninstalled extensions), and it makes the downgrade degrade to "the
panel is back in its default dock" instead of "the panel vanished."

Because that fallback resolves without pruning, the downgrade is also
**lossless**: the old build never rewrites the pane ids it can't parse, so
upgrading again puts every panel back where the user left it.

## Out of scope

- Floating or popped-out Side Panels.
- Moving a Side Panel into the CenterDock, or vice versa.
- Per-pane sizing in px (the docks are px-sized; a pane is a percentage of its
  dock, which is the right unit for a nested split).
- Any change to how a Side Panel is registered.

## Domain language

The glossary (`docs/domain-language.md`) currently defines:

> **Slot**: A specific region within a SideDock. A SideDock splits into a Top
> Slot and a Bottom Slot.

That definition is positional and is exactly what this proposal removes. If
accepted, **Slot** is replaced by:

> **Side Pane**: A leaf of a SideDock's layout tree — one tab bar over an
> ordered set of Side Panels. A SideDock holds one or more, arranged by nested
> row/column Splits. _Avoid_: Slot (the retired positional term), region, zone

…and **Split** widens from "dividing a Slot or Group" to "dividing a Side Pane
or Group". `Group` keeps `pane` under its `_Avoid_` list, which now needs a
pointer to Side Pane to keep the two apart: a **Group** is a CenterDock concept
(dockview), a **Side Pane** is a SideDock concept.

The glossary is not edited while this RFC is `draft` — it records what is, not
what is proposed. Both edits land with the implementation.

## Implementation sketch

New:

- `packages/extension-host/src/state/side-dock-tree.ts` — the model, plus
  `normalize`, `paneIds`, `findPane`, `insertPane`, `removePane`,
  `resize`, `retainPanes`, and `treesFromLegacySlots`; all pure, all
  unit-tested. It lives in `state/`, not `layout/`: the trees are store state,
  and `state/` is a lint-enforced leaf that cannot import from `layout/`
- `.../layout/side-dock-drop.ts` — five-zone hit testing, pure given a rect

Changed:

- `sdk/src/domain-types.ts` — `SidePaneId`, `SidePanelSlot` deprecated
- `layout/SideColumn.tsx` — recursive renderer
- `layout/PanelPane.tsx` — `slot` → `paneId` (mostly a rename)
- `layout/TabBar.tsx` — five-zone drop, new split menu items, delete
  `canSplitColumn`
- `layout/side-column-helpers.ts` — delete the positional helpers, add tree
  queries, widen `getDropInfo`
- `layout/drag-state.ts` — widen `hoverZone`
- `state/types.ts`, `state/panel-state.ts`, `state/persistence-model.ts` — the
  two tree fields, clone + migration
- `extension-host/layout-service.ts` — `revealSidePanel` pane lookup
- `extension-host/focus-regions.ts` — enumerate panes per dock
- `extension-host/small-screen-mode.ts` — per-mode tree swap

Docs: `silo-docs-sync` for the SDK type, the glossary edits above, and a
roadmap entry.

Suggested sequencing:

1. Ship the unknown-pane-id fallback to the current build (downgrade safety).
2. Land `side-dock-tree.ts` + migration + tests, with the renderer still
   producing only the legacy shapes — no user-visible change.
3. Switch `SideColumn` to the recursive renderer.
4. Add five-zone drop, the split menu items, and the width work.

## Decision

**Accepted and implemented.** Built as described, with three changes made during
implementation and folded back into the text above:

1. **Non-destructive resolution.** The first draft had the unknown-pane-id rule
   _prune_ the stale `sidePanelLocations` entry. That is wrong: it makes a
   panel's placement lossy across exactly the downgrade/upgrade round trip the
   rule exists to protect, and across uninstalling and reinstalling the
   extension that owns the panel. Resolution is a pure read.
2. **One tree per scope, not one per layout mode.** See _Persistence_ — a tree
   decides which pane ids exist and `sidePanelLocations` names them, so a
   per-mode fork has no way for membership to follow it.
3. **The model lives in `state/`, not `layout/`.** The trees are store state,
   and `state/` is a lint-enforced leaf that cannot import from `layout/`.

Three places had to stop parsing meaning out of a pane id, all of which would
have silently answered "the right dock" for every user-created pane: the drop
hit-test, the panel font-size CSS rule, and the keyboard focus regions. Each now
reads a `data-location` attribute. That is the practical cost of the term
change, and the reason **Pane Id** is now in the glossary with "carries no
positional meaning" written into its definition.
