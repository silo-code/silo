# Interface: ToolbarSpacerContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:169](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L169)

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

Defined in: [packages/sdk/src/toolbar-items.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L133)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`id`](ToolbarChromeFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L134)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`surface`](ToolbarChromeFields.md#surface)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L135)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`order`](ToolbarChromeFields.md#order)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:136](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L136)

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

Defined in: [packages/sdk/src/toolbar-items.ts:172](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L172)

***

### size?

```ts
optional size?: ToolbarSpacerSize;
```

Defined in: [packages/sdk/src/toolbar-items.ts:174](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L174)

Default `"md"`.
