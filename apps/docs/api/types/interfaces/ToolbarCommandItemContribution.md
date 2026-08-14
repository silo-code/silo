# Interface: ToolbarCommandItemContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L94)

Command-backed toolbar control — click runs [ToolbarCommandItemContribution.command](#command).

## Extends

- [`ToolbarItemFields`](ToolbarItemFields.md)\<`S`\>

## Type Parameters

### S

`S` *extends* [`ToolbarSurface`](../type-aliases/ToolbarSurface.md) = [`ToolbarSurface`](../type-aliases/ToolbarSurface.md)

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:53](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L53)

Unique id for this contribution.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`id`](ToolbarItemFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L55)

Which toolbar to contribute to.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`surface`](ToolbarItemFields.md#surface)

***

### icon?

```ts
optional icon?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L60)

Leading glyph as a [PhosphorIconName](../type-aliases/PhosphorIconName.md) (e.g. `"Flag"`). Omit for a
text-only control (requires [title](ToolbarItemFields.md#title)).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`icon`](ToolbarItemFields.md#icon)

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L65)

Visible label painted in the control. Omit for icon-only. When both
`icon` and `title` are set, the host renders icon + text.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`title`](ToolbarItemFields.md#title)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L67)

Hover tooltip (falls back to title / label / command label).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`tooltip`](ToolbarItemFields.md#tooltip)

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L73)

Accessible name (falls back to title / the command's label). Always used
for `aria-label`; not painted unless [title](ToolbarItemFields.md#title)
is also set.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`label`](ToolbarItemFields.md#label)

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L75)

Ordering within the trailing cluster; lower sorts first.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`order`](ToolbarItemFields.md#order)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:79](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L79)

Visibility predicate. Returning false hides the item for this target.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

`boolean`

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`when`](ToolbarItemFields.md#when)

***

### checked?

```ts
optional checked?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L85)

Toggle-state predicate for command items. When provided, the host renders
the control in a pressed/checked visual state whenever this returns true.
Menu items put checks on individual [MenuEntry](../type-aliases/MenuEntry.md) rows instead.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

`boolean`

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`checked`](ToolbarItemFields.md#checked)

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L98)

The command to run; receives [ToolbarItemContext](ToolbarItemContext.md)[S] as its first arg.

***

### menu?

```ts
optional menu?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L99)

***

### type?

```ts
optional type?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:100](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L100)
