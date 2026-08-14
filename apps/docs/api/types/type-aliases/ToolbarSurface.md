# Type Alias: ToolbarSurface

```ts
type ToolbarSurface = "editor" | "terminal" | "navigator";
```

Defined in: [packages/sdk/src/toolbar-items.ts:19](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L19)

Built-in surfaces that accept [ToolbarItemContribution](ToolbarItemContribution.md)s. One surface
per registration.

`"editor"` and `"terminal"` are CenterDock breadcrumb toolbars; `"navigator"`
is the header naming the Navigator's active view — the bar between its view
list and the view body — where contributions become that view's action
buttons. A navigator item's `when` receives the active
[view](../interfaces/NavigatorView.md)'s id, so an action can be scoped to one view or
left unscoped to follow the user across all of them.
