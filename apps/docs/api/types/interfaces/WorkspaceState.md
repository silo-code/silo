# Interface: WorkspaceState

Defined in: [packages/sdk/src/workspace-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L125)

An immutable, frozen view of workspace state, returned by
[WorkspaceService.getState](WorkspaceService.md#getstate) and delivered to subscribers — read
access without a Valtio dependency.

## Properties

### all

```ts
all: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L127)

All workspaces, in user-defined order.

***

### open

```ts
open: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L129)

Workspaces where closedAt is null/undefined, in user-defined order.

***

### closed

```ts
closed: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L131)

Workspaces where closedAt is set, sorted by closedAt descending.

***

### activeId

```ts
activeId: string | null;
```

Defined in: [packages/sdk/src/workspace-service.ts:132](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L132)

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L134)

True once the persisted state has been loaded into the store.
