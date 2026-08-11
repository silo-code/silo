# Interface: WorkspaceBadgeProvider

Defined in: [packages/sdk/src/workspace-service.ts:95](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L95)

A badge binder that contributes [WorkspaceBadge](WorkspaceBadge.md)s next to the
workspace name in the Workspaces side panel. Prefer
[WorkspaceService.bindBadge](WorkspaceService.md#bindbadge); [WorkspaceService.registerBadge](WorkspaceService.md#registerbadge)
remains as a deprecated alias.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L97)

Unique id for this binder — conventionally `"<extension-id>.badges"`.

## Methods

### provide()

```ts
provide(workspaceId): WorkspaceBadge[];
```

Defined in: [packages/sdk/src/workspace-service.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L102)

Called synchronously for each workspace during render. Return an empty
array to contribute nothing for this workspace.

#### Parameters

##### workspaceId

`string`

#### Returns

[`WorkspaceBadge`](WorkspaceBadge.md)[]
