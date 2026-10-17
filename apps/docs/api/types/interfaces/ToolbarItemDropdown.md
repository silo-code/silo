# Interface: ToolbarItemDropdown\<S\>

Defined in: [packages/sdk/src/toolbar-items.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L131)

The dropdown half of a [ToolbarCommandItemContribution](ToolbarCommandItemContribution.md) that sets
[dropdown](ToolbarCommandItemContribution.md#dropdown) — the caret the
host welds onto the right edge of the command control.

It carries its own [label](#label) and
[tooltip](#tooltip) because the two halves answer
different questions: the action half names what clicking *does* ("Mark as
follow-up: Bug"), the caret names what opening it *offers* ("Follow-up
options"). Visibility is not its own concern — the whole control appears or
hides together via [when](ToolbarItemFields.md#when).

## Type Parameters

### S

`S` *extends* [`ToolbarSurface`](../type-aliases/ToolbarSurface.md) = [`ToolbarSurface`](../type-aliases/ToolbarSurface.md)

## Properties

### menu

```ts
menu: (target) => 
  | MenuEntry[]
| Promise<MenuEntry[]>;
```

Defined in: [packages/sdk/src/toolbar-items.ts:139](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L139)

Build the dropdown for this target. May be sync or async. The host
anchors the menu on the caret half (`align: "end"`, toggle on) — the same
chrome a [ToolbarMenuItemContribution](ToolbarMenuItemContribution.md) gets.

#### Parameters

##### target

[`ToolbarItemContext`](ToolbarItemContext.md)\[`S`\]

#### Returns

  \| [`MenuEntry`](../type-aliases/MenuEntry.md)[]
  \| `Promise`\<[`MenuEntry`](../type-aliases/MenuEntry.md)[]\>

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:144](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L144)

Accessible name for the caret half. Falls back to the item's
[label](ToolbarItemFields.md#label) suffixed with "options".

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/toolbar-items.ts:146](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L146)

Hover tooltip for the caret half. Falls back to `label`.
