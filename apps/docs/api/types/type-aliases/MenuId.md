# Type Alias: MenuId

```ts
type MenuId = "file" | "edit" | "view" | "window" | "help";
```

Defined in: [packages/sdk/src/types.ts:401](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L401)

The top-level application menus a [MenuItemContribution](../interfaces/MenuItemContribution.md) can target.
`"help"` is present on all platforms; `"file"`, `"edit"`, `"view"`, and
`"window"` are the remaining standard menus.
