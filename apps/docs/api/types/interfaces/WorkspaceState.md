# Interface: WorkspaceState

Defined in: [packages/sdk/src/workspace-service.ts:88](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L88)

An immutable, frozen view of workspace state, returned by
[WorkspaceService.getState](WorkspaceService.md#getstate) and delivered to subscribers — read
access without a Valtio dependency.

## Properties

### all

```ts
all: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L90)

All workspaces, in user-defined order.

***

### open

```ts
open: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L92)

Workspaces where closedAt is null/undefined, in user-defined order.

***

### closed

```ts
closed: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L94)

Workspaces where closedAt is set, sorted by closedAt descending.

***

### activeId

```ts
activeId: string | null;
```

Defined in: [packages/sdk/src/workspace-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L95)

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L97)

True once the persisted state has been loaded into the store.
