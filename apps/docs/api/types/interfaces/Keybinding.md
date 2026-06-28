# Interface: Keybinding

Defined in: [packages/sdk/src/types.ts:249](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L249)

Binds a keyboard shortcut to a [Command](Command.md).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:251](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L251)

Unique id for this binding.

***

### key

```ts
key: string;
```

Defined in: [packages/sdk/src/types.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L257)

Shortcut spec like "cmd+s", "ctrl+shift+s", "cmd+1", "cmd+shift+=".
Parsed against KeyboardEvent.code for layout-stable letter/digit keys
plus a small alias table for symbol keys (= → Equal, - → Minus, etc.).

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L259)

Id of the [Command](Command.md) to invoke.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:261](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L261)

Optional predicate against context keys; the binding is inert when false.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
