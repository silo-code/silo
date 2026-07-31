# Interface: ToolbarChromeFields\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:122](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L122)

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

Defined in: [packages/sdk/src/toolbar-items.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L125)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L126)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L127)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:128](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L128)

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

`boolean`
