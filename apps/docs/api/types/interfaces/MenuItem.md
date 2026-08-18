# Interface: MenuItem

Defined in: [packages/sdk/src/ui-service.ts:48](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L48)

One actionable row in a menu shown by [UiService.showMenu](UiService.md#showmenu). The host
renders and themes the chrome; the extension supplies the data and an action.

## Properties

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/ui-service.ts:50](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L50)

The row's text.

***

### accelerator?

```ts
optional accelerator?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L56)

A pre-formatted shortcut hint shown right-aligned, e.g. `"⌘C"` or
`"Ctrl+C"`. Display only — it does not bind the key. Format it for the
platform yourself.

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/ui-service.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L58)

Leading glyph (e.g. a Phosphor icon element).

***

### checked?

```ts
optional checked?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L60)

Show a check in the leading gutter — for toggle / current-selection rows.

***

### disabled?

```ts
optional disabled?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L62)

Render the row dimmed and inert.

***

### danger?

```ts
optional danger?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L64)

Style the row as destructive (e.g. Delete).

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L66)

Native tooltip for the row.

***

### trailing?

```ts
optional trailing?: MenuItemTrailing;
```

Defined in: [packages/sdk/src/ui-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L68)

A secondary trailing control (see [MenuItemTrailing](MenuItemTrailing.md)).

***

### submenu?

```ts
optional submenu?: MenuEntry[];
```

Defined in: [packages/sdk/src/ui-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L76)

A nested menu that cascades open to the side when this row is hovered or
clicked. A row with a `submenu` is a *parent*: it shows a trailing caret and
opening it reveals these [entries](../type-aliases/MenuEntry.md) rather than running an
action. Give a row a `submenu` **or** a [run](#run), not both
(a `run` is ignored while the submenu is the active target).

***

### run?

```ts
optional run?: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/ui-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L82)

Invoked when the row is chosen; the menu closes first. Optional only for
submenu parents (rows with a [submenu](#submenu)); every leaf
row must supply one.

#### Returns

`void` \| `Promise`\<`void`\>
