# Interface: ToolbarCommandItemContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:86](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L86)

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

Defined in: [packages/sdk/src/toolbar-items.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L45)

Unique id for this contribution.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`id`](ToolbarItemFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:47](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L47)

Which toolbar to contribute to.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`surface`](ToolbarItemFields.md#surface)

***

### icon?

```ts
optional icon?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L52)

Leading glyph as a [PhosphorIconName](../type-aliases/PhosphorIconName.md) (e.g. `"Flag"`). Omit for a
text-only control (requires [title](ToolbarItemFields.md#title)).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`icon`](ToolbarItemFields.md#icon)

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L57)

Visible label painted in the control. Omit for icon-only. When both
`icon` and `title` are set, the host renders icon + text.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`title`](ToolbarItemFields.md#title)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L59)

Hover tooltip (falls back to title / label / command label).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`tooltip`](ToolbarItemFields.md#tooltip)

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L65)

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

Defined in: [packages/sdk/src/toolbar-items.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L67)

Ordering within the trailing cluster; lower sorts first.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`order`](ToolbarItemFields.md#order)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L71)

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

Defined in: [packages/sdk/src/toolbar-items.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L77)

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

Defined in: [packages/sdk/src/toolbar-items.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L90)

The command to run; receives [ToolbarItemContext](ToolbarItemContext.md)[S] as its first arg.

***

### menu?

```ts
optional menu?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:91](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L91)

***

### type?

```ts
optional type?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L92)
