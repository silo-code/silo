# Interface: ToolbarSpacerContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L187)

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

Defined in: [packages/sdk/src/toolbar-items.ts:151](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L151)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`id`](ToolbarChromeFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:152](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L152)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`surface`](ToolbarChromeFields.md#surface)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:153](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L153)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`order`](ToolbarChromeFields.md#order)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:154](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L154)

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

Defined in: [packages/sdk/src/toolbar-items.ts:190](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L190)

***

### size?

```ts
optional size?: ToolbarSpacerSize;
```

Defined in: [packages/sdk/src/toolbar-items.ts:192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L192)

Default `"md"`.
