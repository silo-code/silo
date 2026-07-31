# Interface: ToolbarSpacerContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:161](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L161)

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

Defined in: [packages/sdk/src/toolbar-items.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L125)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`id`](ToolbarChromeFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:126](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L126)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`surface`](ToolbarChromeFields.md#surface)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L127)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`order`](ToolbarChromeFields.md#order)

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

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`when`](ToolbarChromeFields.md#when)

***

### type

```ts
type: "spacer";
```

Defined in: [packages/sdk/src/toolbar-items.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L164)

***

### size?

```ts
optional size?: ToolbarSpacerSize;
```

Defined in: [packages/sdk/src/toolbar-items.ts:166](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L166)

Default `"md"`.
