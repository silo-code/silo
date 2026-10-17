# Interface: ToolbarCommandItemContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:162](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L162)

Command-backed toolbar control — click runs [ToolbarCommandItemContribution.command](#command).

Adding [dropdown](#dropdown) turns it
into a **split control**: one welded unit whose left half runs the command
and whose right half opens a menu. Reach for that when a toolbar has a
single obvious default action plus variations on it — "mark with the default
label" next to "mark with…" — rather than registering two adjacent items,
which the host is free to separate, reorder, or collapse chrome between.

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

Defined in: [packages/sdk/src/toolbar-items.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L81)

Unique id for this contribution.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`id`](ToolbarItemFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L83)

Which toolbar to contribute to.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`surface`](ToolbarItemFields.md#surface)

***

### icon?

```ts
optional icon?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L88)

Leading glyph as a [PhosphorIconName](../type-aliases/PhosphorIconName.md) (e.g. `"Flag"`). Omit for a
text-only control (requires [title](ToolbarItemFields.md#title)).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`icon`](ToolbarItemFields.md#icon)

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:93](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L93)

Visible label painted in the control. Omit for icon-only. When both
`icon` and `title` are set, the host renders icon + text.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`title`](ToolbarItemFields.md#title)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L95)

Hover tooltip (falls back to title / label / command label).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`tooltip`](ToolbarItemFields.md#tooltip)

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L101)

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

Defined in: [packages/sdk/src/toolbar-items.ts:103](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L103)

Ordering within the trailing cluster; lower sorts first.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`order`](ToolbarItemFields.md#order)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L107)

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

Defined in: [packages/sdk/src/toolbar-items.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L113)

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

Defined in: [packages/sdk/src/toolbar-items.ts:166](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L166)

The command to run; receives [ToolbarItemContext](ToolbarItemContext.md)[S] as its first arg.

***

### dropdown?

```ts
optional dropdown?: ToolbarItemDropdown<S>;
```

Defined in: [packages/sdk/src/toolbar-items.ts:176](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L176)

Optional dropdown half, welded to the command half as one split control.
Omit for a plain command button.

[checked](ToolbarItemFields.md#checked) still describes the *command* —
but the host tints the whole control, caret included, so a marked split
control reads as one pressed thing rather than a pressed button beside an
unpressed caret.

***

### menu?

```ts
optional menu?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:177](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L177)

***

### type?

```ts
optional type?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:178](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L178)
