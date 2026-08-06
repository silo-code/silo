# Interface: WorkspaceSectionProvider

Defined in: [packages/sdk/src/workspace-service.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L58)

A section provider that mounts a React component inside workspace rows in the
Workspaces side panel. Register via [WorkspaceService.registerSection](WorkspaceService.md#registersection).

Sections appear below the path line and any status rows. Multiple
providers stack vertically in ascending [WorkspaceSectionProvider.order](#order)
order. Return `null` from your component for workspaces where the section
should not appear — this produces no DOM node and no visual gap.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L60)

Unique id, conventionally `"<extension-id>.section"`.

***

### component

```ts
component: ComponentType<WorkspaceSectionProps>;
```

Defined in: [packages/sdk/src/workspace-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L62)

The React component mounted once per workspace row.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/workspace-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L64)

Sort order among sections. Lower values appear first. Defaults to `0`.
