# Interface: MenuItem

Defined in: [packages/sdk/src/ui-service.ts:47](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L47)

One actionable row in a menu shown by [UiService.showMenu](UiService.md#showmenu). The host
renders and themes the chrome; the extension supplies the data and an action.

## Properties

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/ui-service.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L49)

The row's text.

***

### accelerator?

```ts
optional accelerator?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L55)

A pre-formatted shortcut hint shown right-aligned, e.g. `"⌘C"` or
`"Ctrl+C"`. Display only — it does not bind the key. Format it for the
platform yourself.

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/ui-service.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L57)

Leading glyph (e.g. a Phosphor icon element).

***

### checked?

```ts
optional checked?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L59)

Show a check in the leading gutter — for toggle / current-selection rows.

***

### disabled?

```ts
optional disabled?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L61)

Render the row dimmed and inert.

***

### danger?

```ts
optional danger?: boolean;
```

Defined in: [packages/sdk/src/ui-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L63)

Style the row as destructive (e.g. Delete).

***

### title?

```ts
optional title?: string;
```

Defined in: [packages/sdk/src/ui-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L65)

Native tooltip for the row.

***

### trailing?

```ts
optional trailing?: MenuItemTrailing;
```

Defined in: [packages/sdk/src/ui-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L67)

A secondary trailing control (see [MenuItemTrailing](MenuItemTrailing.md)).

***

### submenu?

```ts
optional submenu?: MenuEntry[];
```

Defined in: [packages/sdk/src/ui-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L75)

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

Defined in: [packages/sdk/src/ui-service.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/ui-service.ts#L81)

Invoked when the row is chosen; the menu closes first. Optional only for
submenu parents (rows with a [submenu](#submenu)); every leaf
row must supply one.

#### Returns

`void` \| `Promise`\<`void`\>
