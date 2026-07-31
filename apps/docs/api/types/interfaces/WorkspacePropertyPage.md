# Interface: WorkspacePropertyPage

Defined in: [packages/sdk/src/workspace-service.ts:162](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L162)

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

Defined in: [packages/sdk/src/workspace-service.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L164)

Unique id, conventionally `"<extension-id>.properties"`.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/workspace-service.ts:166](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L166)

Tab label shown in the tab bar.

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/workspace-service.ts:168](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L168)

Optional icon rendered to the left of the tab label.

***

### component

```ts
component: ComponentType<WorkspacePropertyPageProps>;
```

Defined in: [packages/sdk/src/workspace-service.ts:174](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L174)

The React component rendered as the tab's content. Receives the
workspace being edited and the workspace service
([WorkspacePropertyPageProps](WorkspacePropertyPageProps.md)).

***

### visible?

```ts
optional visible?: (ws) => boolean;
```

Defined in: [packages/sdk/src/workspace-service.ts:180](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L180)

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

Defined in: [packages/sdk/src/workspace-service.ts:185](https://github.com/silo-code/silo/blob/main/packages/sdk/src/workspace-service.ts#L185)

Sort order within this extension's contributions. Lower values appear
first. Defaults to `0`.
