# Interface: ContextMenuContribution\<S\>

Defined in: [packages/sdk/src/types.ts:374](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L374)

Adds a command to the right-click context menu of a built-in surface.
Register via [ExtensionContext.registerContextMenuItem](ExtensionContext.md#registercontextmenuitem).

When the surface is right-clicked, the host collects the registered
contributions, evaluates each [when](#when)
against the current context keys **and** the freshly-built target object,
and dispatches the chosen command with the target as its first argument.

## Type Parameters

### S

`S` *extends* [`MenuSurface`](../type-aliases/MenuSurface.md) = [`MenuSurface`](../type-aliases/MenuSurface.md)

## Properties

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/types.ts:376](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L376)

Which context menu to contribute to.

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:378](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L378)

The command to run; receives the surface's [MenuContext\[S\]](MenuContext.md) as its first arg.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:380](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L380)

Menu label (falls back to the command's label).

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/types.ts:382](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L382)

Leading glyph for the row (e.g. a Phosphor icon element), same as [MenuItem.icon](MenuItem.md#icon).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:384](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L384)

Ordering within the menu; lower sorts first.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:390](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L390)

Optional group id — items with the same group render together with a
separator between groups. Group names sort lexically; defaults to
`"9_default"`, same as [MenuItemContribution.group](MenuItemContribution.md#group).

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/types.ts:395](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L395)

Enable/visibility predicate. Receives the same per-surface context as the
command plus the current context keys. Returning false hides the item.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`MenuContext`](MenuContext.md)\[`S`\]

#### Returns

`boolean`

***

### checked?

```ts
optional checked?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/types.ts:403](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L403)

Toggle-row predicate. When provided, the item renders with a checkmark
in the leading gutter whenever this returns true — the same rendering
[MenuItem.checked](MenuItem.md#checked) gives `ctx.ui.showMenu` rows. Lets a single
command represent an on/off state (e.g. "enabled for this workspace")
instead of registering two mutually-exclusive commands gated by `when`.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`MenuContext`](MenuContext.md)\[`S`\]

#### Returns

`boolean`
