# Interface: ToolbarMenuItemContribution\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:110](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L110)

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

Defined in: [packages/sdk/src/toolbar-items.ts:52](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L52)

Unique id for this contribution.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`id`](ToolbarItemFields.md#id)

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L54)

Which toolbar to contribute to.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`surface`](ToolbarItemFields.md#surface)

***

### icon?

```ts
optional icon?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L59)

Leading glyph as a [PhosphorIconName](../type-aliases/PhosphorIconName.md) (e.g. `"Flag"`). Omit for a
text-only control (requires [title](ToolbarItemFields.md#title)).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`icon`](ToolbarItemFields.md#icon)

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L64)

Visible label painted in the control. Omit for icon-only. When both
`icon` and `title` are set, the host renders icon + text.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`title`](ToolbarItemFields.md#title)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L66)

Hover tooltip (falls back to title / label / command label).

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`tooltip`](ToolbarItemFields.md#tooltip)

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L72)

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

Defined in: [packages/sdk/src/toolbar-items.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L74)

Ordering within the trailing cluster; lower sorts first.

#### Inherited from

[`ToolbarItemFields`](ToolbarItemFields.md).[`order`](ToolbarItemFields.md#order)

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L78)

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

Defined in: [packages/sdk/src/toolbar-items.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L84)

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

Defined in: [packages/sdk/src/toolbar-items.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L117)

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

Defined in: [packages/sdk/src/toolbar-items.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L118)

***

### type?

```ts
optional type?: undefined;
```

Defined in: [packages/sdk/src/toolbar-items.ts:119](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L119)
