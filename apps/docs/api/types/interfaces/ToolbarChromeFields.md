# Interface: ToolbarChromeFields\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L214)

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

Defined in: [packages/sdk/src/toolbar-items.ts:217](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L217)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:218](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L218)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:219](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L219)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L220)

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

`boolean`
