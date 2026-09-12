# Interface: ToolbarSpacerContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:191](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L191)

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

Defined in: [packages/sdk/src/toolbar-items.ts:155](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L155)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`id`](ToolbarChromeFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:156](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L156)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`surface`](ToolbarChromeFields.md#surface)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:157](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L157)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`order`](ToolbarChromeFields.md#order)

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

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`when`](ToolbarChromeFields.md#when)

***

### type

```ts
type: "spacer";
```

Defined in: [packages/sdk/src/toolbar-items.ts:194](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L194)

***

### size?

```ts
optional size?: ToolbarSpacerSize;
```

Defined in: [packages/sdk/src/toolbar-items.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L196)

Default `"md"`.
