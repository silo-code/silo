# Interface: Command

Defined in: [packages/sdk/src/types.ts:192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L192)

A named, invokable action. Register with
[ExtensionContext.registerCommand](ExtensionContext.md#registercommand) and trigger from menu items,
keybindings, status items, or [ExtensionContext.executeCommand](ExtensionContext.md#executecommand).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:194](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L194)

Unique id, conventionally `area.verb` (e.g. `"view.toggleLeftPanel"`).

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/types.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L196)

Human-readable label (shown where the command surfaces in UI).

***

### run

```ts
run: () => void;
```

Defined in: [packages/sdk/src/types.ts:198](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L198)

The action. Runs synchronously; do async work inside if needed.

#### Returns

`void`
