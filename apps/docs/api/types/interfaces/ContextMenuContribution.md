# Interface: ContextMenuContribution\<S\>

Defined in: [packages/sdk/src/types.ts:364](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L364)

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

Defined in: [packages/sdk/src/types.ts:366](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L366)

Which context menu to contribute to.

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:368](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L368)

The command to run; receives the surface's [MenuContext\[S\]](MenuContext.md) as its first arg.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:370](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L370)

Menu label (falls back to the command's label).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:372](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L372)

Ordering within the menu; lower sorts first.

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:378](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L378)

Optional group id — items with the same group render together with a
separator between groups. Group names sort lexically; defaults to
`"9_default"`, same as [MenuItemContribution.group](MenuItemContribution.md#group).

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/types.ts:383](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L383)

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

Defined in: [packages/sdk/src/types.ts:391](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L391)

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
