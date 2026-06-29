# Interface: WorkspaceStatusProvider

Defined in: [packages/sdk/src/workspace-service.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L107)

A status provider that contributes [WorkspaceStatusRow](WorkspaceStatusRow.md)s to
workspace rows in the Workspaces side panel. Register via
[WorkspaceService.registerStatus](WorkspaceService.md#registerstatus).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:109](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L109)

Unique id for this provider — conventionally `"<extension-id>.status"`.

## Methods

### provide()

```ts
provide(workspaceId): WorkspaceStatusRow[];
```

Defined in: [packages/sdk/src/workspace-service.ts:114](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L114)

Called synchronously for each workspace during render. Return an empty
array to contribute nothing for this workspace.

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceStatusRow`](WorkspaceStatusRow.md)[]
