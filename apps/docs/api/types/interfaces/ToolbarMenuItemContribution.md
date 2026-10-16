# Interface: ToolbarMenuItemContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L189)

Menu-backed toolbar control — click opens a host dropdown via
[UiService.showMenu](UiService.md#showmenu) with entries from
[ToolbarMenuItemContribution.menu](#menu).

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

### menu

```ts
menu: (target) => 
  | MenuEntry[]
| Promise<MenuEntry[]>;
```

Defined in: [packages/sdk/src/toolbar-items.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L196)

Build the dropdown for this target. May be sync or async. The host
anchors the menu on the toolbar control (`align: "end"`, toggle on).

#### Parameters

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

  \| [`MenuEntry`](../type-aliases/MenuEntry.md)[]
  \| `Promise`\<[`MenuEntry`](../type-aliases/MenuEntry.md)[]\>

***

### command?

```ts
optional command?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:197](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L197)

***

### dropdown?

```ts
optional dropdown?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L203)

A menu-only control is already all dropdown — there is no action half to
weld one onto. Use [ToolbarCommandItemContribution.dropdown](ToolbarCommandItemContribution.md#dropdown) for a
split control.

***

### type?

```ts
optional type?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:204](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L204)
