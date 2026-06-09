# Interface: WorkspaceState

Defined in: [packages/sdk/src/workspace-service.ts:15](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L15)

An immutable, frozen view of workspace state, returned by
[WorkspaceService.getState](WorkspaceService.md#getstate) and delivered to subscribers — read
access without a Valtio dependency.

## Properties

### all

```ts
all: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:17](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L17)

All workspaces, in user-defined order.

***

### open

```ts
open: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:19](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L19)

Workspaces where closedAt is null/undefined, in user-defined order.

***

### closed

```ts
closed: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:21](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L21)

Workspaces where closedAt is set, sorted by closedAt descending.

***

### activeId

```ts
activeId: string | null;
```

Defined in: [packages/sdk/src/workspace-service.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L22)

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L24)

True once the persisted state has been loaded into the store.
