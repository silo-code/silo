# Interface: WorkspaceState

Defined in: [packages/sdk/src/workspace-service.ts:197](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L197)

An immutable, frozen view of workspace state, returned by
[WorkspaceService.getState](WorkspaceService.md#getstate) and delivered to subscribers — read
access without a Valtio dependency.

## Properties

### all

```ts
all: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:199](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L199)

All workspaces, in user-defined order.

***

### open

```ts
open: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:201](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L201)

Workspaces where closedAt is null/undefined, in user-defined order.

***

### closed

```ts
closed: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:203](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L203)

Workspaces where closedAt is set, sorted by closedAt descending.

***

### activeId

```ts
activeId: string | null;
```

Defined in: [packages/sdk/src/workspace-service.ts:204](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L204)

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:206](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L206)

True once the persisted state has been loaded into the store.
