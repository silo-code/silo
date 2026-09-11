# Interface: Keybinding

Defined in: [packages/sdk/src/types.ts:517](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L517)

Binds a keyboard shortcut to a [Command](Command.md).

The command is invoked with **no arguments** — see [Command.run](Command.md#run) for
what that means for a command shared with a toolbar or context-menu surface.

Users can also bind any command themselves from Settings → Keyboard
Shortcuts, whether or not the extension registered a default here, so this
applies to every command an extension exposes.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:519](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L519)

Unique id for this binding.

***

### key

```ts
key: string;
```

Defined in: [packages/sdk/src/types.ts:525](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L525)

Shortcut spec like "cmd+s", "ctrl+shift+s", "cmd+1", "cmd+shift+=".
Parsed against KeyboardEvent.code for layout-stable letter/digit keys
plus a small alias table for symbol keys (= → Equal, - → Minus, etc.).

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:527](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L527)

Id of the [Command](Command.md) to invoke.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:529](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L529)

Optional predicate against context keys; the binding is inert when false.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
