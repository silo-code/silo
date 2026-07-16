# Interface: WorkspaceState

Defined in: [packages/sdk/src/workspace-service.ts:187](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L187)

An immutable, frozen view of workspace state, returned by
[WorkspaceService.getState](WorkspaceService.md#getstate) and delivered to subscribers — read
access without a Valtio dependency.

## Properties

### all

```ts
all: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:189](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L189)

All workspaces, in user-defined order.

***

### open

```ts
open: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:191](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L191)

Workspaces where closedAt is null/undefined, in user-defined order.

***

### closed

```ts
closed: readonly Workspace[];
```

Defined in: [packages/sdk/src/workspace-service.ts:193](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L193)

Workspaces where closedAt is set, sorted by closedAt descending.

***

### activeId

```ts
activeId: string | null;
```

Defined in: [packages/sdk/src/workspace-service.ts:194](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L194)

***

### hydrated

```ts
hydrated: boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:196](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L196)

True once the persisted state has been loaded into the store.
