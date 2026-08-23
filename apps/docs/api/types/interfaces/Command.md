# Interface: Command

Defined in: [packages/sdk/src/types.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L248)

A named, invokable action. Register with
[ExtensionContext.registerCommand](ExtensionContext.md#registercommand) and trigger from menu items,
keybindings, status items, or [ExtensionContext.executeCommand](ExtensionContext.md#executecommand).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:250](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L250)

Unique id, conventionally `area.verb` (e.g. `"view.toggleLeftPanel"`).

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:252](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L252)

Human-readable label (shown where the command surfaces in UI).

***

### run

```ts
run: (...args) => unknown;
```

Defined in: [packages/sdk/src/types.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L276)

The action. May return a value (sync or async); `executeCommand` resolves
with whatever this returns.

**What `args` holds depends on how the command was invoked** — the host
does not synthesize a target for invocations that carry none:

| Invoked from                                            | `args[0]`                          |
| ------------------------------------------------------- | ---------------------------------- |
| [ExtensionContext.registerToolbarItem](ExtensionContext.md#registertoolbaritem)             | [ToolbarItemContext](ToolbarItemContext.md)`[S]`    |
| [ExtensionContext.registerContextMenuItem](ExtensionContext.md#registercontextmenuitem)         | [MenuContext](MenuContext.md)`[S]`           |
| [ExtensionContext.executeCommand](ExtensionContext.md#executecommand)                  | whatever the caller passed         |
| a keybinding, a menu item, the command palette            | **nothing**                        |

So a command that reads its target only from `args` **cannot be bound to
a key**: it will run and silently do nothing. If the same command backs
both a surface and a shortcut, fall back to the active tab
([EditorService.getState](EditorService.md#getstate)`().active`,
[TerminalService.getActive](TerminalService.md#getactive)) when no context arrives.

Zero-argument, void-returning commands are still valid — `() => void`
satisfies this type, so existing registrations compile unchanged.

#### Parameters

##### args

...`unknown`[]

#### Returns

`unknown`
