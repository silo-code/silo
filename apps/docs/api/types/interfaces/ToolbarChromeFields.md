# Interface: ToolbarChromeFields\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:152](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L152)

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

Defined in: [packages/sdk/src/toolbar-items.ts:155](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L155)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:156](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L156)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:157](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L157)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:158](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L158)

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

`boolean`
