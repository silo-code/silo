# Interface: ToolbarChromeFields\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L129)

Shared placement fields for non-interactive toolbar chrome
([ToolbarSeparatorContribution](ToolbarSeparatorContribution.md) / [ToolbarSpacerContribution](ToolbarSpacerContribution.md)).

## Extended by

- [`ToolbarSeparatorContribution`](ToolbarSeparatorContribution.md)
- [`ToolbarSpacerContribution`](ToolbarSpacerContribution.md)

## Type Parameters

### S

`S` *extends* [`ToolbarSurface`](../type-aliases/ToolbarSurface.md) = [`ToolbarSurface`](../type-aliases/ToolbarSurface.md)

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L132)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L133)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L134)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L135)

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

`boolean`
