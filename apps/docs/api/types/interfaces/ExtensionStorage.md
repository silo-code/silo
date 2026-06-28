# Interface: ExtensionStorage

Defined in: [packages/sdk/src/extension-storage.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L16)

Namespaced, persisted key/value storage handed to extensions. Two scopes are
exposed on [ExtensionContext.storage](ExtensionContext.md#storage) ([ExtensionStorageScopes](ExtensionStorageScopes.md)):
`global` (one bag per extension, shared across every workspace) and
`workspace` (one bag per extension × the active workspace). Side panels also
receive a workspace-scoped bag keyed by panel id via `SidePanelProps.storage`.

Values persist alongside the rest of the app state. The store hydrates
asynchronously, and the workspace bag is swapped when the active workspace
changes, so consumers that need to react to restored or switched values
should [subscribe](#subscribe) and re-read.

## Methods

### get()

#### Call Signature

```ts
get<T>(key): T | undefined;
```

Defined in: [packages/sdk/src/extension-storage.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L18)

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

Defined in: [packages/sdk/src/extension-storage.ts:19](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L19)

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

Defined in: [packages/sdk/src/extension-storage.ts:21](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L21)

Write a value. `undefined` deletes the key.

#### Parameters

##### key

`string`

##### value

`unknown`

#### Returns

`void`

***

### keys()

```ts
keys(): string[];
```

Defined in: [packages/sdk/src/extension-storage.ts:23](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L23)

The keys currently set in this namespace.

#### Returns

`string`[]

***

### subscribe()

```ts
subscribe(listener): () => void;
```

Defined in: [packages/sdk/src/extension-storage.ts:30](https://github.com/silo-code/silo/blob/main/packages/sdk/src/extension-storage.ts#L30)

Subscribe to changes in this namespace. Called when a value in this
namespace changes, when the underlying app state finishes hydrating, and
(for the workspace scope) when the active workspace changes. Returns an
unsubscribe function.

#### Parameters

##### listener

() => `void`

#### Returns

() => `void`
