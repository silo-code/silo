# Interface: SidePanelProps

Defined in: [packages/sdk/src/types.ts:313](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L313)

Props passed to a [SidePanel](SidePanel.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:315](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L315)

True when this side panel is currently visible / selected in its column.

***

### storage

```ts
storage: ExtensionStorage;
```

Defined in: [packages/sdk/src/types.ts:324](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L324)

Namespaced, persisted key/value storage scoped to this panel id (the
`workspace` scope of [ExtensionStorageScopes](ExtensionStorageScopes.md), keyed by panel rather
than extension). Use for **panel-local UI state** — scroll positions,
selections, expanded sections, etc. — which is kept per workspace. For
extension-level settings shared across surfaces and workspaces, use
[ExtensionContext.storage](ExtensionContext.md#storage)`.global` instead.

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/types.ts:330](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L330)

True once the persisted app state has finished loading from disk.
Panels should defer restoring values from `storage` until this is true
(or subscribe to `storage` and re-read when it flips).
