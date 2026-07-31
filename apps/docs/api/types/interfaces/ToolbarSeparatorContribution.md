# Interface: ToolbarSeparatorContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L139)

A light vertical rule between toolbar controls. Softer than the Text |
Preview pipe — host paints it with a low-opacity mix of toolbar text, not
`--silo-color-toolbar-text-disabled`.

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
type: "separator";
```

Defined in: [packages/sdk/src/toolbar-items.ts:142](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L142)
