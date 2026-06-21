# Interface: MenuItemContribution

Defined in: [packages/sdk/src/types.ts:210](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L210)

Places a command into one of the application menus.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:212](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L212)

Unique id for this menu entry.

***

### menu

```ts
menu: MenuId;
```

Defined in: [packages/sdk/src/types.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L214)

Which application menu to place the item in.

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:216](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L216)

Id of the [Command](Command.md) this item invokes.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:218](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L218)

Override label; defaults to the command's label.

***

### accelerator?

```ts
optional accelerator?: string;
```

Defined in: [packages/sdk/src/types.ts:220](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L220)

Accelerator shown next to the item (display only; bind via [Keybinding](Keybinding.md)).

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:227](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L227)

Group key used to bucket items in the same submenu. Items in different
groups are visually separated by a separator. Group names are sorted
lexically — convention is to prefix with a digit ("1_new", "2_save").
Defaults to "9_default" so unspecified items land at the bottom.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:229](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L229)

Sort order within a group. Defaults to 0.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:236](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L236)

Optional predicate against current context keys. Items whose `when`
returns false stay visible in the app menu but are disabled (macOS
native pattern — items can't appear/disappear without rebuilding the
whole menu). Items without `when` are always enabled.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
