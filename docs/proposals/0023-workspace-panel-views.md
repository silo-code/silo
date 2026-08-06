---
status: accepted
created: 2026-08-06
---

# 0023. The Navigator — a side panel of contributed views

## Summary

Turn the Workspaces side panel into the **Navigator**: a container whose body is
one of several registered **views**, chosen from a selector in its header. The
workspace list becomes a view like any other — `core.workspaces` registers it
through the same public API a third-party extension would. The first outside
consumer is the agent-monitor extension, which today ships its own **Agents**
side panel and instead contributes "Agents by status" and "Agents by workspace"
views. New surface: `ctx.registerNavigatorView`, plus a `"navigator"` toolbar
surface for the header's action buttons.

## Motivation

### Two panels competing to be the workspace navigator

agent-monitor registers a side panel (`ctx.registerSidePanel`, `location: "left"`,
`order: 2`) that lands immediately below the host's Workspaces panel
(`core.workspaces`, `left`, `order: 1`). Both are navigators — clicking a row in
either one moves you somewhere else in the app — and they overlap almost
completely in what they show. The Agents panel already groups by workspace as one
of its two modes; the Workspaces panel already shows per-terminal agent activity
via agent-monitor's own `bindStatus` rows.

So the user has two answers to "where am I, and where do I go next", and no rule
for which one to trust. That is the whole problem: not that either panel is
wrong, but that the app presents the same navigation twice.

### Per-workspace panel state amplifies it

Side-panel visibility and the active tab per slot live in `SharedPanelState`,
which is snapshotted into the active workspace and swapped on switch. So _which_
of the two navigators you are looking at can change as you move between
workspaces. Switching workspace from the Agents panel can leave you looking at
the Workspaces panel in the workspace you land in — the navigator moved out from
under you.

This proposal does not change per-workspace panel state (that design is
deliberate, see the laptop-mode layout work). It removes the duplicate navigator,
which is the half that has no defensible reason to exist.

### The general gap

There is no way for an extension to say "I have a different useful projection of
the thing this panel is about." The choices today are: register a whole new side
panel (permanent chrome, competing navigation, what agent-monitor did), or
squeeze into a workspace row via `registerSection` (RFC 0015) — which cannot
express a projection that isn't row-shaped. "Agents by status" groups
**terminals** across all workspaces; no amount of per-row contribution produces
it.

## Design

### SDK surface

```ts
interface NavigatorViewProps {
  /** True when this view is the one on screen. Inactive views stay mounted. */
  active: boolean;
}

interface NavigatorView {
  id: string;
  title: string;
  icon?: React.ReactNode;
  component: React.ComponentType<NavigatorViewProps>;
  order?: number;
}

interface ExtensionContext {
  registerNavigatorView(view: NavigatorView): Disposable;
}
```

Top-level, in the `register*` family beside `registerSidePanel` and
`registerSettingsPage` — ADR 0029 assigns `register` to permanent contribution
points, and a view is one. Consequences of living there rather than on a
service: it is **auto-tracked** on `ctx.subscriptions` like every other
top-level registration, and there is **no public `subscribeView`** — only
`core.navigator` ever observes the registry, so the read side stays on the
internal barrel next to `subscribeToolbarItems`.

There is **no `invalidateView`**: a view is a live React component that
re-renders on its own state, not a snapshot returned from a `provide()` call.

### Two extensions, not one

`core.navigator` owns the panel: the header, the view selector, mounting, and
the persisted choice of view. It contains no workspace code and no knowledge of
what any view shows.

`core.workspaces` keeps the workspace domain — commands, `Cmd+\`` cycling, the
status-bar item — and registers the workspace list as a view (`id: "workspaces"`,
`order: 0`). That's the load-bearing part of the split: the first-party list
goes through the identical public seam as a third-party view, so there is
exactly one way to add a way to navigate, and it's the way extension authors
have.

### Full-body replacement, and what a view gives up

The active view owns the entire panel body. It does **not** inherit the workspace
list's drag-reorder, groups, per-row context menus, badges, or status rows —
those belong to the built-in view's rendering, not to the panel.

This is the deliberate choice over a narrower "grouping strategy" hook, where the
host keeps painting workspace rows and the extension only supplies grouping and
ordering. That hook would preserve all row affordances in every view, but it
cannot express the motivating case: a view over terminals, not workspaces. A
projection API that can't project the thing that prompted it isn't worth the
constraint.

### The panel header

The Navigator's header is modeled on the github-prs extension's `.ghpr-header`
(selector on the left, actions pushed right):

```
┌───────────────────────────────┐
│ Agents by status  ▾       [+] │  ← host chrome, present in every view
├───────────────────────────────┤
│ …active view's body…          │
└───────────────────────────────┘
```

- **Left** — the view selector: the active view's title plus a caret, opening a
  checkable `ctx.ui.showMenu` list. With only one view registered it is an inert
  label; there is nothing to switch to.
- **Right** — **toolbar items on the `"navigator"` surface**, target
  `{ viewId }`. Not a bespoke `actions` array on `NavigatorView`: RFC 0021's
  toolbar model already provides command-backed _and_ menu-backed controls with
  `icon` / `title` / `tooltip` / `order` / `when` / `checked`, host-painted
  chrome, and a shared renderer (`ContributedToolbar`). Reusing it means views
  get buttons and dropdowns for free, and an action can scope itself to one view
  with `when` or appear across all of them by omitting it.

The add-workspace `+` is the proof: `core.workspaces` registers it as an
unscoped menu-backed item, so creating or reopening a workspace stays one click
away from whichever view is on screen — and `core.navigator` still knows nothing
about workspaces.

