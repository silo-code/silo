# Interface: Command

Defined in: [packages/sdk/src/types.ts:174](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L174)

A named, invokable action. Register with
[ExtensionContext.registerCommand](ExtensionContext.md#registercommand) and trigger from menu items,
keybindings, status items, or [ExtensionContext.executeCommand](ExtensionContext.md#executecommand).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:176](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L176)

Unique id, conventionally `area.verb` (e.g. `"view.toggleLeftPanel"`).

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:178](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L178)

Human-readable label (shown where the command surfaces in UI).

***

### run

```ts
run: () => void;
```

Defined in: [packages/sdk/src/types.ts:180](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L180)

The action. Runs synchronously; do async work inside if needed.

#### Returns

`void`
