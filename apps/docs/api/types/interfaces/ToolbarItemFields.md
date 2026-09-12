# Interface: ToolbarItemFields\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L73)

Shared fields for interactive toolbar contributions. Render chrome is driven
by [icon](#icon) + [title](#title):

| icon | title | Control        |
| ---- | ----- | -------------- |
| ✓    | —     | icon-only      |
| —    | ✓     | text-only      |
| ✓    | ✓     | icon + text    |

Icons are Phosphor export names ([PhosphorIconName](../type-aliases/PhosphorIconName.md)); the host
resolves and paints them bold at 1em so they match local-web-viewer and
track UI zoom. Pass a React node is no longer supported — use the name.

## Extended by

- [`ToolbarCommandItemContribution`](ToolbarCommandItemContribution.md)
- [`ToolbarMenuItemContribution`](ToolbarMenuItemContribution.md)

## Type Parameters

### S

`S` *extends* [`ToolbarSurface`](../type-aliases/ToolbarSurface.md) = [`ToolbarSurface`](../type-aliases/ToolbarSurface.md)

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L75)

Unique id for this contribution.

***

### surface

```ts
surface: S;
```

Defined in: [packages/sdk/src/toolbar-items.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L77)

Which toolbar to contribute to.

***

### icon?

```ts
optional icon?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L82)

Leading glyph as a [PhosphorIconName](../type-aliases/PhosphorIconName.md) (e.g. `"Flag"`). Omit for a
text-only control (requires [title](#title)).

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:87](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L87)

Visible label painted in the control. Omit for icon-only. When both
`icon` and `title` are set, the host renders icon + text.

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:89](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L89)

Hover tooltip (falls back to title / label / command label).

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L95)

Accessible name (falls back to title / the command's label). Always used
for `aria-label`; not painted unless [title](#title)
is also set.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/toolbar-items.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L97)

Ordering within the trailing cluster; lower sorts first.

***

### when?

```ts
optional when?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L101)

Visibility predicate. Returning false hides the item for this target.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

`boolean`

***

### checked?

```ts
optional checked?: (ctx, target) => boolean;
```

Defined in: [packages/sdk/src/toolbar-items.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L107)

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
