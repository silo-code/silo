# Interface: MenuItemContribution

Defined in: [packages/sdk/src/types.ts:198](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L198)

Places a command into one of the application menus.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:200](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L200)

Unique id for this menu entry.

***

### menu

```ts
menu: MenuId;
```

Defined in: [packages/sdk/src/types.ts:202](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L202)

Which application menu to place the item in.

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:204](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L204)

Id of the [Command](Command.md) this item invokes.

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:206](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L206)

Override label; defaults to the command's label.

***

### accelerator?

```ts
optional accelerator?: string;
```

Defined in: [packages/sdk/src/types.ts:208](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L208)

Accelerator shown next to the item (display only; bind via [Keybinding](Keybinding.md)).

***

### group?

```ts
optional group?: string;
```

Defined in: [packages/sdk/src/types.ts:215](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L215)

Group key used to bucket items in the same submenu. Items in different
groups are visually separated by a separator. Group names are sorted
lexically — convention is to prefix with a digit ("1_new", "2_save").
Defaults to "9_default" so unspecified items land at the bottom.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:217](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L217)

Sort order within a group. Defaults to 0.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:224](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L224)

Optional predicate against current context keys. Items whose `when`
returns false stay visible in the app menu but are disabled (macOS
native pattern — items can't appear/disappear without rebuilding the
whole menu). Items without `when` are always enabled.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
