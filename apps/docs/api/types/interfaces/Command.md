# Interface: Command

Defined in: [packages/sdk/src/types.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L244)

A named, invokable action. Register with
[ExtensionContext.registerCommand](ExtensionContext.md#registercommand) and trigger from menu items,
keybindings, status items, or [ExtensionContext.executeCommand](ExtensionContext.md#executecommand).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:246](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L246)

Unique id, conventionally `area.verb` (e.g. `"view.toggleLeftPanel"`).

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L248)

Human-readable label (shown where the command surfaces in UI).

***

### run

```ts
run: (...args) => unknown;
```

Defined in: [packages/sdk/src/types.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L257)

The action. May accept arguments passed through from
[ExtensionContext.executeCommand](ExtensionContext.md#executecommand) and may return a value (sync or
async); `executeCommand` resolves with whatever this returns.

Zero-argument, void-returning commands are still valid — `() => void`
satisfies this type, so existing registrations compile unchanged.

#### Parameters

##### args

...`unknown`[]

#### Returns

`unknown`
