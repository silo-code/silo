# Interface: WorkspaceState

Defined in: [packages/sdk/src/workspace-service.ts:55](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L55)

An immutable, frozen view of workspace state, returned by
[WorkspaceService.getState](WorkspaceService.md#getstate) and delivered to subscribers — read
access without a Valtio dependency.

## Properties

### all

```ts
all: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L57)

All workspaces, in user-defined order.

***

### open

```ts
open: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L59)

Workspaces where closedAt is null/undefined, in user-defined order.

***

### closed

```ts
closed: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L61)

Workspaces where closedAt is set, sorted by closedAt descending.

***

### activeId

```ts
activeId: string | null;
```

Defined in: [packages/sdk/src/workspace-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L62)

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L64)

True once the persisted state has been loaded into the store.
