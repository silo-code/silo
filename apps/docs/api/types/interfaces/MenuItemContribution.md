# Interface: MenuItemContribution

Defined in: [packages/sdk/src/types.ts:315](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L315)

Places a command into one of the application menus.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L317)

Unique id for this menu entry.

***

### menu

```ts
menu: MenuId;
```

Defined in: [packages/sdk/src/types.ts:319](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L319)

Which application menu to place the item in.

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:321](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L321)

Id of the [Command](Command.md) this item invokes.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:323](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L323)

Override label; defaults to the command's label.

***

### accelerator?

```ts
optional accelerator?: string;
```

Defined in: [packages/sdk/src/types.ts:325](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L325)

Accelerator shown next to the item (display only; bind via [Keybinding](Keybinding.md)).

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:332](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L332)

Group key used to bucket items in the same submenu. Items in different
groups are visually separated by a separator. Group names are sorted
lexically — convention is to prefix with a digit ("1_new", "2_save").
Defaults to "9_default" so unspecified items land at the bottom.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:340](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L340)

Sort order within a group. Defaults to 0.

**Convention:** built-in (core) items use negative values; extensions
should use `0` or greater so they appear after built-in items within
the same group by default.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:347](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L347)

Optional predicate against current context keys. Items whose `when`
returns false stay visible in the app menu but are disabled (macOS
native pattern — items can't appear/disappear without rebuilding the
whole menu). Items without `when` are always enabled.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
