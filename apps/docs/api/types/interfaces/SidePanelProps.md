# Interface: SidePanelProps

Defined in: [packages/sdk/src/types.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L253)

Props passed to a [SidePanel](SidePanel.md) component.

## Properties

### active

```ts
active: boolean;
```

Defined in: [packages/sdk/src/types.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L255)

True when this side panel is currently visible / selected in its column.

***

### storage

```ts
storage: ExtensionStorage;
```

Defined in: [packages/sdk/src/types.ts:261](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L261)

Namespaced, persisted key/value storage scoped to this panel id.
Use for restoring UI state (scroll positions, selections, expanded
sections, etc.) across reloads.

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/types.ts:267](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L267)

True once the persisted app state has finished loading from disk.
Panels should defer restoring values from `storage` until this is true
(or subscribe to `storage` and re-read when it flips).
