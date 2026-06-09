# Type Alias: MenuEntry

```ts
type MenuEntry = 
  | MenuItem
  | MenuSeparator
  | MenuHeader;
```

Defined in: [packages/sdk/src/ui-service.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L235)

One entry in a menu — an actionable [MenuItem](../interfaces/MenuItem.md), a [MenuSeparator](../interfaces/MenuSeparator.md),
or a [MenuHeader](../interfaces/MenuHeader.md).
