# Interface: SidePanelProps

Defined in: [packages/sdk/src/types.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L254)

Props passed to a [SidePanel](SidePanel.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:256](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L256)

True when this side panel is currently visible / selected in its column.

***

### storage

```ts
storage: ExtensionStorage;
```

Defined in: [packages/sdk/src/types.ts:262](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L262)

Namespaced, persisted key/value storage scoped to this panel id.
Use for restoring UI state (scroll positions, selections, expanded
sections, etc.) across reloads.

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/types.ts:268](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L268)

True once the persisted app state has finished loading from disk.
Panels should defer restoring values from `storage` until this is true
(or subscribe to `storage` and re-read when it flips).
