# Interface: Keybinding

Defined in: [packages/sdk/src/types.ts:538](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L538)

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

Defined in: [packages/sdk/src/types.ts:540](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L540)

Unique id for this binding.

***

### key

```ts
key: string;
```

Defined in: [packages/sdk/src/types.ts:546](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L546)

Shortcut spec like "cmd+s", "ctrl+shift+s", "cmd+1", "cmd+shift+=".
Parsed against KeyboardEvent.code for layout-stable letter/digit keys
plus a small alias table for symbol keys (= → Equal, - → Minus, etc.).

***

### command

```ts
command: string;
```

Defined in: [packages/sdk/src/types.ts:548](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L548)

Id of the [Command](Command.md) to invoke.

***

### when?

```ts
optional when?: (ctx) => boolean;
```

Defined in: [packages/sdk/src/types.ts:550](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L550)

Optional predicate against context keys; the binding is inert when false.

#### Parameters

##### ctx

[`ContextKeys`](ContextKeys.md)

#### Returns

`boolean`
