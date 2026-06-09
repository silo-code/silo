# ctx.registerMenuItem

Place a command into one of the application menus (file / edit / view / window), ordered by `group` then `order`. A `when` predicate disables (not hides) the item — a macOS native-menu constraint.

```ts
ctx.registerMenuItem(item: MenuItemContribution): Disposable
```

## Example

```tsx
ctx.registerMenuItem({
  id: "acme.sayHi",
  menu: "view",
  command: "acme.sayHi",
  group: "5_acme",
});
```

## Types

Pass [`MenuItemContribution`](/api/types/interfaces/MenuItemContribution).

Related: [`MenuId`](/api/types/type-aliases/MenuId) · [`ContextKeys`](/api/types/interfaces/ContextKeys).

## See also

Other [Registration](/api/#registration) members on `ctx`.
