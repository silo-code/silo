# Interface: MenuItemContribution

Defined in: [packages/sdk/src/types.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L269)

Places a command into one of the application menus.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L271)

Unique id for this menu entry.

***

### menu

```ts
menu: MenuId;
```

Defined in: [packages/sdk/src/types.ts:273](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L273)

Which application menu to place the item in.

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:275](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L275)

Id of the [Command](Command.md) this item invokes.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:277](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L277)

Override label; defaults to the command's label.

***

### accelerator?

```ts
optional accelerator?: string;
```

Defined in: [packages/sdk/src/types.ts:279](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L279)

Accelerator shown next to the item (display only; bind via [Keybinding](Keybinding.md)).

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:286](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L286)

Group key used to bucket items in the same submenu. Items in different
groups are visually separated by a separator. Group names are sorted
lexically — convention is to prefix with a digit ("1_new", "2_save").
Defaults to "9_default" so unspecified items land at the bottom.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:294](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L294)

Sort order within a group. Defaults to 0.

**Convention:** built-in (core) items use negative values; extensions
should use `0` or greater so they appear after built-in items within
the same group by default.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:301](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L301)

Optional predicate against current context keys. Items whose `when`
returns false stay visible in the app menu but are disabled (macOS
native pattern — items can't appear/disappear without rebuilding the
whole menu). Items without `when` are always enabled.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
