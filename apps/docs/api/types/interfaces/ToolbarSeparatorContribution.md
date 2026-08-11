# Interface: ToolbarSeparatorContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:146](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L146)

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

Defined in: [packages/sdk/src/toolbar-items.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L132)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`id`](ToolbarChromeFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L133)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`surface`](ToolbarChromeFields.md#surface)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L134)

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`order`](ToolbarChromeFields.md#order)

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

#### Inherited from

[`ToolbarChromeFields`](ToolbarChromeFields.md).[`when`](ToolbarChromeFields.md#when)

***

### type

```ts
type: "separator";
```

Defined in: [packages/sdk/src/toolbar-items.ts:149](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L149)
