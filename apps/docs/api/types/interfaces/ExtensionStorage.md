# Interface: ExtensionStorage

Defined in: [packages/sdk/src/extension-storage.ts:13](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L13)

Namespaced, persisted key/value storage handed to side-panel components
via `SidePanelProps.storage`. Each panel id gets its own bag; values are
persisted alongside the rest of the app state.

The store is hydrated asynchronously after the panels mount, so consumers
that need to wait for restored values should check `props.hydrated` or
use `subscribe` to re-read once it flips.

## Methods

### get()

#### Call Signature

```ts
get<T>(key): T | undefined;
```

Defined in: [packages/sdk/src/extension-storage.ts:15](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L15)

Read a value. Returns `fallback` if the key is missing.

##### Type Parameters

###### T

`T`

##### Parameters

###### key

`string`

##### Returns

`T` \| `undefined`

#### Call Signature

```ts
get<T>(key, fallback): T;
```

Defined in: [packages/sdk/src/extension-storage.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L16)

##### Type Parameters

###### T

`T`

##### Parameters

###### key

`string`

###### fallback

`T`

##### Returns

`T`

***

### set()

```ts
set(key, value): void;
```

Defined in: [packages/sdk/src/extension-storage.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L18)

Write a value. `undefined` deletes the key.

#### Parameters

##### key

`string`

##### value

`unknown`

#### Returns

`void`

***

### subscribe()

```ts
subscribe(listener): () => void;
```

Defined in: [packages/sdk/src/extension-storage.ts:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L24)

Subscribe to changes in this namespace. Called on any set within this
namespace, and also whenever the underlying app state finishes hydrating
(so callers can re-read after persisted state loads).

#### Parameters

##### listener

() => `void`

#### Returns

() => `void`
