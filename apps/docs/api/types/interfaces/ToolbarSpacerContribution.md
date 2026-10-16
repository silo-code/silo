# Interface: ToolbarSpacerContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L253)

An empty gap between toolbar controls (no rule). Use to group without a
hard split; prefer [ToolbarSeparatorContribution](ToolbarSeparatorContribution.md) when a hairline helps.

## Extends

- [`ToolbarChromeFields`](ToolbarChromeFields.md)\<`S`\>

## Type Parameters

### S

`S` *extends* [`ToolbarSurface`](../type-aliases/ToolbarSurface.md) = [`ToolbarSurface`](../type-aliases/ToolbarSurface.md)

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:217](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L217)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`id`](ToolbarChromeFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:218](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L218)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`surface`](ToolbarChromeFields.md#surface)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:219](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L219)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`order`](ToolbarChromeFields.md#order)

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

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`when`](ToolbarChromeFields.md#when)

***

### type

```ts
type: "spacer";
```

Defined in: [packages/sdk/src/toolbar-items.ts:256](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L256)

***

### size?

```ts
optional size?: ToolbarSpacerSize;
```

Defined in: [packages/sdk/src/toolbar-items.ts:258](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L258)

Default `"md"`.
