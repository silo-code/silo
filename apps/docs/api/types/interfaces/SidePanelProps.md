# Interface: SidePanelProps

Defined in: [packages/sdk/src/types.ts:267](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L267)

Props passed to a [SidePanel](SidePanel.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L269)

True when this side panel is currently visible / selected in its column.

***

### storage

```ts
storage: ExtensionStorage;
```

Defined in: [packages/sdk/src/types.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L276)

Namespaced, persisted key/value storage scoped to this panel id. Use for
**panel-local UI state** — scroll positions, selections, expanded sections,
etc. — across reloads. For extension-level settings shared across surfaces,
use [ExtensionContext.storage](ExtensionContext.md#storage) instead.

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/types.ts:282](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L282)

True once the persisted app state has finished loading from disk.
Panels should defer restoring values from `storage` until this is true
(or subscribe to `storage` and re-read when it flips).
