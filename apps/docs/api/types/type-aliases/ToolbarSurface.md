# Type Alias: ToolbarSurface

```ts
type ToolbarSurface = "editor" | "terminal" | "navigator";
```

Defined in: [packages/sdk/src/toolbar-items.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L18)

Built-in surfaces that accept [ToolbarItemContribution](ToolbarItemContribution.md)s. One surface
per registration.

`"editor"` and `"terminal"` are CenterDock breadcrumb toolbars; `"navigator"`
is the header of the Navigator side panel, where contributions become that
panel's action buttons. A navigator item's `when` receives the active
[view](../interfaces/NavigatorView.md)'s id, so an action can be scoped to one view or
left unscoped to appear across all of them.
