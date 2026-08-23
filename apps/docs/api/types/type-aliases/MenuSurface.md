# Type Alias: MenuSurface

```ts
type MenuSurface = 
  | "explorer/item"
  | "editor/tab"
  | "terminal/tab"
  | "terminal/link"
  | "workspace";
```

Defined in: [packages/sdk/src/types.ts:341](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L341)

The context menus of built-in surfaces that a
[ContextMenuContribution](../interfaces/ContextMenuContribution.md) can target — distinct from the menubar
[MenuId](MenuId.md), because context items receive a **target argument** (which
file, which editor, which workspace) that menubar items never have.

Each surface's target type is declared by [MenuContext](../interfaces/MenuContext.md).
