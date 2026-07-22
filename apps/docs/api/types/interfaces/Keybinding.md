# Interface: Keybinding

Defined in: [packages/sdk/src/types.ts:411](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L411)

Binds a keyboard shortcut to a [Command](Command.md).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:413](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L413)

Unique id for this binding.

***

### key

```ts
key: string;
```

Defined in: [packages/sdk/src/types.ts:419](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L419)

Shortcut spec like "cmd+s", "ctrl+shift+s", "cmd+1", "cmd+shift+=".
Parsed against KeyboardEvent.code for layout-stable letter/digit keys
plus a small alias table for symbol keys (= → Equal, - → Minus, etc.).

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:421](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L421)

Id of the [Command](Command.md) to invoke.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:423](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L423)

Optional predicate against context keys; the binding is inert when false.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
