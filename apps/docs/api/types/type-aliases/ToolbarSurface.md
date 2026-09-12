# Type Alias: ToolbarSurface

```ts
type ToolbarSurface = "editor" | "navigator" | "panel";
```

Defined in: [packages/sdk/src/toolbar-items.ts:28](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L28)

Built-in surfaces that accept [ToolbarItemContribution](ToolbarItemContribution.md)s. One surface
per registration.

`"editor"` is the editor breadcrumb toolbar (beside the Text | Preview view
switcher). `"navigator"` is the header naming the Navigator's active view —
the bar between its view list and the view body — where contributions become
that view's action buttons; a navigator item's `when` receives the active
[view](../interfaces/NavigatorView.md)'s id, so an action can be scoped to one view or
left unscoped to follow the user across all of them.

`"panel"` is the host-drawn strip above any [DockPanelKind](../interfaces/DockPanelKind.md) that
declares `toolbar` (RFC 0039) — including the built-in **terminal**. Its
target carries the panel instance id, its `kindId`, its `workspaceId`, and
the panel's own `params`, so an item meant for one kind of panel scopes
itself with
`when: (_keys, t) => t.kindId === "terminal"` and reads instance data off
`t.params` (e.g. `t.params.terminalId`). Without a `kindId` guard a
`"panel"` item shows on every panel that has a strip.
