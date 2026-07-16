# Interface: SidePanelProps

Defined in: [packages/sdk/src/types.ts:421](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L421)

Props passed to a [SidePanel](SidePanel.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:423](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L423)

True when this side panel is currently visible / selected in its column.

***

### storage

```ts
storage: ExtensionStorage;
```

Defined in: [packages/sdk/src/types.ts:432](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L432)

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

Defined in: [packages/sdk/src/types.ts:438](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L438)

True once the persisted app state has finished loading from disk.
Panels should defer restoring values from `storage` until this is true
(or subscribe to `storage` and re-read when it flips).
