# Interface: WorkspaceDecorationProvider

Defined in: [packages/sdk/src/workspace-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L70)

A decoration provider that contributes [WorkspaceStatusRow](WorkspaceStatusRow.md)s to
workspace rows in the Workspaces side panel. Register via
[WorkspaceService.registerDecoration](WorkspaceService.md#registerdecoration).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L72)

Unique id for this provider — conventionally `"<extension-id>.decoration"`.

## Methods

### provide()

```ts
provide(workspaceId): WorkspaceStatusRow[];
```

Defined in: [packages/sdk/src/workspace-service.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L77)

Called synchronously for each workspace during render. Return an empty
array to contribute nothing for this workspace.

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceStatusRow`](WorkspaceStatusRow.md)[]
