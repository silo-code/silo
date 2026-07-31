# Interface: WorkspaceState

Defined in: [packages/sdk/src/workspace-service.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L196)

An immutable, frozen view of workspace state, returned by
[WorkspaceService.getState](WorkspaceService.md#getstate) and delivered to subscribers — read
access without a Valtio dependency.

## Properties

### all

```ts
all: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:198](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L198)

All workspaces, in user-defined order.

***

### open

```ts
open: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:200](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L200)

Workspaces where closedAt is null/undefined, in user-defined order.

***

### closed

```ts
closed: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:202](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L202)

Workspaces where closedAt is set, sorted by closedAt descending.

***

### activeId

```ts
activeId: string | null;
```

Defined in: [packages/sdk/src/workspace-service.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L203)

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:205](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L205)

True once the persisted state has been loaded into the store.
