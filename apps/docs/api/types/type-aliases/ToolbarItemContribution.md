# Type Alias: ToolbarItemContribution\<S\>

```ts
type ToolbarItemContribution<S> = 
  | ToolbarCommandItemContribution<S>
  | ToolbarMenuItemContribution<S>
  | ToolbarSeparatorContribution<S>
| ToolbarSpacerContribution<S>;
```

Defined in: [packages/sdk/src/toolbar-items.ts:193](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L193)

Adds a control or chrome element to the trailing cluster of a built-in
editor or terminal toolbar. Register via
[ExtensionContext.registerToolbarItem](../interfaces/ExtensionContext.md#registertoolbaritem).

Interactive items set exactly one of
[command](../interfaces/ToolbarCommandItemContribution.md#command) or
[menu](../interfaces/ToolbarMenuItemContribution.md#menu). Separators and spacers use
`type: "separator" | "spacer"`.

Contributions are independent of context-menu items — an extension may
register either, both, or neither. Hosts only render items while that
surface's breadcrumbs setting is on.

## Type Parameters

### S

`S` *extends* [`ToolbarSurface`](ToolbarSurface.md) = [`ToolbarSurface`](ToolbarSurface.md)
