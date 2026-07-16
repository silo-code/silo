# Interface: MenuItemContribution

Defined in: [packages/sdk/src/types.ts:278](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L278)

Places a command into one of the application menus.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:280](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L280)

Unique id for this menu entry.

***

### menu

```ts
menu: MenuId;
```

Defined in: [packages/sdk/src/types.ts:282](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L282)

Which application menu to place the item in.

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:284](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L284)

Id of the [Command](Command.md) this item invokes.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:286](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L286)

Override label; defaults to the command's label.

***

### accelerator?

```ts
optional accelerator?: string;
```

Defined in: [packages/sdk/src/types.ts:288](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L288)

Accelerator shown next to the item (display only; bind via [Keybinding](Keybinding.md)).

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:295](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L295)

Group key used to bucket items in the same submenu. Items in different
groups are visually separated by a separator. Group names are sorted
lexically — convention is to prefix with a digit ("1_new", "2_save").
Defaults to "9_default" so unspecified items land at the bottom.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:303](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L303)

Sort order within a group. Defaults to 0.

**Convention:** built-in (core) items use negative values; extensions
should use `0` or greater so they appear after built-in items within
the same group by default.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L310)

Optional predicate against current context keys. Items whose `when`
returns false stay visible in the app menu but are disabled (macOS
native pattern — items can't appear/disappear without rebuilding the
whole menu). Items without `when` are always enabled.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
