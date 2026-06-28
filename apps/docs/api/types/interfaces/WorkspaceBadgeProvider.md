# Interface: WorkspaceBadgeProvider

Defined in: [packages/sdk/src/workspace-service.ts:89](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L89)

A badge provider that contributes [WorkspaceBadge](WorkspaceBadge.md)s next to the
workspace name in the Workspaces side panel. Register via
[WorkspaceService.registerBadge](WorkspaceService.md#registerbadge).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:91](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L91)

Unique id for this provider — conventionally `"<extension-id>.badges"`.

## Methods

### provide()

```ts
provide(workspaceId): WorkspaceBadge[];
```

Defined in: [packages/sdk/src/workspace-service.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L96)

Called synchronously for each workspace during render. Return an empty
array to contribute nothing for this workspace.

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceBadge`](WorkspaceBadge.md)[]
