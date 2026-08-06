# Interface: WorkspacePropertyPage

Defined in: [packages/sdk/src/workspace-service.ts:163](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L163)

A tab contributed by an extension inside the workspace properties modal.
Register via [WorkspaceService.registerPropertyPage](WorkspaceService.md#registerpropertypage).

The modal always shows a tab bar; the built-in **General** tab (name,
folders) is first, followed by registered pages sorted by
[order](#order) within each extension.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:165](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L165)

Unique id, conventionally `"<extension-id>.properties"`.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:167](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L167)

Tab label shown in the tab bar.

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/workspace-service.ts:169](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L169)

Optional icon rendered to the left of the tab label.

***

### component

```ts
component: ComponentType<WorkspacePropertyPageProps>;
```

Defined in: [packages/sdk/src/workspace-service.ts:175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L175)

The React component rendered as the tab's content. Receives the
workspace being edited and the workspace service
([WorkspacePropertyPageProps](WorkspacePropertyPageProps.md)).

***

### visible?

```ts
optional visible?: (ws) => boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:181](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L181)

Whether this tab should appear for this workspace. Defaults to `true`
(always visible); return `false` to hide it for workspaces where the
extension is not relevant (e.g. a workspace with no git repo).

#### Parameters

##### ws

[`Workspace`](Workspace.md)

#### Returns

`boolean`

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/workspace-service.ts:186](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L186)

Sort order within this extension's contributions. Lower values appear
first. Defaults to `0`.
