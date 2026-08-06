# Interface: WorkspaceStatusProvider

Defined in: [packages/sdk/src/workspace-service.ts:117](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L117)

A status binder that contributes [WorkspaceStatusRow](WorkspaceStatusRow.md)s to
workspace rows in the Workspaces side panel. Prefer
[WorkspaceService.bindStatus](WorkspaceService.md#bindstatus); [WorkspaceService.registerStatus](WorkspaceService.md#registerstatus)
remains as a deprecated alias.

Unlike CenterDock tab `bindIndicator` (single adornment | null), status
and badge binders return an **array** — one projection may emit many rows.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:119](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L119)

Unique id for this binder — conventionally `"<extension-id>.status"`.

## Methods

### provide()

```ts
provide(workspaceId): WorkspaceStatusRow[];
```

Defined in: [packages/sdk/src/workspace-service.ts:124](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L124)

Called synchronously for each workspace during render. Return an empty
array to contribute nothing for this workspace.

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceStatusRow`](WorkspaceStatusRow.md)[]
