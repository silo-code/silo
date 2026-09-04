# ctx.registerNavigatorView

Add a view to the **Navigator** — the side panel you navigate the app from.

```ts
ctx.registerNavigatorView(view: NavigatorView): Disposable
```

The Navigator is a container. Each registered view is one projection of "where
can I go". Every registered view is listed by name at the top of the panel, so
switching is a single click and your view is visible to the user whether or not
it's the one on screen. The built-in **Workspaces** view (the workspace list) is
registered through this same API by `core.workspaces` — first-party and
third-party views are the same kind of thing.

## Example

```tsx
ctx.registerNavigatorView({
  id: "acme.agents",
  title: "Agents",
  order: 1, // lower sorts first in the view list; Workspaces registers at 0
  component: ({ active }) => <AgentList paused={!active} />,
});
```

## One view per projection

Register one view for each genuinely different destination — not one per way of
sorting or filtering the same list. Every view costs a permanent row in the
Navigator's list, and two rows that render the same rows two ways read as two
places to go when they aren't.

If your view supports grouping, filtering or a display mode, make it a control
_inside_ that view — a menu-backed [header action](#header-actions) is usually
the right shape, since it costs no panel height and the choice can persist in
your own [storage](/api/storage/).

## Prefer this over a second side panel

If what you're adding is _another way to navigate the app_, make it a view, not
a [side panel](/api/registration/register-side-panel). Two navigators side by
side leave the user with no rule for which one to trust — and because side-panel
state is per workspace, which of them they're looking at can change as they
switch workspaces. A view keeps one place to navigate from and changes only how
it is projected.

A side panel is still right for a surface that isn't navigation: a file tree
scoped to the current workspace, a diff viewer, a chat panel.

## What a view owns

The view's component **is** the panel body. It does not inherit the workspace
list's groups, drag-reorder, row context menus, badges or status rows — those
belong to the Workspaces view's own rendering.

Views mount the first time they're selected and then stay mounted — hidden, not
unmounted — so scroll position and local state survive switching. That's what
`active` is for: throttle timers and polling while your view is off screen.
Each view renders inside an error boundary, so a crash in one doesn't take the
Navigator down. The user's choice of view is remembered globally (not per
workspace) across workspace switches and restarts.

Your component also receives `panelId` — the Navigator's own side panel id.
Pass it to [`ctx.layout.openPanelSheet`](/api/state/layout) so a sheet your
view opens anchors to whichever column the Navigator is actually docked in,
rather than assuming a fixed side.

## Header actions

A view's buttons are **toolbar items** on the `"navigator"`
[surface](/api/registration/register-toolbar-item), not part of the view
itself — so they get the host's button, dropdown, tooltip and ordering chrome,
and can be either command-backed or menu-backed. They render in the header that
names the active view, between the view list and the view body:

```ts
ctx.registerToolbarItem({
  id: "acme.refresh",
  surface: "navigator",
  icon: "ArrowsClockwise",
  tooltip: "Refresh",
  // Scope to your view; omit `when` to appear in every view.
  when: (_keys, target) => target.viewId === "acme.agents",
  command: "acme.refresh",
});
```

The target is `{ viewId }` — the view currently on screen. The workspaces `+`
button is exactly this: a menu-backed item registered with no `when`, which is
why adding a workspace stays one click away from whichever view you're in.

A menu-backed item is also how a view offers its own display options. To let the
user regroup your list without spending a second view on it:

```ts
ctx.registerToolbarItem({
  id: "acme.group-by",
  surface: "navigator",
  title: "Group by",
  when: (_keys, target) => target.viewId === "acme.agents",
  menu: () => [
    { type: "header", label: "Group by" },
    {
      label: "Status",
      checked: groupBy === "status",
      run: () => setGroupBy("status"),
    },
    {
      label: "Workspace",
      checked: groupBy === "workspace",
      run: () => setGroupBy("workspace"),
    },
  ],
});
```

## Types

Pass [`NavigatorView`](/api/types/interfaces/NavigatorView).

Related: [`NavigatorViewProps`](/api/types/interfaces/NavigatorViewProps) · [`ToolbarSurface`](/api/types/type-aliases/ToolbarSurface) · [`Disposable`](/api/types/interfaces/Disposable).

## See also

[`ctx.workspaces`](/api/state/workspaces) for workspace state, row sections and
the [Open Workspace menu rows](/api/state/workspaces#open-workspace-menu).
Other [Registration](/api/#registration) members on `ctx`.