### Ordering, selection, and lifetime

- Views sort by `order` (missing sorts as `0`); the workspace list registers at
  `0`. Nothing is pinned — `"workspaces"` is merely the id the panel _prefers_
  when the user hasn't chosen, falling back to the first registered view if it
  isn't there at all.
- The active view is persisted in `core.navigator`'s `ctx.storage.global` under
  `activeView` — **global, not per-workspace**. A per-workspace lens would
  recreate the exact confusion this proposal removes.
- Selection resolves at render: a saved id that is no longer registered falls
  back **without rewriting storage**, so disabling and re-enabling an extension
  restores the user's choice.
- Views mount on first activation and stay mounted, hidden when inactive — the
  same `mountedIds` pattern `PanelPane` uses for side panels. That is what
  `NavigatorViewProps.active` is for: a mounted-but-hidden view can throttle its
  own work.
- Each view renders inside the host `ErrorBoundary`. A third-party view now
  occupies the app's most important panel; a crash in one must not take the
  workspace list down with it.

### The panel id changes

The side panel's id goes from `"workspaces"` to `"navigator"`. A workspace
record keys its panel state by panel id — slot override, order, visibility,
scroll position, and the panel's own storage bag — so the rename ships with a
one-time key rewrite (`state/panel-id-migration.ts`) applied as each record
loads. Without it, anyone who had moved or split the panel would silently find
it back at its default placement.

### One Open Workspace menu

Three surfaces show the "saved workspaces / New workspace…" menu: the
Navigator's `+`, the workspace status-bar item, and the CenterDock empty state.
Before this change the host and `core.workspaces` each had a copy, with a
comment telling the next reader to keep them in sync. The builder moves into the
host and is published as `ctx.workspaces.getOpenWorkspaceMenuItems()`, which
`core.workspaces` then consumes like any other extension — so the public API has
a first-party caller from day one rather than being surface built ahead of a
consumer.

### Relationship to existing decisions

**RFC 0015 (workspace extension contributions)** established that the workspace
surface has curated, named seams for extensions: `registerSection` mounts a
component inside every workspace row, `registerPropertyPage` adds a tab to the
workspace properties modal. Views are the same philosophy — a named seam on a
host-owned surface, not a general "render into any panel" capability — with a
larger blast radius, since a view replaces a body rather than decorating a row.
The mitigations for that blast radius are the ones above: host-owned header,
built-in view always present and always first, error boundary, storage fallback.

**ADR 0029 / RFC 0022 (side-panel tab chrome is owner-only)** are about a
different axis and are not contradicted. Those restrict who may _adorn a side
panel's tab_ — deliberately owner-only, via a handle returned from
`registerSidePanel`, to avoid a `panelId` free-for-all where any extension
decorates any panel's chrome. A view is not addressed by `panelId`: an extension
cannot name an arbitrary panel and take it over. It contributes to the
Navigator, a named surface that exists to be contributed to. If a general "views
for any side panel" API is ever wanted, it should be designed against RFC 0022's
owner-handle model — the panel's owner opting in — not by generalizing this
one.

## Alternatives considered

- **Grouping-strategy hook** — host keeps rendering workspace rows, extension
  supplies grouping + ordering. Preserves every row affordance in every view, but
  cannot express "agents by status" (terminals, not workspaces), which is the
  motivating case. Rejected.
- **Keep the standalone Agents panel** and fix only the state scoping (make
  side-panel visibility / active tab global rather than per-workspace). Smaller,
  no new SDK surface, and it does address the "the navigator moved" symptom — but
  it leaves two competing navigators, so a second navigational extension
  reproduces the problem. Deferred, not rejected: it remains a reasonable follow
  up if per-workspace panel state proves to be the bigger irritant in practice.
- **One "Agents" view with an internal grouping menu** instead of two registered
  views. Smaller migration for agent-monitor, but produces a menu inside a menu —
  the panel's view selector and the extension's grouping selector are the same
  kind of control at two levels. Rejected in favour of one flat list.
- **Keeping the panel called "Workspaces"** and adding views to it. Rejected once
  the list stopped being the only thing it could show: a panel named for one of
  its views misnames the container.
- **`ctx.navigator.registerView`** (a new `ctx` namespace) or leaving it on
  `ctx.workspaces`. The first adds a namespace for a single method; the second
  keeps saying "workspace view" for a panel that is no longer the workspaces
  panel. Rejected in favour of the top-level `register*` family.
- **A bespoke `actions` array on `NavigatorView`.** Rejected: it would
  re-implement ordering, `when`/`checked`, icon resolution and menu anchoring
  that toolbar items already do.
- **Renaming `core.workspaces` to `core.navigator`**, or splitting nothing at
  all. The extension is the workspace domain — commands, cycling, the status
  item — and only _contributes_ the workspace view; naming it after the panel
  would misdescribe it, and would orphan the suppression flags in its storage
  bag.
- **A generic `ctx.layout.registerPanelView(panelId, view)`** for any side panel.
  Rejected for the reason ADR 0029 rejected shared `ctx.tabs`: it invites
  non-owners to take over arbitrary panels, and no owner ever opted in.
- **Contributed header actions in v1** — deferred until a view actually needs
  one; views can render their own toolbar today.

## Decision

Accepted. Implement `ctx.registerNavigatorView` and the `"navigator"` toolbar
surface; split the panel into `core.navigator` (container) and `core.workspaces`
(the workspace list as a registered view); publish
`ctx.workspaces.getOpenWorkspaceMenuItems()` as the one Open Workspace menu; and
migrate agent-monitor from its standalone Agents side panel to two views.
Per-workspace side-panel _state_ is explicitly out of scope.
